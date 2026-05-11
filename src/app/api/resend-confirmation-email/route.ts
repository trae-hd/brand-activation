import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { withRedisHealth } from "@/lib/redis/health";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { hmac } from "@/lib/crypto/hmac";
import { emailProvider } from "@/lib/email/provider";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { env } from "@/lib/env";

/**
 * Body shape mirrors `/api/register` exactly so Phase 5's rewire of the
 * success-page Resend button is a URL change with zero payload diff.
 * `consentVersion` is accepted but not used here — the resend gate is
 * `Registration.status === 'VERIFIED'`, not consent-version match.
 */
const Body = z.object({
  activationId: z.string().min(1),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  consentVersion: z.string().min(1),
});

/**
 * Anti-enumeration baseline-time floor. Every request that passes body
 * validation responds no faster than this so an attacker can't distinguish
 * "verified email, send happened" from "no row found" or "rate-limited" by
 * watching response times. The slowest legitimate path (full Resend send)
 * lives well above this floor; the floor only pads the fast paths up.
 */
const TIMING_FLOOR_MS = 150;

const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_SECONDS = 60 * 5; // 5 minutes
const PER_EMAIL_LIMIT = 3;
const PER_EMAIL_WINDOW_SECONDS = 60 * 60; // 1 hour

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  // Body parse / validation failures bypass the floor — they're a generic
  // API-shape signal (404-equivalent), not an enumeration vector for the
  // verified-email set.
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { activationId, email } = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const ipHash = hmac.ip(ip);
  const emailHash = hmac.email(email);

  return withRedisHealth(async () => {
    const work = async (): Promise<void> => {
      // ── Rate limit: per IP. Catches blanket scraping. ─────────────
      const ipOk = await fixedWindow({
        key: `resend:ip:${ipHash}`,
        limit: PER_IP_LIMIT,
        windowSeconds: PER_IP_WINDOW_SECONDS,
      });
      if (!ipOk) {
        await writeAuditLog({
          category: "SECURITY",
          action: "participant.resend_rate_limited",
          targetType: "Activation",
          targetId: activationId,
          metadata: { emailHash, scope: "ip" },
          ipHash,
        });
        return;
      }

      // ── Rate limit: per (activation, email-hash). Caps how often a
      // given participant can request a resend. ─────────────────────
      const emailOk = await fixedWindow({
        key: `resend:email:${activationId}:${emailHash}`,
        limit: PER_EMAIL_LIMIT,
        windowSeconds: PER_EMAIL_WINDOW_SECONDS,
      });
      if (!emailOk) {
        await writeAuditLog({
          category: "SECURITY",
          action: "participant.resend_rate_limited",
          targetType: "Activation",
          targetId: activationId,
          metadata: { emailHash, scope: "activation_email" },
          ipHash,
        });
        return;
      }

      // ── Lookup. Joined with the activation for the email body. ────
      const reg = await prisma.registration.findUnique({
        where: { activationId_emailHash: { activationId, emailHash } },
        select: {
          id: true,
          email: true,
          status: true,
          entryCode: true,
          activation: { select: { name: true, endsAt: true } },
        },
      });

      // No-op: row missing, not VERIFIED, or no entry code to convey.
      // No audit row — the rate-limit row above is the only signal we
      // leave for not-found/not-verified/no-code paths.
      if (!reg || reg.status !== "VERIFIED" || !reg.entryCode) return;

      // ── Send. Same provider method as the verify-time send. The
      // `cause: 'resend'` discriminator on the audit metadata
      // distinguishes this from the initial confirmation. The template
      // still renders the verify-variant copy in this phase; the
      // resend-variant headline arrives in Phase 5. ─────────────────
      const supportEmail = env.SUPPORT_EMAIL ?? env.EMAIL_FROM;
      const result = await emailProvider.sendEntryCodeConfirmation({
        to: reg.email,
        entryCode: reg.entryCode,
        activationName: reg.activation.name,
        activationEndsAt: reg.activation.endsAt,
        supportEmail,
        cause: "resend",
      });

      if (result.ok) {
        await prisma.registration.update({
          where: { id: reg.id },
          data: { confirmationEmailSentAt: new Date() },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "participant.confirmation_email_sent",
          targetType: "Registration",
          targetId: reg.id,
          metadata: {
            emailHash,
            resendMessageId: result.messageId,
            cause: "resend",
          },
          ipHash,
        });
      } else {
        // reason / attempts / lastError sourced from the Phase 3
        // classifier — never hardcoded.
        await writeAuditLog({
          category: "ADMIN",
          action: "participant.confirmation_email_failed",
          targetType: "Registration",
          targetId: reg.id,
          metadata: {
            emailHash,
            reason: result.reason,
            attempts: result.attempts,
            lastError: result.lastError,
            cause: "resend",
          },
          ipHash,
        });
      }
    };

    await Promise.all([work(), sleep(TIMING_FLOOR_MS)]);
    return NextResponse.json({ ok: true }, { status: 202 });
  });
}

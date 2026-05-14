import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { withRedisHealth } from "@/lib/redis/health";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { hmac } from "@/lib/crypto/hmac";
import { issueOtp } from "@/lib/otp/issue";
import { signPendingToken } from "@/lib/otp/pendingToken";
import { emailProvider } from "@/lib/email/provider";
import { Prisma } from "@prisma/client";

// `required` snapshots the consent item's required flag at the moment the
// participant submitted, so the audit trail in consentItemsAccepted remains
// unambiguous even if the activation's items are later edited. Older clients
// (pre-required-flag) won't send the field — default to true so the audit
// record reflects the original "all-required" semantics.
const ConsentItemAccepted = z.object({
  text: z.string(),
  accepted: z.boolean(),
  required: z.boolean().default(true),
});

const Body = z.object({
  activationId: z.string().min(1),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  consentVersion: z.string().min(1),
  boothCode: z.string().nullable().optional(),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  mrqContactConsent: z.boolean(),
  consentItemsAccepted: z.array(ConsentItemAccepted).optional(),
});

const OK_202 = (pendingToken: string) =>
  NextResponse.json({ pendingToken }, { status: 202 });
const ERR = (status: number) => NextResponse.json({ ok: false }, { status });

export async function POST(req: Request) {
  return withRedisHealth(async () => {
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return ERR(400);
    const { activationId, email, consentVersion, boothCode, utmSource, utmMedium, utmCampaign, mrqContactConsent, consentItemsAccepted } =
      parsed.data;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const userAgent = req.headers.get("user-agent") ?? "";
    const ipHash = hmac.ip(ip);
    const userAgentHash = hmac.ip(userAgent);
    const emailHash = hmac.email(email);

    const ipOk = await fixedWindow({ key: `rl:ip:register:${ipHash}`, limit: 30, windowSeconds: 60 });
    if (!ipOk) return ERR(429);

    const emailOk = await fixedWindow({
      key: `rl:email:register:${activationId}:${emailHash}`,
      limit: 5,
      windowSeconds: 60 * 10,
    });
    if (!emailOk) return ERR(429);

    const activation = await prisma.activation.findUnique({
      where: { id: activationId },
      select: { id: true, status: true, consentVersion: true, primaryColor: true },
    });

    // No-op for any state that shouldn't issue an OTP; opaque shape preserved.
    if (
      !activation ||
      activation.status !== "LIVE" ||
      activation.consentVersion !== consentVersion
    ) {
      return OK_202(signPendingToken({ kind: "noop" }));
    }

    let registrationId: string;
    try {
      const reg = await prisma.registration.upsert({
        where: { activationId_emailHash: { activationId, emailHash } },
        update: {},
        create: {
          activationId,
          email,
          emailHash,
          status: "PENDING",
          boothCode: boothCode ?? null,
          utmSource: utmSource ?? null,
          utmMedium: utmMedium ?? null,
          utmCampaign: utmCampaign ?? null,
          ipHash,
          userAgentHash,
          consentVersion,
          consentAcceptedAt: new Date(),
          mrqContactConsent,
          consentItemsAccepted: consentItemsAccepted ?? [],
        },
        select: { id: true, status: true },
      });
      registrationId = reg.id;
      if (reg.status === "VERIFIED") {
        return OK_202(signPendingToken({ kind: "noop" }));
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const existing = await prisma.registration.findUniqueOrThrow({
          where: { activationId_emailHash: { activationId, emailHash } },
          select: { id: true, status: true },
        });
        if (existing.status === "VERIFIED") return OK_202(signPendingToken({ kind: "noop" }));
        registrationId = existing.id;
      } else {
        throw e;
      }
    }

    const { otp } = await issueOtp(registrationId);

    const sendResult = await emailProvider.sendOtp({ to: email, otp, primaryColor: activation.primaryColor });
    if (!sendResult.ok) return ERR(503);

    return OK_202(signPendingToken({ kind: "issued", registrationId }));
  });
}

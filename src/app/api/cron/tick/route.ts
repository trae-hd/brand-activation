import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Replay window for signed cron requests. Keep tight: cron jobs fire within
// seconds of their schedule, so 5 minutes is generous and bounds replay risk
// if a signed URL ever leaks (logs, error reports, etc.).
const SIGNATURE_MAX_AGE_SECONDS = 300;

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Accepts either:
//   1. Signed request (preferred): headers `x-cron-timestamp: <unix-seconds>`
//      and `x-cron-signature: <hex HMAC-SHA256(secret, "<ts>:GET:/api/cron/tick")>`.
//      Signature is timestamp-bound so a leaked header pair expires.
//   2. Legacy: `Authorization: Bearer <CRON_SECRET>` — kept so existing Railway
//      cron jobs keep working until they're migrated to signed requests.
function authorize(req: NextRequest): { ok: true; mode: "signed" | "bearer" } | { ok: false } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false };

  const ts = req.headers.get("x-cron-timestamp");
  const sig = req.headers.get("x-cron-signature");
  if (ts && sig) {
    const tsNum = parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return { ok: false };
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - tsNum) > SIGNATURE_MAX_AGE_SECONDS) return { ok: false };
    const expected = createHmac("sha256", secret)
      .update(`${ts}:GET:/api/cron/tick`)
      .digest("hex");
    if (!safeEq(expected, sig)) return { ok: false };
    return { ok: true, mode: "signed" };
  }

  const authz = req.headers.get("authorization");
  if (authz && safeEq(authz, `Bearer ${secret}`)) return { ok: true, mode: "bearer" };

  return { ok: false };
}

export async function GET(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [toActivate, toEnd] = await Promise.all([
    prisma.activation.findMany({
      where: { status: "SCHEDULED", reviewStatus: "APPROVED", startsAt: { lte: now } },
      select: { id: true, slug: true },
    }),
    prisma.activation.findMany({
      where: { status: "LIVE", endsAt: { lte: now } },
      select: { id: true, slug: true },
    }),
  ]);

  const activated: string[] = [];
  const ended: string[] = [];
  const errors: string[] = [];

  for (const a of toActivate) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.activation.update({ where: { id: a.id }, data: { status: "LIVE" } });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.status.scheduled.live",
          targetType: "Activation",
          targetId: a.id,
          metadata: { trigger: "cron", slug: a.slug },
          tx,
        });
      });
      revalidateTag(`activation:${a.slug}`, { expire: 0 });
      activated.push(a.slug);
    } catch {
      errors.push(`activate:${a.slug}`);
    }
  }

  for (const a of toEnd) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.activation.update({ where: { id: a.id }, data: { status: "ENDED" } });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.status.live.ended",
          targetType: "Activation",
          targetId: a.id,
          metadata: { trigger: "cron", slug: a.slug },
          tx,
        });
      });
      revalidateTag(`activation:${a.slug}`, { expire: 0 });
      ended.push(a.slug);
    } catch {
      errors.push(`end:${a.slug}`);
    }
  }

  // Audit every invocation. The query above does not write a row when the
  // result set is empty, so without this log we'd have no record that the
  // cron actually ran. Wrapped so an audit failure never breaks the cron.
  try {
    await writeAuditLog({
      category: "SECURITY",
      action: "cron.tick",
      metadata: {
        authMode: auth.mode,
        activated: activated.length,
        ended: ended.length,
        errors: errors.length,
      },
    });
  } catch (err) {
    console.error("[cron] failed to write cron.tick audit log", err);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    ts: now.toISOString(),
    activated,
    ended,
    ...(errors.length > 0 && { errors }),
  });
}

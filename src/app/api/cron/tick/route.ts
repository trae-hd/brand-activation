import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
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

  return NextResponse.json({
    ok: errors.length === 0,
    ts: now.toISOString(),
    activated,
    ended,
    ...(errors.length > 0 && { errors }),
  });
}

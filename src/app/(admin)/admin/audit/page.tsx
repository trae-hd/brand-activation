import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { AuditClient } from "./AuditClient";
import type { AuditRowDisplay } from "./AuditClient";

const TAKE = 500;

export default async function AuditPage() {
  await requireRole("ANY");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: TAKE,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  });

  const serialized: AuditRowDisplay[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorEmail: r.actor?.email ?? null,
    actorName: r.actor?.name ?? null,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminShell>
      <AuditClient rows={serialized} />
    </AdminShell>
  );
}

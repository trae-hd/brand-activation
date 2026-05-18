import { Suspense } from "react";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { ActivationListClient } from "@/components/admin/ActivationListClient";

export default async function AdminHomePage() {
  const session = await requireRole("ANY");
  const userRole = session.user.role ?? "MEMBER";

  const raw = await prisma.activation.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      reviewStatus: true,
      startsAt: true,
      endsAt: true,
      archivedAt: true,
      _count: { select: { booths: true } },
      registrations: {
        where: { status: { in: ["VERIFIED", "PENDING"] }, isTest: false },
        select: { status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const activations = raw.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    status: a.status,
    reviewStatus: a.reviewStatus,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
    boothCount: a._count.booths,
    verifiedCount: a.registrations.filter((r) => r.status === "VERIFIED").length,
    pendingCount: a.registrations.filter((r) => r.status === "PENDING").length,
  }));

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">Activations</h1>
      <Suspense fallback={<div />}>
        <ActivationListClient activations={activations} userRole={userRole} />
      </Suspense>
    </AdminShell>
  );
}

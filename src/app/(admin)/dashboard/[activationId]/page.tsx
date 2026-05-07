import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { DashboardClient } from "@/components/admin/DashboardClient";
import { RegistrationsTable } from "@/components/admin/RegistrationsTable";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ activationId: string }>;
}) {
  await requireRole("ANY");
  const { activationId } = await params;

  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: {
      id: true,
      name: true,
      status: true,
      endsAt: true,
      consentItems: true,
      mrqContactConsentEnabled: true,
      entryCodePrefix: true,
    },
  });
  if (!activation) notFound();

  return (
    <AdminShell>
      <div className="space-y-10">
        <DashboardClient
          activationId={activation.id}
          activationName={activation.name}
          status={activation.status}
          endsAt={activation.endsAt.toISOString()}
        />
        <RegistrationsTable
          activationId={activation.id}
          consentItems={activation.consentItems}
          mrqContactConsentEnabled={activation.mrqContactConsentEnabled}
          entryCodePrefix={activation.entryCodePrefix}
        />
      </div>
    </AdminShell>
  );
}

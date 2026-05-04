import { Suspense } from "react";
import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { ActivationForm } from "@/components/admin/ActivationForm";
import { env } from "@/lib/env";

export default async function NewActivationPage() {
  const session = await requireRole("ANY");

  return (
    <AdminShell>
      <Suspense fallback={<div />}>
        <ActivationForm
          mode="create"
          userRole={session.user.role}
          currentUserId={session.user.adminUserId ?? undefined}
          participantBaseUrl={env.PUBLIC_BASE_URL}
        />
      </Suspense>
    </AdminShell>
  );
}

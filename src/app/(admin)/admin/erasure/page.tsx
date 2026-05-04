import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { AccessDenied } from "@/components/shared/AccessDenied";
import { ErasureClient } from "./ErasureClient";

export default async function ErasurePage() {
  const session = await requireRole("ANY");
  const isAdmin = session.user.role === "ADMIN";

  return (
    <AdminShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Right to Erasure</h1>
        {isAdmin ? <ErasureClient /> : <AccessDenied />}
      </div>
    </AdminShell>
  );
}

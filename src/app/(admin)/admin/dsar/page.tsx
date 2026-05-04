import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { AccessDenied } from "@/components/shared/AccessDenied";
import { DsarClient } from "./DsarClient";

export default async function DsarPage() {
  const session = await requireRole("ANY");
  const isAdmin = session.user.role === "ADMIN";

  return (
    <AdminShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Data Subject Access Request</h1>
        {isAdmin ? <DsarClient /> : <AccessDenied />}
      </div>
    </AdminShell>
  );
}

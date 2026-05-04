import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireRole("ANY");
  const role = session.user.role ?? "MEMBER";
  return (
    <AdminShell>
      <SettingsClient role={role} />
    </AdminShell>
  );
}

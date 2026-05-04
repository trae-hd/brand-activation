import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { AccessDenied } from "@/components/shared/AccessDenied";
import { UsersClient } from "@/components/admin/UsersClient";

export default async function UsersPage() {
  const session = await requireRole("ANY");
  const isAdmin = session.user.role === "ADMIN";

  return (
    <AdminShell>
      {isAdmin ? (
        <UsersClient currentUserId={session.user.adminUserId!} />
      ) : (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Users &amp; Roles</h1>
          <AccessDenied />
        </div>
      )}
    </AdminShell>
  );
}

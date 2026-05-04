import { requireRole } from "@/lib/auth/requireRole";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { FeedbackClient } from "./FeedbackClient";

export default async function FeedbackPage() {
  await requireRole("ANY");
  return (
    <AdminShell>
      <FeedbackClient />
    </AdminShell>
  );
}

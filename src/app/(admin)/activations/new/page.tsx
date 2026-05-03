import { requireRole } from "@/lib/auth/requireRole";
import { ActivationForm } from "@/components/admin/ActivationForm";

export default async function NewActivationPage() {
  await requireRole("ADMIN");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <ActivationForm mode="create" />
    </main>
  );
}

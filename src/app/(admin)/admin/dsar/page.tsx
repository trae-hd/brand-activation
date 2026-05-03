import { requireRole } from "@/lib/auth/requireRole";
import { DsarClient } from "./DsarClient";

export default async function DsarPage() {
  await requireRole("ADMIN");

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Data Subject Access Request</h1>
      <DsarClient />
    </main>
  );
}

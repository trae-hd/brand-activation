import { requireRole } from "@/lib/auth/requireRole";
import { ErasureClient } from "./ErasureClient";

export default async function ErasurePage() {
  await requireRole("ADMIN");

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Right to Erasure</h1>
        <p className="mt-1 text-xs text-muted-foreground">ADMIN only</p>
      </div>
      <ErasureClient />
    </main>
  );
}

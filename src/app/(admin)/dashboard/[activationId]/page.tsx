import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { LiveCounter } from "@/components/admin/LiveCounter";
import { RegistrationsTable } from "@/components/admin/RegistrationsTable";
import { BoothQrButton } from "@/components/shared/BoothQrButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SCHEDULED: "secondary",
  LIVE: "default",
  ENDED: "destructive",
};

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
      slug: true,
      status: true,
      booths: {
        select: { id: true, code: true, label: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!activation) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{activation.name}</h1>
          <Badge variant={STATUS_VARIANT[activation.status] ?? "outline"}>
            {activation.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/activations/${activationId}/edit`}>Edit activation</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/admin/registrations/export?activationId=${activationId}`}
              download
            >
              Download CSV
            </a>
          </Button>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Live counts</h2>
        <LiveCounter activationId={activationId} />
      </section>

      {activation.booths.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Booth QR codes</h2>
          <div className="flex flex-wrap gap-3">
            {activation.booths.map((booth) => (
              <div
                key={booth.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-mono">{booth.code}</span>
                <span className="text-muted-foreground">{booth.label}</span>
                <BoothQrButton activationId={activationId} boothCode={booth.code} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Verified registrations
        </h2>
        <RegistrationsTable activationId={activationId} />
      </section>
    </main>
  );
}

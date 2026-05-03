import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActivationStatus } from "@prisma/client";

function statusVariant(status: ActivationStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "LIVE") return "default";
  if (status === "ENDED") return "destructive";
  if (status === "SCHEDULED") return "secondary";
  return "outline";
}

export default async function AdminHomePage() {
  await requireRole("ANY");

  const activations = await prisma.activation.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      startsAt: true,
      endsAt: true,
      legalApproved: true,
      _count: { select: { registrations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activations</h1>
        <Button asChild>
          <Link href="/activations/new">New activation</Link>
        </Button>
      </div>

      {activations.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          No activations yet.{" "}
          <Link href="/activations/new" className="underline underline-offset-4">
            Create your first one.
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Starts</th>
                <th className="px-4 py-3 text-left font-medium">Ends</th>
                <th className="px-4 py-3 text-right font-medium">Registrations</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {activations.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    {a.name}
                    {!a.legalApproved && a.status === "DRAFT" && (
                      <span className="ml-2 text-xs text-amber-600">needs approval</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{a.slug}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.startsAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.endsAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{a._count.registrations}</td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/activations/${a.id}/edit`}>Edit</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

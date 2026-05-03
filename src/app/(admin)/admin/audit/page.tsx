import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import type { AuditCategory } from "@prisma/client";
import Link from "next/link";

const TAKE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ANY");
  const sp = await searchParams;

  const category = (sp.category as AuditCategory | undefined) ?? undefined;
  const actorId = sp.actorId ?? undefined;
  const targetType = sp.targetType ?? undefined;
  const cursor = sp.cursor ?? undefined;

  const rows = await prisma.auditLog.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(actorId ? { actorId } : {}),
      ...(targetType ? { targetType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: TAKE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      category: true,
      action: true,
      actorId: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      metadata: true,
      actor: { select: { name: true, email: true } },
    },
  });

  const hasMore = rows.length > TAKE;
  if (hasMore) rows.pop();
  const nextCursor = hasMore ? rows[rows.length - 1]?.id : undefined;

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { category, actorId, targetType, cursor, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return `/admin/audit?${params.toString()}`;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>

      {/* Filter bar */}
      <form method="GET" className="flex flex-wrap gap-2 text-sm">
        <select
          name="category"
          defaultValue={category ?? ""}
          className="rounded-md border px-2 py-1"
        >
          <option value="">All categories</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SECURITY">SECURITY</option>
        </select>
        <input
          name="targetType"
          placeholder="Target type (e.g. Activation)"
          defaultValue={targetType ?? ""}
          className="rounded-md border px-2 py-1"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
        >
          Filter
        </button>
        {(category || actorId || targetType) && (
          <Link href="/admin/audit" className="rounded-md border px-3 py-1">
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No audit entries found.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.createdAt).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                </td>
                <td className="px-3 py-2 text-xs">{row.category}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-3 py-2 text-xs">
                  {row.actor ? (
                    <span title={row.actor.email}>{row.actor.name}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {row.targetType && row.targetId
                    ? `${row.targetType}:${row.targetId}`
                    : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs max-w-xs truncate">
                  {row.metadata ? JSON.stringify(row.metadata) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 text-sm">
        {cursor && (
          <Link
            href={buildUrl({ cursor: undefined })}
            className="rounded-md border px-3 py-1"
          >
            First page
          </Link>
        )}
        {nextCursor && (
          <Link
            href={buildUrl({ cursor: nextCursor })}
            className="rounded-md border px-3 py-1"
          >
            Next →
          </Link>
        )}
      </div>
    </main>
  );
}

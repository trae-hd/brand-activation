"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Input } from "@/components/ui/input";
import type { MrqAccountStatus } from "@prisma/client";

type StatusFilter = "ALL" | "VERIFIED" | "PENDING" | "EXPIRED";

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Pending", value: "PENDING" },
  { label: "Expired", value: "EXPIRED" },
];

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    hour12: false,
  }).format(new Date(d));
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    hour12: false,
  }).format(new Date(d));
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "VERIFIED"
      ? "bg-[--ok]/15 text-[--ok]"
      : status === "PENDING"
      ? "bg-accent/15 text-accent"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

const MRQ_STATUS_CONFIG: Record<MrqAccountStatus, { label: string; cls: string } | null> = {
  UNKNOWN: null,
  ACTIVE: { label: "Active", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  INACTIVE: { label: "Inactive", cls: "bg-muted text-muted-foreground" },
  NOT_FOUND: { label: "No account", cls: "bg-muted text-muted-foreground/60" },
};

function MrqAccountBadge({ status }: { status: MrqAccountStatus }) {
  const config = MRQ_STATUS_CONFIG[status];
  if (!config) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.cls}`}>
      {config.label}
    </span>
  );
}

interface Props {
  activationId: string;
}

export function RegistrationsTable({ activationId }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const revealMutation = trpcReact.registration.revealEmail.useMutation();
  const enrichMutation = trpcReact.registration.enrich.useMutation();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    trpcReact.registration.list.useInfiniteQuery(
      { activationId, take: 50, status: statusFilter },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages.at(-1)?.total ?? null;

  const searchLower = search.toLowerCase();
  const visibleItems = searchLower
    ? items.filter(
        (r) =>
          r.email.toLowerCase().includes(searchLower) ||
          r.emailHash.toLowerCase().startsWith(searchLower)
      )
    : items;

  const lastEnrichedAt = items.reduce<Date | null>((max, r) => {
    if (!r.mrqEnrichedAt) return max;
    const d = new Date(r.mrqEnrichedAt);
    return !max || d > max ? d : max;
  }, null);

  async function handleReveal(id: string) {
    await revealMutation.mutateAsync({ registrationId: id });
    setRevealed((prev) => new Set([...prev, id]));
  }

  async function handleEnrich() {
    await enrichMutation.mutateAsync({ activationId });
    await refetch();
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Registrations{total != null ? ` · ${total}` : ""}
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEnrich}
            disabled={enrichMutation.isPending}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {enrichMutation.isPending
              ? "Checking…"
              : enrichMutation.isSuccess
              ? `✓ Checked ${enrichMutation.data.enriched}`
              : "Check MRQ accounts"}
          </button>
          {lastEnrichedAt && !enrichMutation.isPending && (
            <span className="text-xs text-muted-foreground/60">
              Last checked {fmtDate(lastEnrichedAt)}
            </span>
          )}
          <a
            href={`/api/admin/registrations/export?activationId=${activationId}`}
            download
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            CSV ↓
          </a>
        </div>
      </div>

      {/* Filter pills + search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={
              statusFilter === value
                ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <Input
          placeholder="Search email or hash…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-52 text-sm"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Verified at</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Booth</th>
              <th className="px-4 py-3 text-left font-medium">UTM</th>
              <th className="px-4 py-3 text-left font-medium">IP hash</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">MRQ account</th>
              <th className="px-4 py-3 text-left font-medium">MRQ joined</th>
              <th className="px-4 py-3 text-left font-medium">MRQ last login</th>
              <th className="px-4 py-3">
                <span className="sr-only">Reveal</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {data ? "No registrations match." : "Loading…"}
                </td>
              </tr>
            ) : (
              visibleItems.map((r) => {
                const isRevealed = revealed.has(r.id);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {fmtTime(r.verifiedAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {isRevealed ? r.email : maskEmail(r.email)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.boothCode ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {r.utmSource ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.ipHash.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MrqAccountBadge status={r.mrqAccountStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {fmtDate(r.mrqRegisteredAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {fmtDate(r.mrqLastLoginAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!isRevealed && (
                        <button
                          onClick={() => handleReveal(r.id)}
                          disabled={revealMutation.isPending}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                        >
                          reveal
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {visibleItems.length}
          {total != null ? ` of ${total}` : ""}. Reveal logs to audit.
        </span>
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="underline-offset-4 hover:underline disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more →"}
          </button>
        )}
      </div>
    </div>
  );
}

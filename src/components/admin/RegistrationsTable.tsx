"use client";

import { useEffect, useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Input } from "@/components/ui/input";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationStatus, AdminRole, MrqAccountStatus } from "@prisma/client";
import { PickWinnersButton } from "./winner/PickWinnersButton";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/** Debounce a value so search inputs don't refire a query on every keystroke. */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

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

interface ConsentItemAccepted {
  text: string;
  accepted: boolean;
}

function parseConsentItemsAccepted(raw: unknown): ConsentItemAccepted[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is ConsentItemAccepted =>
      x !== null &&
      typeof x === "object" &&
      typeof (x as ConsentItemAccepted).text === "string" &&
      typeof (x as ConsentItemAccepted).accepted === "boolean",
  );
}

function parseActivationConsentItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x !== null && typeof x === "object" && typeof (x as { text?: unknown }).text === "string")
    .map((x) => String((x as { text: string }).text));
}

function ConsentCheck({ accepted }: { accepted: boolean }) {
  return (
    <span className={accepted ? "text-green-600 dark:text-green-400" : "text-muted-foreground/50"}>
      {accepted ? "✓" : "✗"}
    </span>
  );
}

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
  activationStatus: ActivationStatus;
  userRole: AdminRole;
  consentItems: unknown;
  mrqContactConsentEnabled: boolean;
  /** Entry-code prefix for this activation, e.g. "WC". Used as a non-editable
   *  affix on the entry-code search input. When null, the activation never
   *  generates entry codes and the entry-code search is hidden. */
  entryCodePrefix: string | null;
}

export function RegistrationsTable({
  activationId,
  activationStatus,
  userRole,
  consentItems,
  mrqContactConsentEnabled,
  entryCodePrefix,
}: Props) {
  const consentLabels = parseActivationConsentItems(consentItems);
  // +1 for the hardcoded Age Consent column that always appears first
  const consentColCount = 1 + consentLabels.length + (mrqContactConsentEnabled ? 1 : 0);
  const hasEntryCodes = !!entryCodePrefix && entryCodePrefix.trim().length > 0;
  const codePrefixUpper = (entryCodePrefix ?? "").toUpperCase();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [mrqConsentFilter, setMrqConsentFilter] = useState<boolean | null>(null);
  const [search, setSearch] = useState(""); // client-side filter on current page (email/hash)
  const [entryCodeSearch, setEntryCodeSearch] = useState(""); // server-side, suffix only
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  // Reset to page 1 whenever a filter or page size changes — otherwise we
  // could land on a page index that no longer exists in the new result set.
  // React 19 flags setState-in-effect as cascading; comparing against a
  // tracked key during render achieves the same with one fewer render.
  const filterKey = `${statusFilter}|${String(mrqConsentFilter)}|${pageSize}|${entryCodeSearch}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const debouncedEntryCodeSearch = useDebounced(entryCodeSearch, 300);

  const revealMutation = trpcReact.registration.revealEmail.useMutation();
  const revealAllMutation = trpcReact.registration.revealAllEmails.useMutation();
  const enrichMutation = trpcReact.registration.enrich.useMutation();

  const { data, refetch, isFetching } = trpcReact.registration.list.useQuery({
    activationId,
    page,
    pageSize,
    status: statusFilter,
    mrqContactConsent: mrqConsentFilter ?? undefined,
    entryCodeQuery: debouncedEntryCodeSearch.trim() || undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? null;
  const totalPages = data?.totalPages ?? 1;

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

  async function handleToggleReveal(id: string) {
    if (revealed.has(id)) {
      // Hiding back is purely client-side — no audit entry. The original
      // reveal is already logged; re-hiding is just visual restoration.
      setRevealed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    await revealMutation.mutateAsync({ registrationId: id });
    setRevealed((prev) => new Set([...prev, id]));
  }

  // True when at least one row on the current page is still masked. Drives
  // the header button label/behaviour: when there's anything left to reveal,
  // the action is "Reveal all"; otherwise it flips to "Hide all".
  const someStillHidden = items.some((r) => !revealed.has(r.id));

  async function handleToggleRevealAll() {
    if (!someStillHidden) {
      // Hide all — purely client-side (matches single-row hide semantics).
      setRevealed(new Set());
      return;
    }
    await revealAllMutation.mutateAsync({ activationId });
    setRevealed((prev) => new Set([...prev, ...items.map((r) => r.id)]));
  }

  async function handleEnrich() {
    await enrichMutation.mutateAsync({ activationId });
    await refetch();
  }

  return (
    <div className="space-y-3">
      {/* Header — mobile-first: title sits on its own row on narrow screens
          and actions wrap below; on sm+ they share the row with justify-between. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">
          Registrations{total != null ? ` · ${total}` : ""}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {items.length > 0 && (
            <button
              onClick={handleToggleRevealAll}
              disabled={revealAllMutation.isPending}
              className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              aria-label={someStillHidden ? "Reveal all emails on this page" : "Hide all emails on this page"}
            >
              <DynamicIcon
                name={someStillHidden ? "Eye" : "EyeOff"}
                className="h-3.5 w-3.5"
              />
              {revealAllMutation.isPending
                ? "Revealing…"
                : someStillHidden
                ? "Reveal all"
                : "Hide all"}
            </button>
          )}
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
          <a
            href={`/api/admin/registrations/export?activationId=${activationId}${mrqConsentFilter === true ? "&mrqContactConsent=true" : ""}`}
            download
            className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <DynamicIcon name="Download" className="h-3.5 w-3.5" />
            Download CSV
          </a>
          <PickWinnersButton
            activationId={activationId}
            activationStatus={activationStatus}
            userRole={userRole}
          />
        </div>
      </div>

      {/* Last-enriched indicator — separated onto its own row so its
          variable-width datetime doesn't shift the action buttons next to it
          when it appears/changes. Right-aligned to align with action group. */}
      {lastEnrichedAt && !enrichMutation.isPending && (
        <p className="text-xs text-muted-foreground/60 text-right">
          Last checked {fmtDate(lastEnrichedAt)}
        </p>
      )}

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
        {mrqContactConsentEnabled && (
          <>
            <span className="text-border select-none">|</span>
            <button
              onClick={() => setMrqConsentFilter((f) => (f === true ? null : true))}
              className={
                mrqConsentFilter === true
                  ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                  : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              MrQ consented
            </button>
          </>
        )}
        <div className="flex-1" />
        {hasEntryCodes && (
          <div className="flex h-8 items-center overflow-hidden rounded-md border bg-background text-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="bg-muted/50 text-muted-foreground border-r px-2 py-1 font-mono text-xs whitespace-nowrap select-none">
              {codePrefixUpper}-
            </span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="code"
              value={entryCodeSearch}
              onChange={(e) => setEntryCodeSearch(e.target.value.toUpperCase())}
              aria-label="Search entry code suffix"
              className="h-full w-32 bg-transparent px-2 font-mono text-xs uppercase tracking-wider outline-none"
            />
          </div>
        )}
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
              <th className="px-4 py-3 text-left font-medium w-10">
                <span className="sr-only">State</span>
              </th>
              <th className="px-4 py-3 text-left font-medium">Verified at</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              {hasEntryCodes && (
                <th className="px-4 py-3 text-left font-medium">Entry code</th>
              )}
              <th className="px-4 py-3 text-left font-medium">Booth</th>
              <th className="px-4 py-3 text-left font-medium">UTM</th>
              <th className="px-4 py-3 text-left font-medium">IP hash</th>
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-xs">
                Age Consent
              </th>
              {consentLabels.map((label, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium max-w-[140px]">
                  <span title={label} className="block truncate text-xs font-medium">
                    {label}
                  </span>
                </th>
              ))}
              {mrqContactConsentEnabled && (
                <th className="px-4 py-3 text-left font-medium whitespace-nowrap text-xs">
                  MrQ contact
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">MRQ account</th>
              <th className="px-4 py-3 text-left font-medium">MRQ joined</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length === 0 ? (
              <tr>
                <td
                  colSpan={10 + consentColCount + (hasEntryCodes ? 1 : 0)}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {data ? "No registrations match." : "Loading…"}
                </td>
              </tr>
            ) : (
              visibleItems.map((r) => {
                const isRevealed = revealed.has(r.id);
                const winnerSelection = r.winnerSelections[0];
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {winnerSelection && (
                          <span
                            title={`${winnerSelection.type === "WINNER" ? "Winner" : "Reserve"} · position ${winnerSelection.position}`}
                            aria-label={`${winnerSelection.type === "WINNER" ? "Winner" : "Reserve"} at position ${winnerSelection.position}`}
                            className="text-amber-500"
                          >
                            <DynamicIcon
                              name={
                                winnerSelection.type === "WINNER"
                                  ? "Trophy"
                                  : "Star"
                              }
                              className="h-3.5 w-3.5"
                            />
                          </span>
                        )}
                        {r.excluded && (
                          <span
                            title="Excluded from winner draws"
                            aria-label="Excluded from winner draws"
                            className="text-muted-foreground"
                          >
                            <DynamicIcon
                              name="Ban"
                              className="h-3.5 w-3.5"
                            />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.verifiedAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {isRevealed ? r.email : maskEmail(r.email)}
                    </td>
                    {hasEntryCodes && (
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                        {r.entryCode ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.boothCode ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {r.utmSource ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.ipHash.slice(0, 8)}…
                    </td>
                    {(() => {
                      const accepted = parseConsentItemsAccepted(r.consentItemsAccepted);
                      return (
                        <>
                          <td className="px-4 py-2.5 text-center">
                            <ConsentCheck accepted={true} />
                          </td>
                          {consentLabels.map((_label, i) => (
                            <td key={i} className="px-4 py-2.5 text-center">
                              <ConsentCheck accepted={accepted[i]?.accepted ?? false} />
                            </td>
                          ))}
                          {mrqContactConsentEnabled && (
                            <td className="px-4 py-2.5 text-center">
                              <ConsentCheck accepted={r.mrqContactConsent} />
                            </td>
                          )}
                        </>
                      );
                    })()}
                    <td className="px-4 py-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MrqAccountBadge status={r.mrqAccountStatus} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                      {fmtDate(r.mrqRegisteredAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleToggleReveal(r.id)}
                        disabled={revealMutation.isPending}
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
                        aria-label={isRevealed ? "Hide email" : "Reveal email"}
                        title={isRevealed ? "Hide email" : "Reveal email"}
                      >
                        <DynamicIcon
                          name={isRevealed ? "EyeOff" : "Eye"}
                          className="h-3.5 w-3.5"
                        />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {total != null
            ? total === 0
              ? "No registrations."
              : `Showing ${(page - 1) * pageSize + 1}–${
                  (page - 1) * pageSize + visibleItems.length
                } of ${total}.`
            : "Loading…"}{" "}
          Reveal logs to audit.
        </span>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              className="bg-background border rounded h-7 px-1 text-xs"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="rounded border px-2 py-0.5 hover:text-foreground disabled:opacity-40"
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="rounded border px-2 py-0.5 hover:text-foreground disabled:opacity-40"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

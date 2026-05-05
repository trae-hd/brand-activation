"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { statusBadgeClass } from "@/lib/activationStatus";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { trpc } from "@/lib/trpc/client";
import type { ActivationStatus, ActivationReviewStatus, AdminRole } from "@prisma/client";
import type { ActivationRow } from "@/types/activation";

type FilterValue = "ALL" | ActivationStatus | "NEEDS_REVIEW" | "ARCHIVED";

const NEEDS_REVIEW_STATUSES: ActivationReviewStatus[] = ["SUBMITTED", "DRAFT_EDITED"];

interface Props {
  activations: ActivationRow[];
  userRole: AdminRole;
}

function formatWindow(startsAt: string, endsAt: string): string {
  const tz = "Europe/London";
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).format(d);

  const startDateKey = fmt(start, { year: "numeric", month: "2-digit", day: "2-digit" });
  const endDateKey = fmt(end, { year: "numeric", month: "2-digit", day: "2-digit" });

  const startDay = fmt(start, { day: "2-digit", month: "short" });
  const startTime = fmt(start, { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime = fmt(end, { hour: "2-digit", minute: "2-digit", hour12: false });

  if (startDateKey === endDateKey) {
    return `${startDay} · ${startTime}–${endTime}`;
  }

  const endDay = fmt(end, { day: "2-digit", month: "short" });
  return `${startDay} ${startTime} – ${endDay} ${endTime}`;
}

function IconAction({
  icon,
  label,
  onClick,
  href,
  destructive,
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const cls = [
    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
    destructive
      ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    disabled && "pointer-events-none opacity-40",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = <DynamicIcon name={icon} className="h-4 w-4" />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={cls} aria-label={label}>
            {inner}
          </Link>
        ) : (
          <button type="button" onClick={onClick} disabled={disabled} className={cls} aria-label={label}>
            {inner}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ActivationListClient({ activations, userRole: _userRole }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const rawParam = searchParams.get("status") ?? "ALL";
  const validValues: FilterValue[] = [
    "ALL", "LIVE", "SCHEDULED", "DRAFT", "ENDED", "NEEDS_REVIEW", "ARCHIVED",
  ];
  const filter: FilterValue = validValues.includes(rawParam as FilterValue)
    ? (rawParam as FilterValue)
    : "ALL";

  function setFilter(value: FilterValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    router.replace(`/?${params.toString()}`);
  }

  const BASE_FILTERS: { label: string; value: FilterValue }[] = [
    { label: "All", value: "ALL" },
    { label: "Live", value: "LIVE" },
    { label: "Scheduled", value: "SCHEDULED" },
    { label: "Draft", value: "DRAFT" },
    { label: "Ended", value: "ENDED" },
  ];

  const needsReviewCount = activations.filter(
    (a) => !a.archivedAt && NEEDS_REVIEW_STATUSES.includes(a.reviewStatus)
  ).length;

  const archivedCount = activations.filter((a) => !!a.archivedAt).length;

  const visible = activations.filter((a) => {
    if (filter === "ARCHIVED") {
      return !!a.archivedAt;
    }
    if (a.archivedAt) return false;
    if (filter === "NEEDS_REVIEW") {
      return NEEDS_REVIEW_STATUSES.includes(a.reviewStatus);
    }
    if (filter !== "ALL") {
      return a.status === filter;
    }
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
    }
    return true;
  }).filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
  });

  async function handleArchive(id: string, currentlyArchived: boolean) {
    setBusyId(id);
    try {
      if (currentlyArchived) {
        await trpc.activation.unarchive.mutate({ activationId: id });
      } else {
        await trpc.activation.archive.mutate({ activationId: id });
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const pillClass = (active: boolean) =>
    active
      ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
      : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground";

  return (
    <TooltipProvider>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {BASE_FILTERS.map(({ label, value }) => (
            <button key={value} onClick={() => setFilter(value)} className={pillClass(filter === value)}>
              {label}
            </button>
          ))}
          <button onClick={() => setFilter("NEEDS_REVIEW")} className={pillClass(filter === "NEEDS_REVIEW")}>
            Needs review
            {needsReviewCount > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === "NEEDS_REVIEW"
                    ? "bg-background/20 text-background"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}
              >
                {needsReviewCount}
              </span>
            )}
          </button>
          <button onClick={() => setFilter("ARCHIVED")} className={pillClass(filter === "ARCHIVED")}>
            Archived
            {archivedCount > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === "ARCHIVED"
                    ? "bg-background/20 text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {archivedCount}
              </span>
            )}
          </button>
        </div>

        {/* Search + New activation */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 min-w-0 flex-1 text-sm sm:w-48 sm:flex-none"
          />
          <Button asChild size="sm" className="shrink-0">
            <Link href="/activations/new">
              <DynamicIcon name="Plus" className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">New activation</span>
              <span className="sm:hidden sr-only">New activation</span>
            </Link>
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
          {activations.filter((a) => !a.archivedAt).length === 0 && filter !== "ARCHIVED" ? (
            <>
              No activations yet.{" "}
              <Link href="/activations/new" className="underline underline-offset-4">
                Create your first one.
              </Link>
            </>
          ) : (
            "No activations match this filter."
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Slug</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Booths</th>
                <th className="px-4 py-3 text-right font-medium">Verified</th>
                <th className="px-4 py-3 text-right font-medium">Pending</th>
                <th className="px-4 py-3 text-left font-medium">Window</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const isDraft = a.status === "DRAFT";
                const needsReview = NEEDS_REVIEW_STATUSES.includes(a.reviewStatus);
                const isArchived = !!a.archivedAt;
                const isBusy = busyId === a.id;
                return (
                  <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/20 ${isArchived ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/${a.id}`}
                          className="hover:underline underline-offset-4"
                        >
                          {a.name}
                        </Link>
                        {needsReview && !isArchived && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {a.reviewStatus === "SUBMITTED" ? "Review" : "Edited"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{a.slug}</td>
                    <td className="px-4 py-3">
                      {isArchived ? (
                        <Badge className="border-border bg-muted/60 text-muted-foreground">ARCHIVED</Badge>
                      ) : (
                        <Badge className={statusBadgeClass(a.status)}>{a.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.boothCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {isDraft ? "—" : a.verifiedCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {isDraft ? "—" : a.pendingCount}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatWindow(a.startsAt, a.endsAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconAction icon="LayoutDashboard" label="Dashboard" href={`/dashboard/${a.id}`} />
                        {!isArchived && (
                          <IconAction icon="PencilRuler" label="Edit" href={`/activations/${a.id}/edit`} />
                        )}
                        <IconAction
                          icon={isArchived ? "ArchiveRestore" : "Archive"}
                          label={isArchived ? "Restore" : "Archive"}
                          onClick={() => handleArchive(a.id, isArchived)}
                          disabled={isBusy}
                          destructive={!isArchived}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TooltipProvider>
  );
}

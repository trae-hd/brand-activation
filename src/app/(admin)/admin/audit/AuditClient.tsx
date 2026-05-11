"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";

type FilterChip = "All" | "Activation" | "User" | "Legal" | "Erasure" | "Reveal" | "Email";

const CHIPS: FilterChip[] = ["All", "Activation", "User", "Legal", "Erasure", "Reveal", "Email"];

export interface AuditRowDisplay {
  id: string;
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  rows: AuditRowDisplay[];
}

function matchesChip(action: string, chip: FilterChip): boolean {
  if (chip === "All") return true;
  if (chip === "Activation") return action.startsWith("activation.") && !action.includes("legal");
  if (chip === "User") return action.startsWith("user.");
  if (chip === "Legal") return action.includes("legal");
  if (chip === "Erasure") return action.includes("erasure");
  if (chip === "Reveal") return action === "EMAIL_REVEAL";
  if (chip === "Email") {
    // Catches the three actions added by the post-verify confirmation email
    // feature and any future participant.*_email_* / participant.resend_*
    // actions filed under the same shape.
    return (
      action === "participant.confirmation_email_sent" ||
      action === "participant.confirmation_email_failed" ||
      action === "participant.resend_rate_limited"
    );
  }
  return false;
}

function diffFromEntry(action: string, m: Record<string, unknown> | null): string {
  const meta = m ?? {};

  if (action.startsWith("activation.status.")) {
    const { from, to } = meta as { from?: string; to?: string };
    if (from && to) return `${from} → ${to}`;
  }
  if (action === "activation.legal.approved") return "false → true";
  if (action === "activation.legal.revoked") return "true → false";
  if (action === "activation.updated") {
    return meta.consentChanged ? "consent changed" : "fields updated";
  }
  if (action === "activation.created") {
    return meta.slug ? `/${String(meta.slug)}` : "created";
  }
  if (action === "activation.deleted") {
    return meta.name ? `${String(meta.name)} deleted` : "deleted";
  }
  if (action === "EMAIL_REVEAL") {
    return meta.reason ? `reason: ${String(meta.reason)}` : "revealed";
  }
  if (action === "user.invited") {
    return meta.role ? `role: ${String(meta.role)}` : "invited";
  }
  if (action === "user.role.changed") {
    const { from, to } = meta as { from?: string; to?: string };
    if (from && to) return `${from} → ${to}`;
  }
  if (action === "user.deactivated") {
    const reason = meta.reason as string | undefined;
    return reason
      ? reason.length > 42 ? reason.slice(0, 42) + "…" : reason
      : "deactivated";
  }
  if (action === "user.invite.cancelled") return "invite cancelled";
  if (action === "user.password.reset.issued_by_admin") return "reset link issued";
  if (action === "erasure.fulfilled") {
    const count = meta.rowCount as number | undefined;
    return count !== undefined ? `${count} row${count !== 1 ? "s" : ""} erased` : "erased";
  }
  if (action === "participant.confirmation_email_sent") {
    const cause = meta.cause as string | undefined;
    return cause ? `cause: ${cause}` : "sent";
  }
  if (action === "participant.confirmation_email_failed") {
    const reason = meta.reason as string | undefined;
    const cause = meta.cause as string | undefined;
    const attempts = meta.attempts as number | undefined;
    const parts: string[] = [];
    if (reason) parts.push(reason);
    if (cause) parts.push(`cause: ${cause}`);
    if (attempts !== undefined) parts.push(`${attempts} attempt${attempts !== 1 ? "s" : ""}`);
    return parts.join(" · ") || "failed";
  }
  if (action === "participant.resend_rate_limited") {
    const scope = meta.scope as string | undefined;
    return scope ? `scope: ${scope}` : "rate-limited";
  }

  // Fallback: first two metadata keys
  const entries = Object.entries(meta).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`);
  return entries.join(", ") || "—";
}

function targetLabel(
  targetType: string | null,
  targetId: string | null,
  meta: Record<string, unknown> | null
): string {
  if (!targetType) return "—";
  const m = meta ?? {};
  if (targetType === "Activation") {
    return (
      (m.slug as string | undefined) ??
      (m.name as string | undefined) ??
      `#${targetId?.slice(0, 8) ?? "?"}`
    );
  }
  if (targetType === "Registration") {
    return `reg #${targetId?.slice(0, 6) ?? "?"}`;
  }
  if (targetType === "AdminUser") {
    return `#${targetId?.slice(0, 8) ?? "?"}`;
  }
  return targetId ? `${targetId.slice(0, 8)}…` : "—";
}

function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    hour12: false,
  }).format(new Date(iso));
}

export function AuditClient({ rows }: Props) {
  const [chip, setChip] = useState<FilterChip>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return rows.filter((r) => {
      if (!matchesChip(r.action, chip)) return false;
      if (!lower) return true;
      return (
        r.action.toLowerCase().includes(lower) ||
        (r.actorEmail?.toLowerCase().includes(lower) ?? false) ||
        (r.actorName?.toLowerCase().includes(lower) ?? false)
      );
    });
  }, [rows, chip, search]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Audit · last 7 days</h2>

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={
              chip === c
                ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {c}
          </button>
        ))}
        <div className="flex-1" />
        <Input
          placeholder="Search actor or action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-52 text-sm"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">When</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Target</th>
              <th className="px-4 py-3 text-left font-medium">Diff</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {rows.length === 0
                    ? "No audit entries in the last 7 days."
                    : "No entries match."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-xs text-muted-foreground">
                    {fmtWhen(r.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.actorEmail ?? (
                      <span className="text-muted-foreground">system</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {targetLabel(r.targetType, r.targetId, r.metadata)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {diffFromEntry(r.action, r.metadata)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} · Audit log is append-only.
      </p>
    </div>
  );
}

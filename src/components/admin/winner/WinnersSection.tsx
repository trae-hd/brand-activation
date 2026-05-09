"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { DisqualifyDialog } from "./DisqualifyDialog";
import type {
  AdminRole,
  MrqAccountStatus,
  SelectionStatus,
  SelectionType,
} from "@prisma/client";

interface Props {
  activationId: string;
  userRole: AdminRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function fmtDateTime(d: Date | string | null): string {
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

function fmtRelative(d: Date | string | null): string {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const MRQ_STATUS_LABEL: Record<MrqAccountStatus, string> = {
  UNKNOWN: "—",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  NOT_FOUND: "No account",
};

function StatusPill({ status }: { status: SelectionStatus }) {
  const cls =
    status === "DISQUALIFIED"
      ? "bg-destructive/10 text-destructive"
      : status === "NOTIFIED"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : status === "CONFIRMED"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : status === "DECLINED"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

function TypePill({ type, promoted }: { type: SelectionType; promoted: boolean }) {
  if (type === "WINNER") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
        Winner
        {promoted && (
          <span
            title="Promoted from reserve"
            className="text-[8px] opacity-80"
          >
            ↑
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      Reserve
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WinnersSection({ activationId, userRole }: Props) {
  const isAdmin = userRole === "ADMIN";
  const utils = trpcReact.useUtils();

  const drawsQuery = trpcReact.winner.listForActivation.useQuery(
    { activationId },
    { refetchOnWindowFocus: false },
  );

  const [revealedSelections, setRevealedSelections] = useState<Set<string>>(
    new Set(),
  );
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  const [disqualifyTarget, setDisqualifyTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const revealEmailMutation = trpcReact.registration.revealEmail.useMutation();
  const markNotifiedMutation = trpcReact.winner.markNotified.useMutation({
    onSuccess: () => utils.winner.listForActivation.invalidate(),
  });
  const updateNotesMutation = trpcReact.winner.updateSelectionNotes.useMutation({
    onSuccess: () => utils.winner.listForActivation.invalidate(),
  });

  // Don't render anything when there are no draws — the section appears
  // only on activations that have actually drawn winners (per §1.6.C).
  if (drawsQuery.isLoading) return null;
  if (!drawsQuery.data || drawsQuery.data.length === 0) return null;

  const draws = drawsQuery.data;

  async function handleToggleReveal(selectionId: string, registrationId: string) {
    if (revealedSelections.has(selectionId)) {
      setRevealedSelections((prev) => {
        const next = new Set(prev);
        next.delete(selectionId);
        return next;
      });
      return;
    }
    await revealEmailMutation.mutateAsync({ registrationId });
    setRevealedSelections((prev) => new Set([...prev, selectionId]));
  }

  function startEditingNotes(selectionId: string, currentNotes: string | null) {
    setEditingNotesFor(selectionId);
    setEditingNotesValue(currentNotes ?? "");
  }

  async function saveNotes() {
    if (!editingNotesFor) return;
    await updateNotesMutation.mutateAsync({
      selectionId: editingNotesFor,
      notes: editingNotesValue,
    });
    setEditingNotesFor(null);
    setEditingNotesValue("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-semibold">
          Winners{draws.length > 1 ? ` · ${draws.length} draws` : ""}
        </h2>
      </div>

      {draws.map((draw, drawIndex) => {
        const drawNumber = draws.length - drawIndex; // most recent = highest number
        return (
          <div
            key={draw.id}
            className="space-y-2 rounded-md border bg-muted/10 p-4"
          >
            {/* Per-draw header */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-col">
                <p className="text-sm font-semibold">
                  Draw #{drawNumber} ·{" "}
                  <span className="text-muted-foreground font-normal">
                    {draw.winnerCount} winner{draw.winnerCount === 1 ? "" : "s"}
                    {draw.reserveCount > 0
                      ? ` + ${draw.reserveCount} reserve${draw.reserveCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  Drawn {fmtDateTime(draw.drawnAt)} by{" "}
                  {draw.drawnBy?.name ?? "—"} · cutoff{" "}
                  <span className="font-mono">
                    {fmtDateTime(draw.eligibilityCutoffAt)}
                  </span>
                  {draw.mrqAccountOnly && " · MrQ accounts only"}
                </p>
              </div>
            </div>

            {/* Selections table */}
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-10">#</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Entry code
                    </th>
                    <th className="px-3 py-2 text-left font-medium">MrQ</th>
                    <th className="px-3 py-2 text-left font-medium">Notified</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draw.selections.map((sel) => {
                    const reg = sel.registration;
                    const revealed = revealedSelections.has(sel.id);
                    const isDisqualified = sel.status === "DISQUALIFIED";
                    const isNotified = sel.notifiedAt != null;
                    const promoted = sel.promotedFromReserveAt != null;
                    const isEditingThisRow = editingNotesFor === sel.id;
                    const hasNotes =
                      sel.notificationNotes !== null &&
                      sel.notificationNotes.length > 0;

                    return (
                      <tr
                        key={sel.id}
                        className="border-b last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">
                          {sel.position}
                        </td>
                        <td className="px-3 py-2">
                          <TypePill type={sel.type} promoted={promoted} />
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={sel.status} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {reg ? (
                            revealed ? (
                              reg.email
                            ) : (
                              maskEmail(reg.email)
                            )
                          ) : (
                            <span className="text-muted-foreground/60 italic">
                              [erased]
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {reg?.entryCode ?? (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {reg
                            ? MRQ_STATUS_LABEL[reg.mrqAccountStatus]
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {isNotified ? (
                            <span title={fmtDateTime(sel.notifiedAt)}>
                              {sel.notifiedBy?.name ?? "—"}
                              {sel.notifiedAt && (
                                <>
                                  {" "}
                                  <span className="text-muted-foreground/60">
                                    · {fmtRelative(sel.notifiedAt)}
                                  </span>
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {/* Reveal email — visible to ADMIN + MEMBER */}
                            {reg && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleReveal(sel.id, reg.id)
                                }
                                disabled={revealEmailMutation.isPending}
                                aria-label={
                                  revealed ? "Hide email" : "Reveal email"
                                }
                                title={
                                  revealed ? "Hide email" : "Reveal email"
                                }
                                className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                              >
                                <DynamicIcon
                                  name={revealed ? "EyeOff" : "Eye"}
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            )}

                            {/* Mark notified — ADMIN + MEMBER, hidden when already
                                notified or when row is disqualified */}
                            {!isNotified && !isDisqualified && reg && (
                              <button
                                type="button"
                                onClick={() =>
                                  markNotifiedMutation.mutate({
                                    selectionId: sel.id,
                                  })
                                }
                                disabled={markNotifiedMutation.isPending}
                                title="Mark as notified"
                                className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                              >
                                <DynamicIcon
                                  name="BellRing"
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            )}

                            {/* Edit notes — ADMIN + MEMBER, hidden when disqualified */}
                            {!isDisqualified && reg && (
                              <button
                                type="button"
                                onClick={() =>
                                  startEditingNotes(
                                    sel.id,
                                    sel.notificationNotes,
                                  )
                                }
                                title={hasNotes ? "Edit notes" : "Add notes"}
                                className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              >
                                <DynamicIcon
                                  name={hasNotes ? "FileText" : "FilePlus"}
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            )}

                            {/* Disqualify — ADMIN-only, hidden when already
                                disqualified */}
                            {isAdmin && !isDisqualified && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDisqualifyTarget({
                                    id: sel.id,
                                    label: `${sel.type === "WINNER" ? "Winner" : "Reserve"} #${sel.position}`,
                                  })
                                }
                                title="Disqualify"
                                className="text-destructive rounded p-1 hover:bg-destructive/10"
                              >
                                <DynamicIcon
                                  name="UserX"
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            )}
                          </div>

                          {/* Disqualified-row metadata */}
                          {isDisqualified && (
                            <div className="text-muted-foreground mt-1 text-right text-[10px]">
                              by {sel.disqualifiedBy?.name ?? "—"}
                              {sel.disqualifiedAt &&
                                ` · ${fmtRelative(sel.disqualifiedAt)}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inline notes editor — appears below the table when a row is being edited */}
            {editingNotesFor &&
              draw.selections.some((s) => s.id === editingNotesFor) && (
                <div className="bg-background mt-2 rounded-md border p-3 space-y-2">
                  {(() => {
                    const sel = draw.selections.find(
                      (s) => s.id === editingNotesFor,
                    );
                    if (!sel) return null;
                    return (
                      <>
                        <p className="text-xs font-medium">
                          Notes for {sel.type === "WINNER" ? "Winner" : "Reserve"}{" "}
                          #{sel.position}
                        </p>
                        <textarea
                          value={editingNotesValue}
                          onChange={(e) =>
                            setEditingNotesValue(e.target.value.slice(0, 2000))
                          }
                          placeholder="e.g. Spoke on phone, will email entry code…"
                          rows={3}
                          className="border-input bg-background placeholder:text-muted-foreground/50 focus:border-primary w-full resize-y rounded-md border px-2 py-1.5 text-xs outline-none"
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-muted-foreground text-[10px]">
                            {editingNotesValue.length} / 2000
                            {sel.notesUpdatedAt && sel.notesUpdatedBy && (
                              <span className="ml-2">
                                · last edited by {sel.notesUpdatedBy.name}{" "}
                                {fmtRelative(sel.notesUpdatedAt)}
                              </span>
                            )}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingNotesFor(null);
                                setEditingNotesValue("");
                              }}
                              disabled={updateNotesMutation.isPending}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={saveNotes}
                              disabled={updateNotesMutation.isPending}
                            >
                              {updateNotesMutation.isPending
                                ? "Saving…"
                                : "Save notes"}
                            </Button>
                          </div>
                        </div>
                        {hasNotesPreview(sel.notificationNotes) && (
                          <p className="text-muted-foreground text-[11px] italic">
                            Current: {sel.notificationNotes}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
          </div>
        );
      })}

      {/* Disqualify confirmation dialog (ADMIN-only path; only ADMIN-rendered buttons can open it) */}
      {disqualifyTarget && (
        <DisqualifyDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDisqualifyTarget(null);
          }}
          selectionId={disqualifyTarget.id}
          selectionLabel={disqualifyTarget.label}
        />
      )}
    </div>
  );
}

function hasNotesPreview(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.trim().length > 0;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { MrqAccountStatus } from "@prisma/client";

// ── Constants ────────────────────────────────────────────────────────────────

const PHRASE = "DRAW";
const MAX_WINNERS = 1000;
const MAX_RESERVES = 1000;

/** Default reserves: max(2, ceil(winners × 0.2)). Recomputes when winners
 *  changes UNLESS the user has manually edited reserves (then stays at the
 *  user's value). */
function defaultReserves(winners: number): number {
  return Math.max(2, Math.ceil(winners * 0.2));
}

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = "compose" | "drawing" | "result";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activationId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function fmtCutoff(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    hour12: false,
  }).format(date);
}

const MRQ_STATUS_LABEL: Record<MrqAccountStatus, string> = {
  UNKNOWN: "—",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  NOT_FOUND: "No account",
};

// ── Component ────────────────────────────────────────────────────────────────

export function PickWinnersDialog({
  open,
  onOpenChange,
  activationId,
}: Props) {
  const utils = trpcReact.useUtils();

  // ── Mode + form state ──────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("compose");
  const [winnerCount, setWinnerCount] = useState(1);
  const [reserveCount, setReserveCount] = useState(defaultReserves(1));
  const [reserveCountTouched, setReserveCountTouched] = useState(false);
  const [mrqAccountOnly, setMrqAccountOnly] = useState(false);
  const [phrase, setPhrase] = useState("");
  // Inline result payload returned by pickWinners — avoids a separate fetch
  // round-trip and guarantees the UI shows the success state atomically with
  // the mutation's success.
  const [resultData, setResultData] = useState<{
    drawId: string;
    drawnAt: Date | string;
    selections: SelectionRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedSelectionIds, setRevealedSelectionIds] = useState<Set<string>>(
    new Set(),
  );
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied">(
    "idle",
  );

  // Auto-recompute reserves when winners changes — but only if the user
  // hasn't manually edited reserves yet.
  useEffect(() => {
    if (!reserveCountTouched) {
      setReserveCount(defaultReserves(winnerCount));
    }
  }, [winnerCount, reserveCountTouched]);

  // Reset state when the dialog closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setMode("compose");
      setWinnerCount(1);
      setReserveCountTouched(false);
      setReserveCount(defaultReserves(1));
      setMrqAccountOnly(false);
      setPhrase("");
      setResultData(null);
      setError(null);
      setRevealedSelectionIds(new Set());
      setCopyState("idle");
    }
  }, [open]);

  // ── Live eligibility preview ───────────────────────────────────────
  const previewQuery = trpcReact.winner.previewEligiblePool.useQuery(
    { activationId, mrqAccountOnly },
    { enabled: mode === "compose" && open },
  );
  const eligiblePoolSize = previewQuery.data?.eligiblePoolSize;
  const cutoffAt = previewQuery.data?.eligibilityCutoffAt;

  // ── Mutations ─────────────────────────────────────────────────────
  const pickWinnersMutation = trpcReact.winner.pickWinners.useMutation({
    onSuccess: (data) => {
      // Selections come back inline — no second round-trip. The result
      // state renders immediately from this payload.
      setResultData({
        drawId: data.drawId,
        drawnAt: data.drawnAt,
        selections: data.selections as unknown as SelectionRow[],
      });
      setMode("result");
      // Invalidate so the persistent Winners view (Phase 5) shows the
      // new draw on its next render. Fire-and-forget; we don't need to
      // await it before showing the result.
      void utils.winner.listForActivation.invalidate({ activationId });
    },
    onError: (err) => {
      setError(err.message);
      setMode("compose");
    },
  });

  const copyEmailsMutation = trpcReact.winner.copyEmails.useMutation();
  const revealEmailMutation = trpcReact.registration.revealEmail.useMutation();

  const winnerSelections = useMemo(
    () => resultData?.selections.filter((s) => s.type === "WINNER") ?? [],
    [resultData],
  );
  const reserveSelections = useMemo(
    () => resultData?.selections.filter((s) => s.type === "RESERVE") ?? [],
    [resultData],
  );

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSubmit = () => {
    setError(null);
    setMode("drawing");
    pickWinnersMutation.mutate({
      activationId,
      winnerCount,
      reserveCount,
      mrqAccountOnly,
      phrase: PHRASE,
    });
  };

  const handleReveal = async (selectionId: string, registrationId: string) => {
    if (revealedSelectionIds.has(selectionId)) {
      // Toggle hide — purely client-side, matches the registrations table pattern
      setRevealedSelectionIds((prev) => {
        const next = new Set(prev);
        next.delete(selectionId);
        return next;
      });
      return;
    }
    await revealEmailMutation.mutateAsync({ registrationId });
    setRevealedSelectionIds((prev) => new Set([...prev, selectionId]));
  };

  const handleCopyEmails = async () => {
    if (!resultData) return;
    setCopyState("copying");
    try {
      const { emails } = await copyEmailsMutation.mutateAsync({
        drawId: resultData.drawId,
      });
      await navigator.clipboard.writeText(emails.join("\n"));
      setCopyState("copied");
      // Reset to idle after a brief confirmation window
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("idle");
      setError("Couldn't copy emails. Try again.");
    }
  };

  // ── Validation ────────────────────────────────────────────────────
  const totalSlots = winnerCount + reserveCount;
  const phraseValid = phrase === PHRASE;
  const poolKnown = eligiblePoolSize !== undefined;
  const slotsExceedPool = poolKnown && totalSlots > eligiblePoolSize;
  const submitDisabled =
    !phraseValid ||
    !poolKnown ||
    slotsExceedPool ||
    winnerCount < 1 ||
    reserveCount < 0 ||
    pickWinnersMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {mode === "compose" && (
          <>
            <DialogHeader>
              <DialogTitle>Pick winners</DialogTitle>
              <DialogDescription>
                Random, deterministic, audited. Choose the count, confirm the
                pool, and type{" "}
                <span className="font-mono font-semibold">{PHRASE}</span> to
                draw.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              {/* Counts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="winnerCount" className="text-xs">
                    Number of winners
                  </Label>
                  <Input
                    id="winnerCount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_WINNERS}
                    value={winnerCount}
                    onChange={(e) => {
                      const n = Math.max(
                        1,
                        Math.min(MAX_WINNERS, Number(e.target.value) || 1),
                      );
                      setWinnerCount(n);
                    }}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reserveCount" className="text-xs">
                    Number of reserves{" "}
                    <span className="text-muted-foreground/60 font-normal">
                      (default {defaultReserves(winnerCount)})
                    </span>
                  </Label>
                  <Input
                    id="reserveCount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_RESERVES}
                    value={reserveCount}
                    onChange={(e) => {
                      setReserveCountTouched(true);
                      const n = Math.max(
                        0,
                        Math.min(MAX_RESERVES, Number(e.target.value) || 0),
                      );
                      setReserveCount(n);
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* MrQ filter toggle */}
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  checked={mrqAccountOnly}
                  onCheckedChange={(checked) =>
                    setMrqAccountOnly(checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug">
                  Only participants with an MrQ account
                  <span className="text-muted-foreground block text-xs">
                    Filters the eligible pool to participants whose MrQ account
                    status is <span className="font-mono">ACTIVE</span>.
                  </span>
                </span>
              </label>

              {/* Eligibility preview */}
              <div className="bg-muted/30 flex flex-col gap-1.5 rounded-md border p-3 text-sm">
                {previewQuery.isLoading ? (
                  <p className="text-muted-foreground">
                    Counting eligible participants…
                  </p>
                ) : previewQuery.error ? (
                  <p className="text-destructive">
                    Couldn&apos;t load pool size: {previewQuery.error.message}
                  </p>
                ) : (
                  <>
                    <p>
                      <span className="font-semibold tabular-nums">
                        {eligiblePoolSize}
                      </span>{" "}
                      eligible participant{eligiblePoolSize === 1 ? "" : "s"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Verified · contact consent given · not excluded
                      {mrqAccountOnly ? " · MrQ account active" : ""} ·
                      registered before{" "}
                      {cutoffAt ? (
                        <span className="font-mono">{fmtCutoff(cutoffAt)}</span>
                      ) : (
                        "—"
                      )}
                    </p>
                    {slotsExceedPool && (
                      <p className="text-destructive mt-1 text-xs">
                        Cannot pick {totalSlots} ({winnerCount} winners +{" "}
                        {reserveCount} reserves) from a pool of{" "}
                        {eligiblePoolSize}.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Phrase gate */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phrase" className="text-xs">
                  Type{" "}
                  <span className="font-mono font-semibold">{PHRASE}</span> to
                  confirm. This is logged and irreversible.
                </Label>
                <Input
                  id="phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={PHRASE}
                  className="h-9 font-mono text-sm uppercase tracking-wider"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pickWinnersMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitDisabled}
                className="gap-1.5"
              >
                <DynamicIcon name="Trophy" className="h-3.5 w-3.5" />
                Draw winners
              </Button>
            </DialogFooter>
          </>
        )}

        {mode === "drawing" && (
          <>
            <DialogHeader>
              <DialogTitle>Selecting winners…</DialogTitle>
              <DialogDescription>
                Running the deterministic draw. This usually takes under a
                second.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-10">
              <DynamicIcon
                name="Loader2"
                className="text-muted-foreground h-8 w-8 animate-spin"
              />
              <p className="text-muted-foreground text-sm">
                {winnerCount} winner{winnerCount === 1 ? "" : "s"} +{" "}
                {reserveCount} reserve{reserveCount === 1 ? "" : "s"} from a
                pool of {eligiblePoolSize ?? "—"}
              </p>
            </div>
          </>
        )}

        {mode === "result" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {winnerCount} winner{winnerCount === 1 ? "" : "s"} +{" "}
                {reserveCount} reserve{reserveCount === 1 ? "" : "s"} selected
              </DialogTitle>
              <DialogDescription>
                Winners are listed by position. Reserves promote automatically
                if a winner is later disqualified.
                {cutoffAt && (
                  <>
                    {" "}
                    Eligibility cutoff:{" "}
                    <span className="font-mono">{fmtCutoff(cutoffAt)}</span>.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2">
              <SelectionTable
                title="Winners"
                selections={winnerSelections}
                revealedIds={revealedSelectionIds}
                onToggleReveal={handleReveal}
                revealPending={revealEmailMutation.isPending}
              />
              {reserveSelections.length > 0 && (
                <SelectionTable
                  title="Reserves"
                  selections={reserveSelections}
                  revealedIds={revealedSelectionIds}
                  onToggleReveal={handleReveal}
                  revealPending={revealEmailMutation.isPending}
                />
              )}
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyEmails}
                disabled={copyState !== "idle" || !resultData}
                className="gap-1.5"
              >
                <DynamicIcon
                  name={copyState === "copied" ? "Check" : "Copy"}
                  className="h-3.5 w-3.5"
                />
                {copyState === "copying"
                  ? "Copying…"
                  : copyState === "copied"
                  ? "Copied!"
                  : "Copy winner emails"}
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>

            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper sub-component — selections table for a single role (WINNER or RESERVE)
// ─────────────────────────────────────────────────────────────────────────────

interface SelectionRow {
  id: string;
  position: number;
  type: "WINNER" | "RESERVE";
  registration: {
    id: string;
    email: string;
    entryCode: string | null;
    mrqAccountStatus: MrqAccountStatus;
  } | null;
}

function SelectionTable({
  title,
  selections,
  revealedIds,
  onToggleReveal,
  revealPending,
}: {
  title: string;
  selections: SelectionRow[];
  revealedIds: Set<string>;
  onToggleReveal: (selectionId: string, registrationId: string) => void;
  revealPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {title}
      </p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-10">#</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Entry code</th>
              <th className="px-3 py-2 text-left font-medium">MrQ</th>
              <th className="px-3 py-2 w-10">
                <span className="sr-only">Reveal email</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {selections.map((s) => {
              const revealed = revealedIds.has(s.id);
              const reg = s.registration;
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {s.position}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {reg
                      ? revealed
                        ? reg.email
                        : maskEmail(reg.email)
                      : (
                          <span className="text-muted-foreground/60 italic">
                            [erased]
                          </span>
                        )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {reg?.entryCode ?? <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {reg ? MRQ_STATUS_LABEL[reg.mrqAccountStatus] : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {reg && (
                      <button
                        type="button"
                        onClick={() => onToggleReveal(s.id, reg.id)}
                        disabled={revealPending}
                        aria-label={revealed ? "Hide email" : "Reveal email"}
                        title={revealed ? "Hide email" : "Reveal email"}
                        className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                      >
                        <DynamicIcon
                          name={revealed ? "EyeOff" : "Eye"}
                          className="h-3.5 w-3.5"
                        />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationStatus } from "@prisma/client";

// Per §9.5 transition matrix.
const PHRASE_GATES: Partial<Record<string, string>> = {
  "SCHEDULED→DRAFT": "EDIT LOCKED ACTIVATION",
  "LIVE→SCHEDULED": "ROLLBACK ENDED",
  "ENDED→LIVE": "ROLLBACK ENDED",
  "ENDED→SCHEDULED": "ROLLBACK ENDED",
};

const ALLOWED_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["LIVE", "DRAFT"],
  LIVE: ["ENDED", "SCHEDULED"],
  ENDED: ["LIVE", "SCHEDULED"],
};

const TRANSITION_LABELS: Record<string, string> = {
  "DRAFT→SCHEDULED": "Schedule activation",
  "SCHEDULED→LIVE": "Go LIVE",
  "LIVE→ENDED": "End activation",
  "SCHEDULED→DRAFT": "Revert to draft",
  "LIVE→SCHEDULED": "Roll back to scheduled",
  "ENDED→LIVE": "Roll back to LIVE",
  "ENDED→SCHEDULED": "Roll back to scheduled",
};

interface StatusTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activationId: string;
  currentStatus: ActivationStatus;
  legalApproved: boolean;
  startsAt: Date;
  endsAt: Date;
  onSuccess: (newStatus: ActivationStatus) => void;
}

export function StatusTransitionDialog({
  open,
  onOpenChange,
  activationId,
  currentStatus,
  legalApproved,
  startsAt,
  endsAt,
  onSuccess,
}: StatusTransitionDialogProps) {
  const [selectedTo, setSelectedTo] = useState<ActivationStatus | null>(null);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTargets = ALLOWED_TRANSITIONS[currentStatus];

  const transitionKey = selectedTo ? `${currentStatus}→${selectedTo}` : null;
  const requiredPhrase = transitionKey ? (PHRASE_GATES[transitionKey] ?? null) : null;
  const now = Date.now();

  // Client-side gate checks mirroring the server.
  function isTransitionAllowed(to: ActivationStatus): boolean {
    const key = `${currentStatus}→${to}`;
    if (key === "DRAFT→SCHEDULED" && !legalApproved) return false;
    return true;
  }

  function isTimeGated(to: ActivationStatus): boolean {
    if (currentStatus === "SCHEDULED" && to === "LIVE") {
      return now < startsAt.getTime() - 5 * 60 * 1000;
    }
    if (currentStatus === "LIVE" && to === "ENDED") {
      return now < endsAt.getTime();
    }
    return false;
  }

  const phraseMatches = requiredPhrase ? phrase === requiredPhrase : true;
  const reasonOk = requiredPhrase ? reason.trim().length > 0 : true;
  const timeGated = selectedTo ? isTimeGated(selectedTo) : false;

  const canConfirm =
    selectedTo !== null &&
    isTransitionAllowed(selectedTo) &&
    phraseMatches &&
    reasonOk &&
    !isLoading;

  function handleClose() {
    setSelectedTo(null);
    setPhrase("");
    setReason("");
    setError(null);
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!selectedTo) return;
    setError(null);
    setIsLoading(true);
    try {
      await trpc.activation.transitionStatus.mutate({
        activationId,
        to: selectedTo,
        phrase: requiredPhrase ? phrase : undefined,
        reason: requiredPhrase ? reason : undefined,
        force: timeGated ? true : undefined,
      });
      handleClose();
      onSuccess(selectedTo);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Transition failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change activation status</DialogTitle>
          <DialogDescription>
            Current status: <strong>{currentStatus}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Transition to</Label>
            <div className="flex flex-col gap-1.5">
              {availableTargets.map((to) => {
                const key = `${currentStatus}→${to}`;
                const allowed = isTransitionAllowed(to);
                const gated = isTimeGated(to);
                const label = TRANSITION_LABELS[key] ?? `→ ${to}`;
                const disableReason =
                  key === "DRAFT→SCHEDULED" && !legalApproved
                    ? "Legal approval required"
                    : null;

                return (
                  <button
                    key={to}
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      setSelectedTo(to);
                      setPhrase("");
                      setReason("");
                      setError(null);
                    }}
                    className={[
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left",
                      selectedTo === to
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted/50",
                      !allowed && "cursor-not-allowed opacity-50",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span>{label}</span>
                    <span className="flex items-center gap-1.5">
                      {gated && (
                        <span className="text-xs text-amber-600">early — will force</span>
                      )}
                      {disableReason && (
                        <span className="text-xs text-destructive">{disableReason}</span>
                      )}
                      {PHRASE_GATES[key] && (
                        <span className="text-xs text-muted-foreground">requires phrase</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedTo && requiredPhrase && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phrase">
                  Type <code className="font-mono font-semibold">{requiredPhrase}</code> to confirm
                </Label>
                <Input
                  id="phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={requiredPhrase}
                  autoComplete="off"
                  className={phrase && !phraseMatches ? "border-destructive" : ""}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="reason">Reason (required)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe why this transition is necessary…"
                  maxLength={500}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
              </div>
            </>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {isLoading ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
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
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionId: string;
  selectionLabel: string; // e.g. "Winner #2"
  /** Called after the disqualify mutation succeeds (so the parent can
   *  invalidate / refetch queries that depend on selection state). */
  onSuccess?: () => void;
}

const REASON_MAX = 500;

/**
 * Confirmation dialog for disqualifying a winner-draw selection. ADMIN-only.
 * The disqualifySelection mutation refuses MEMBER callers; this dialog is
 * only rendered for ADMINs by parent components.
 *
 * On a successful disqualify of a WINNER-type selection with an available
 * RESERVE in the same draw, the server auto-promotes the topmost reserve
 * (Phase 3 logic). The dialog's success callback is the right hook for the
 * parent to invalidate queries so the promoted row + disqualified row both
 * appear updated in the UI.
 */
export function DisqualifyDialog({
  open,
  onOpenChange,
  selectionId,
  selectionLabel,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpcReact.useUtils();

  // Reset on close so the next open starts clean. React 19 prefers a
  // render-time conditional setState over a setState-in-effect (cascading).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (!open) {
      setReason("");
      setError(null);
    }
  }

  const mutation = trpcReact.winner.disqualifySelection.useMutation({
    onSuccess: async () => {
      // Invalidate both the persistent winners view AND the registrations
      // table indicators (a disqualified winner loses its 🏆 indicator;
      // a promoted reserve keeps its non-disqualified state, but its
      // type changes from RESERVE → WINNER).
      await Promise.all([
        utils.winner.listForActivation.invalidate(),
        utils.registration.list.invalidate(),
      ]);
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });

  const trimmed = reason.trim();
  const submitDisabled = trimmed.length === 0 || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Disqualify {selectionLabel}</DialogTitle>
          <DialogDescription>
            This is logged to the audit trail. If this is a WINNER and
            reserves are available, the topmost reserve will be promoted
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="disqualify-reason" className="text-xs">
            Reason (required, max {REASON_MAX} chars)
          </Label>
          <textarea
            id="disqualify-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            placeholder="e.g. Failed eligibility check, declined, unreachable…"
            rows={4}
            className="border-input bg-background placeholder:text-muted-foreground/50 focus:border-primary min-h-20 resize-y rounded-md border px-3 py-2 text-sm outline-none transition-colors"
          />
          <p className="text-muted-foreground text-[11px]">
            {trimmed.length} / {REASON_MAX}
          </p>
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
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              mutation.mutate({
                selectionId,
                reason: trimmed,
              })
            }
            disabled={submitDisabled}
          >
            {mutation.isPending ? "Disqualifying…" : "Disqualify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

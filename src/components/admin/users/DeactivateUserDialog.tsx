"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { UserRow } from "@/types/user-management";

const DEACTIVATE_PHRASE = "DEACTIVATE ADMIN";

interface Props {
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeactivateUserDialog({ target, onOpenChange, onSuccess }: Props) {
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = trpcReact.user.deactivate.useMutation({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
      setPhrase("");
      setReason("");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  function handleClose(open: boolean) {
    if (!open) {
      setPhrase("");
      setReason("");
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={target !== null} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Deactivate {target?.name}</DialogTitle>
          <DialogDescription>This will immediately revoke their access.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deactivate-phrase">
              Type <code className="font-mono font-semibold">{DEACTIVATE_PHRASE}</code> to confirm
            </Label>
            <Input
              id="deactivate-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={DEACTIVATE_PHRASE}
              autoComplete="off"
              className={phrase && phrase !== DEACTIVATE_PHRASE ? "border-destructive" : ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deactivate-reason">Reason (required)</Label>
            <Textarea
              id="deactivate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this account is being deactivated…"
              maxLength={500}
              rows={3}
            />
            <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!target) return;
              mutation.mutate({ userId: target.id, phrase: DEACTIVATE_PHRASE, reason });
            }}
            disabled={phrase !== DEACTIVATE_PHRASE || !reason.trim() || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Deactivating…
              </>
            ) : (
              "Deactivate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

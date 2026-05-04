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
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { UserRow } from "@/types/user-management";

interface Props {
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CancelInviteDialog({ target, onOpenChange, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);

  const mutation = trpcReact.user.cancelInvite.useMutation({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Dialog open={target !== null} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel invite</DialogTitle>
          <DialogDescription>
            Cancel the invite for <strong>{target?.email}</strong>? This will remove the account.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Keep
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!target) return;
              mutation.mutate({ userId: target.id });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Cancelling…
              </>
            ) : (
              "Cancel invite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

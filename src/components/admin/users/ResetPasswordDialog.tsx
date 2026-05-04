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

export function ResetPasswordDialog({ target, onOpenChange, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);

  const mutation = trpcReact.user.resetIssuedByAdmin.useMutation({
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
          <DialogTitle>Send password reset</DialogTitle>
          <DialogDescription>
            Send a password reset link to <strong>{target?.email}</strong>?
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!target) return;
              mutation.mutate({ userId: target.id });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send reset"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

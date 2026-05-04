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
import type { AdminRole } from "@prisma/client";
import type { UserRow } from "@/types/user-management";

interface Props {
  target: UserRow | null;
  newRole: AdminRole;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ChangeRoleDialog({ target, newRole, onOpenChange, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);

  const mutation = trpcReact.user.changeRole.useMutation({
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
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Change <strong>{target?.name}</strong> from{" "}
            <strong>{target?.role}</strong> to <strong>{newRole}</strong>?
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
              mutation.mutate({ userId: target.id, role: newRole });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Saving…
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

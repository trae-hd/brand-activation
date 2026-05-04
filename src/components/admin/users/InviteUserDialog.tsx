"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InviteUserDialog({ open, onOpenChange, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("MEMBER");
  const [error, setError] = useState<string | null>(null);

  const mutation = trpcReact.user.invite.useMutation({
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
      setEmail("");
      setName("");
      setRole("MEMBER");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  function handleClose(open: boolean) {
    if (!open) setError(null);
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>They will receive an email to set their password.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@mrq.com"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(["MEMBER", "ADMIN"] as AdminRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    role === r
                      ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                      : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {r}
                </button>
              ))}
            </div>
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
            onClick={() => mutation.mutate({ email, name, role })}
            disabled={!email || !name || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send invite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { AdminRole } from "@prisma/client";
import type { UserRow } from "@/types/user-management";
import { UsersTable } from "./users/UsersTable";
import { InviteUserDialog } from "./users/InviteUserDialog";
import { ChangeRoleDialog } from "./users/ChangeRoleDialog";
import { CancelInviteDialog } from "./users/CancelInviteDialog";
import { DeactivateUserDialog } from "./users/DeactivateUserDialog";
import { ResetPasswordDialog } from "./users/ResetPasswordDialog";

interface Props {
  currentUserId: string;
}

export function UsersClient({ currentUserId }: Props) {
  const utils = trpcReact.useUtils();
  const { data: users = [], isLoading } = trpcReact.user.list.useQuery();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<AdminRole>("MEMBER");
  const [cancelTarget, setCancelTarget] = useState<UserRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);

  const activeCount = users.filter((u) => u.active).length;

  function invalidate() {
    utils.user.list.invalidate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Team{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </h2>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <DynamicIcon name="Plus" className="mr-1.5 h-4 w-4" />
          Invite
        </Button>
      </div>

      <UsersTable
        users={users}
        isLoading={isLoading}
        currentUserId={currentUserId}
        onRoleClick={(user) => {
          setRoleTarget(user);
          setNewRole(user.role === "ADMIN" ? "MEMBER" : "ADMIN");
        }}
        onCancelInvite={(user) => setCancelTarget(user)}
        onDeactivate={(user) => setDeactivateTarget(user)}
        onResetPassword={(user) => setResetTarget(user)}
      />

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={invalidate}
      />

      <ChangeRoleDialog
        target={roleTarget}
        newRole={newRole}
        onOpenChange={(open) => { if (!open) setRoleTarget(null); }}
        onSuccess={invalidate}
      />

      <CancelInviteDialog
        target={cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        onSuccess={invalidate}
      />

      <DeactivateUserDialog
        target={deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
        onSuccess={invalidate}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onOpenChange={(open) => { if (!open) setResetTarget(null); }}
        onSuccess={invalidate}
      />
    </div>
  );
}

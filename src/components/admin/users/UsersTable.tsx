"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { AdminRole } from "@prisma/client";
import type { UserRow } from "@/types/user-management";

function fmtDate(d: Date | null): string {
  if (!d) return "Never";
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

function RolePill({ role, onClick }: { role: AdminRole; onClick?: () => void }) {
  const base = "rounded-full px-2 py-0.5 text-xs font-medium";
  const cls =
    role === "ADMIN" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${cls} cursor-pointer underline-offset-2 hover:underline`}
      >
        {role}
      </button>
    );
  }
  return <span className={`${base} ${cls}`}>{role}</span>;
}

interface Props {
  users: UserRow[];
  isLoading: boolean;
  currentUserId: string;
  onRoleClick: (user: UserRow) => void;
  onCancelInvite: (user: UserRow) => void;
  onDeactivate: (user: UserRow) => void;
  onResetPassword: (user: UserRow) => void;
}

export function UsersTable({
  users,
  isLoading,
  currentUserId,
  onRoleClick,
  onCancelInvite,
  onDeactivate,
  onResetPassword,
}: Props) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Email</th>
            <th className="px-4 py-3 text-left font-medium">Role</th>
            <th className="px-4 py-3 text-left font-medium">Last seen</th>
            <th className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No team members yet.
              </td>
            </tr>
          ) : (
            users.map((u) => {
              const isPending = u.hasPendingInvite;
              const isSelf = u.id === currentUserId;
              return (
                <tr
                  key={u.id}
                  className={[
                    "border-b last:border-0",
                    isPending ? "opacity-60" : "hover:bg-muted/20",
                  ].join(" ")}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.name}</span>
                      {isPending && (
                        <Badge variant="outline" className="text-[10px]">
                          Invite pending
                        </Badge>
                      )}
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {isPending ? (
                      <span className="text-muted-foreground/70">Inv: {u.email}</span>
                    ) : (
                      u.email
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <RolePill
                      role={u.role}
                      onClick={
                        !isSelf && !isPending ? () => onRoleClick(u) : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {isPending ? "—" : fmtDate(u.lastLoginAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <DynamicIcon name="MoreHorizontal" className="h-4 w-4" />
                          <span className="sr-only">Actions for {u.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isPending ? (
                          <DropdownMenuItem onClick={() => onCancelInvite(u)}>
                            Cancel invite
                          </DropdownMenuItem>
                        ) : (
                          <>
                            {!isSelf && (
                              <DropdownMenuItem
                                onClick={() => onDeactivate(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                Deactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onResetPassword(u)}>
                              <DynamicIcon name="KeyRound" className="mr-2 h-4 w-4" />
                              Send password reset
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

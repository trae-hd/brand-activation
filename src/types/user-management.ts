import type { AdminRole } from "@prisma/client";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  hasPendingInvite: boolean;
}

import "next-auth";
import "next-auth/jwt";
import type { AdminRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      adminUserId?: string;
      role?: AdminRole;
      active: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    adminUserId?: string;
    role?: AdminRole;
    active?: boolean;
  }
}

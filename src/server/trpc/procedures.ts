import { TRPCError } from "@trpc/server";
import { publicProcedure, middleware } from "./init";
import { prisma } from "@/lib/db/prisma";
import type { Context } from "./init";
import type { Session } from "next-auth";
import type { AdminRole } from "@prisma/client";

interface AuthedAdminUser {
  id: string;
  role: AdminRole;
  active: boolean;
}

// Narrowed context after isSignedIn: session is guaranteed non-null.
interface SignedInContext extends Omit<Context, "session"> {
  session: NonNullable<Session>;
  adminUser: AuthedAdminUser;
}

const isSignedIn = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.adminUserId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const adminUser = await prisma.adminUser.findUnique({
    where: { id: ctx.session.user.adminUserId },
    select: { id: true, role: true, active: true },
  });
  if (!adminUser || !adminUser.active) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session, adminUser } satisfies SignedInContext });
});

const isAdmin = isSignedIn.unstable_pipe(({ ctx, next }) => {
  const typedCtx = ctx as unknown as SignedInContext;
  if (typedCtx.adminUser.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

/**
 * Read-or-write access. Both ADMIN and MEMBER may call.
 */
export const memberProcedure = publicProcedure.use(isSignedIn);

/**
 * Write access. ADMIN only.
 */
export const adminProcedure = publicProcedure.use(isAdmin);

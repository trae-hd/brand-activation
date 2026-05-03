import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { mintRawToken, hashToken } from "@/lib/auth/tokens";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { emailProvider } from "@/lib/email/provider";
import { env } from "@/lib/env";
import type { AdminRole } from "@prisma/client";

interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const userRouter = router({
  me: memberProcedure.query(async ({ ctx }): Promise<AdminUserItem> => {
    const user = await prisma.adminUser.findUniqueOrThrow({
      where: { id: ctx.session.user.adminUserId! },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLoginAt: true },
    });
    return user;
  }),

  list: adminProcedure.query(async (): Promise<AdminUserItem[]> => {
    return prisma.adminUser.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: "asc" },
    });
  }),

  invite: adminProcedure
    .input(
      z.object({
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase())
          .refine(
            (e) => e.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`),
            { message: `Email must be a @${env.ALLOWED_EMAIL_DOMAIN} address.` }
          ),
        name: z.string().min(1).max(100),
        role: z.enum(["ADMIN", "MEMBER"]),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ userId: string }> => {
      const actorId = ctx.session.user.adminUserId!;
      const actor = await prisma.adminUser.findUniqueOrThrow({
        where: { id: actorId },
        select: { name: true },
      });

      let newUserId: string;
      let inviteId: string;
      let rawToken: string;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.adminUser.findUnique({ where: { email: input.email } });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
        }
        const newUser = await tx.adminUser.create({
          data: { email: input.email, name: input.name, role: input.role, active: true, passwordHash: null },
          select: { id: true },
        });
        newUserId = newUser.id;

        // Invalidate any prior un-consumed invites.
        await tx.adminInvite.updateMany({
          where: { subjectId: newUser.id, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() },
        });

        rawToken = mintRawToken();
        const tokenHash = hashToken(rawToken, "invite");
        const invite = await tx.adminInvite.create({
          data: { tokenHash, subjectId: newUser.id, issuerId: actorId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
          select: { id: true },
        });
        inviteId = invite.id;

        await writeAuditLog({
          category: "ADMIN",
          action: "user.invited",
          actorId,
          targetType: "AdminUser",
          targetId: newUser.id,
          metadata: { role: input.role, inviteId: invite.id },
          tx,
        });
      });

      const setPasswordUrl = `${env.NEXTAUTH_URL}/auth/set-password?type=invite&token=${rawToken!}`;
      const sendResult = await emailProvider.sendInvite({
        to: input.email,
        name: input.name,
        setPasswordUrl,
        issuerName: actor.name,
      });

      if (!sendResult.ok) {
        await writeAuditLog({
          category: "ADMIN",
          action: "user.invite.send_failed",
          actorId,
          targetType: "AdminUser",
          targetId: newUserId!,
          metadata: { inviteId: inviteId!, reason: sendResult.reason },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Account created, but invite email failed to send. You can re-issue the invite from the user list.",
        });
      }

      return { userId: newUserId! };
    }),

  deactivate: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        phrase: z.literal("DEACTIVATE ADMIN"),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      if (input.userId === actorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
      }
      await prisma.$transaction(async (tx) => {
        const target = await tx.adminUser.findUniqueOrThrow({
          where: { id: input.userId },
          select: { id: true, active: true },
        });
        if (!target.active) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "User is already deactivated." });
        }
        await tx.adminUser.update({ where: { id: input.userId }, data: { active: false } });
        await writeAuditLog({
          category: "ADMIN",
          action: "user.deactivated",
          actorId,
          targetType: "AdminUser",
          targetId: input.userId,
          metadata: { reason: input.reason },
          tx,
        });
      });
      return { ok: true };
    }),

  resetIssuedByAdmin: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      const target = await prisma.adminUser.findUniqueOrThrow({
        where: { id: input.userId },
        select: { id: true, email: true, active: true, name: true },
      });
      if (!target.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a reset for a deactivated user." });
      }
      await prisma.passwordResetToken.updateMany({
        where: { subjectId: target.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      const raw = mintRawToken();
      const tokenHash = hashToken(raw, "reset");
      const resetToken = await prisma.passwordResetToken.create({
        data: { tokenHash, subjectId: target.id, issuerId: actorId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        select: { id: true },
      });
      const setPasswordUrl = `${env.NEXTAUTH_URL}/auth/set-password?type=reset&token=${raw}`;
      const sendResult = await emailProvider.sendPasswordReset({ to: target.email, setPasswordUrl });
      if (!sendResult.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send reset email. Please try again." });
      }
      await writeAuditLog({
        category: "ADMIN",
        action: "user.password.reset.issued_by_admin",
        actorId,
        targetType: "AdminUser",
        targetId: target.id,
        metadata: { resetTokenId: resetToken.id },
      });
      return { ok: true };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { mintRawToken, hashToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { emailProvider } from "@/lib/email/provider";
import { env } from "@/lib/env";
import type { AdminRole } from "@prisma/client";

async function requireMinAdminCount(excludeUserId: string): Promise<void> {
  const count = await prisma.adminUser.count({
    where: { role: "ADMIN", active: true, id: { not: excludeUserId } },
  });
  if (count === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot perform this action — at least one active ADMIN must remain.",
    });
  }
}

interface AdminUserBase {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

interface AdminUserItem extends AdminUserBase {
  hasPendingInvite: boolean;
}

export const userRouter = router({
  updateProfile: memberProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase())
          .refine(
            (e) => e.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`),
            { message: `Email must be a @${env.ALLOWED_EMAIL_DOMAIN} address.` }
          )
          .optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(12).max(256).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      const user = await prisma.adminUser.findUniqueOrThrow({
        where: { id: actorId },
        select: { id: true, email: true, name: true, passwordHash: true },
      });

      const updates: Record<string, unknown> = {};
      const auditPromises: Promise<void>[] = [];

      if (input.name !== undefined && input.name !== user.name) {
        updates.name = input.name;
        auditPromises.push(
          writeAuditLog({
            category: "ADMIN",
            action: "user.profile.name_changed",
            actorId,
            targetType: "AdminUser",
            targetId: actorId,
            metadata: {},
          })
        );
      }

      if (input.email !== undefined && input.email !== user.email) {
        const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
        }
        updates.email = input.email;
        auditPromises.push(
          writeAuditLog({
            category: "SECURITY",
            action: "user.profile.email_changed",
            actorId,
            targetType: "AdminUser",
            targetId: actorId,
            metadata: {},
          })
        );
      }

      if (input.currentPassword !== undefined && input.newPassword !== undefined) {
        if (!user.passwordHash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No password is set on this account. Sign in via Google SSO.",
          });
        }
        const valid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect." });
        }
        updates.passwordHash = await hashPassword(input.newPassword);
        auditPromises.push(
          writeAuditLog({
            category: "SECURITY",
            action: "user.password.changed",
            actorId,
            targetType: "AdminUser",
            targetId: actorId,
            metadata: {},
          })
        );
      }

      if (Object.keys(updates).length > 0) {
        await prisma.adminUser.update({ where: { id: actorId }, data: updates });
        await Promise.all(auditPromises);
      }

      return { ok: true };
    }),

  me: memberProcedure.query(async ({ ctx }): Promise<AdminUserBase> => {
    const user = await prisma.adminUser.findUniqueOrThrow({
      where: { id: ctx.session.user.adminUserId! },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLoginAt: true },
    });
    return user;
  }),

  list: adminProcedure.query(async (): Promise<AdminUserItem[]> => {
    const now = new Date();
    const [users, invites] = await Promise.all([
      prisma.adminUser.findMany({
        where: { active: true },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLoginAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.adminInvite.findMany({
        where: { consumedAt: null, expiresAt: { gt: now } },
        select: { subjectId: true },
      }),
    ]);
    const pendingSet = new Set(invites.map((i) => i.subjectId));
    return users.map((u) => ({ ...u, hasPendingInvite: pendingSet.has(u.id) }));
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
        workspaceName: "MrQ Live",
        role: input.role,
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
      const targetForDeactivate = await prisma.adminUser.findUniqueOrThrow({
        where: { id: input.userId },
        select: { role: true },
      });
      if (targetForDeactivate.role === "ADMIN") {
        await requireMinAdminCount(input.userId);
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

  changeRole: adminProcedure
    .input(z.object({ userId: z.string().min(1), role: z.enum(["ADMIN", "MEMBER"]) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      if (input.userId === actorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role." });
      }
      const target = await prisma.adminUser.findUniqueOrThrow({
        where: { id: input.userId },
        select: { id: true, role: true, active: true },
      });
      if (!target.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change role of a deactivated user." });
      }
      if (target.role === "ADMIN" && input.role === "MEMBER") {
        await requireMinAdminCount(input.userId);
      }
      await prisma.$transaction(async (tx) => {
        await tx.adminUser.update({ where: { id: input.userId }, data: { role: input.role } });
        await writeAuditLog({
          category: "ADMIN",
          action: "user.role.changed",
          actorId,
          targetType: "AdminUser",
          targetId: input.userId,
          metadata: { from: target.role, to: input.role },
          tx,
        });
      });
      return { ok: true };
    }),

  cancelInvite: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      await prisma.$transaction(async (tx) => {
        await tx.adminInvite.updateMany({
          where: { subjectId: input.userId, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.adminUser.update({ where: { id: input.userId }, data: { active: false } });
        await writeAuditLog({
          category: "ADMIN",
          action: "user.invite.cancelled",
          actorId,
          targetType: "AdminUser",
          targetId: input.userId,
          metadata: {},
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

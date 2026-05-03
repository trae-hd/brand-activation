import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../init";
import { prisma } from "@/lib/db/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { mintRawToken } from "@/lib/auth/tokens";
import { hashPassword, checkPasswordStrength } from "@/lib/auth/password";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { emailProvider } from "@/lib/email/provider";
import { hmac } from "@/lib/crypto/hmac";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { env } from "@/lib/env";

const PasswordInput = z.string().min(12, "Password must be at least 12 characters.").max(256);

export const authRouter = router({
  validateInvite: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }): Promise<{ email: string; name: string }> => {
      const tokenHash = hashToken(input.token, "invite");
      const invite = await prisma.adminInvite.findUnique({
        where: { tokenHash },
        include: { subject: { select: { email: true, name: true } } },
      });
      if (!invite || invite.consumedAt || invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This link has expired or already been used." });
      }
      return { email: invite.subject.email, name: invite.subject.name };
    }),

  consumeInvite: publicProcedure
    .input(z.object({ token: z.string().min(1), password: PasswordInput }))
    .mutation(async ({ input }): Promise<{ ok: true }> => {
      const strength = checkPasswordStrength(input.password);
      if (!strength.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: strength.message });
      }
      const tokenHash = hashToken(input.token, "invite");
      const invite = await prisma.adminInvite.findUnique({
        where: { tokenHash },
        include: { subject: { select: { id: true, email: true } } },
      });
      if (!invite || invite.consumedAt || invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This link has expired or already been used." });
      }
      const passwordHash = await hashPassword(input.password);
      await prisma.$transaction(async (tx) => {
        await tx.adminUser.update({
          where: { id: invite.subjectId },
          data: { passwordHash },
        });
        await tx.adminInvite.update({
          where: { id: invite.id },
          data: { consumedAt: new Date() },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "user.invite.consumed",
          actorId: invite.subjectId,
          targetType: "AdminInvite",
          targetId: invite.id,
          metadata: { inviteId: invite.id },
          tx,
        });
      });
      return { ok: true };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email().transform((s) => s.toLowerCase()) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      // Rate limits — always run even if no user found.
      const ipHash = hmac.ip(ctx.ip);
      const emailHash = hmac.email(input.email);
      const [ipOk, emailOk] = await Promise.all([
        fixedWindow({ key: `rl:ip:forgot:${ipHash}`, limit: 5, windowSeconds: 3600 }),
        fixedWindow({ key: `rl:email:forgot:${emailHash}`, limit: 3, windowSeconds: 3600 }),
      ]);
      if (!ipOk || !emailOk) return { ok: true }; // Rate-limited but same shape — no enumeration.

      // Always write a requested audit row regardless of match.
      await writeAuditLog({
        category: "SECURITY",
        action: "user.password.reset.requested",
        metadata: { emailHash },
      });

      const user = await prisma.adminUser.findUnique({
        where: { email: input.email },
        select: { id: true, email: true, active: true },
      });
      // No-op for non-existent or inactive users — same shape returned above.
      if (!user || !user.active) return { ok: true };

      // Domain gate on the server side (defence in depth).
      const domain = input.email.split("@")[1];
      if (domain?.toLowerCase() !== env.ALLOWED_EMAIL_DOMAIN.toLowerCase()) return { ok: true };

      // Invalidate prior un-consumed reset tokens.
      await prisma.passwordResetToken.updateMany({
        where: { subjectId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });

      const raw = mintRawToken();
      const tokenHash = hashToken(raw, "reset");
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          tokenHash,
          subjectId: user.id,
          issuerId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const setPasswordUrl = `${env.NEXTAUTH_URL}/auth/set-password?type=reset&token=${raw}`;
      await emailProvider.sendPasswordReset({ to: user.email, setPasswordUrl });
      // Email send failure is swallowed — same response shape either way.
      // The admin can trigger a manual reset from the user-management page.

      await writeAuditLog({
        category: "SECURITY",
        action: "user.password.reset.issued",
        actorId: user.id,
        targetType: "PasswordResetToken",
        targetId: resetToken.id,
        metadata: { emailHash },
      });

      return { ok: true };
    }),

  validateReset: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }): Promise<{ email: string }> => {
      const tokenHash = hashToken(input.token, "reset");
      const reset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { subject: { select: { email: true } } },
      });
      if (!reset || reset.consumedAt || reset.expiresAt < new Date()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This link has expired or already been used." });
      }
      return { email: reset.subject.email };
    }),

  consumePasswordReset: publicProcedure
    .input(z.object({ token: z.string().min(1), password: PasswordInput }))
    .mutation(async ({ input }): Promise<{ ok: true }> => {
      const strength = checkPasswordStrength(input.password);
      if (!strength.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: strength.message });
      }
      const tokenHash = hashToken(input.token, "reset");
      const reset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { subject: { select: { id: true } } },
      });
      if (!reset || reset.consumedAt || reset.expiresAt < new Date()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This link has expired or already been used." });
      }
      const passwordHash = await hashPassword(input.password);
      await prisma.$transaction(async (tx) => {
        await tx.adminUser.update({
          where: { id: reset.subjectId },
          data: { passwordHash },
        });
        await tx.passwordResetToken.update({
          where: { id: reset.id },
          data: { consumedAt: new Date() },
        });
        await writeAuditLog({
          category: "SECURITY",
          action: "user.password.reset.consumed",
          actorId: reset.subjectId,
          targetType: "PasswordResetToken",
          targetId: reset.id,
          tx,
        });
      });
      return { ok: true };
    }),
});

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const ALLOWED_EMAIL_DOMAIN = env.ALLOWED_EMAIL_DOMAIN;

const CredentialsSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(256),
});

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === ALLOWED_EMAIL_DOMAIN.toLowerCase();
}

// Fixed dummy bcrypt hash to keep authorize() runtime ~constant whether the
// AdminUser exists or not. Cost 12 matches the live cost in password.ts.
const DUMMY_BCRYPT_HASH =
  "$2a$12$CwTycUXWue0Thq9StjUM0uJ8B6r5XkO6m9uS4q8xH1F0mQ8hQzrsy";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          hd: env.GOOGLE_WORKSPACE_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
    CredentialsProvider({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        if (!isAllowedEmail(email)) return null;

        const user = await prisma.adminUser.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, active: true, passwordHash: true },
        });

        const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
        const matches = await bcrypt.compare(password, hashToCheck);

        if (!user || !user.active || !user.passwordHash || !matches) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
    updateAge: 60 * 60,
  },

  cookies: {
    sessionToken: {
      name: "__Host-mrq.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: true,
      },
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },

  callbacks: {
    async signIn({ profile, user }) {
      const email = profile?.email ?? user?.email;
      if (!isAllowedEmail(email)) return false;
      // The Google `hd` parameter only restricts the picker; re-verify here.
      if (profile?.email && profile.email.split("@")[1] !== env.GOOGLE_WORKSPACE_DOMAIN) {
        return false;
      }
      const lowerEmail = email!.toLowerCase();
      const admin = await prisma.adminUser.findUnique({
        where: { email: lowerEmail },
        select: { id: true, active: true },
      });
      if (admin) return admin.active;
      // First-time Google sign-in from an allowed domain → auto-provision as MEMBER
      const name =
        (profile as Record<string, string> | undefined)?.name ??
        lowerEmail.split("@")[0];
      await prisma.adminUser.create({
        data: { email: lowerEmail, name, role: "MEMBER", active: true },
      });
      return true;
    },

    async jwt({ token, profile, user }) {
      const email = profile?.email ?? user?.email ?? token.email;
      if (!email) return token;
      const admin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, role: true, active: true },
      });
      if (!admin || !admin.active) {
        token.adminUserId = undefined;
        token.role = undefined;
        token.active = false;
        return token;
      }
      token.adminUserId = admin.id;
      token.role = admin.role;
      token.active = true;
      if (profile || user) {
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.adminUserId = token.adminUserId;
        session.user.role = token.role;
        session.user.active = token.active ?? false;
      }
      return session;
    },
  },

  events: {
    async signIn({ user, account }) {
      const email = user.email;
      if (!email) return;
      const admin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      if (!admin) return;
      await writeAuditLog({
        category: "SECURITY",
        action: "user.signed_in",
        actorId: admin.id,
        metadata: { method: account?.provider === "google" ? "google" : "password" },
      });
    },

    async signOut({ token }) {
      if (!token?.adminUserId) return;
      await writeAuditLog({
        category: "SECURITY",
        action: "user.signed_out",
        actorId: token.adminUserId as string,
      });
    },
  },
};

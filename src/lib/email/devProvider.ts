import type { EmailProvider } from "./provider";

// In-memory OTP store. Valid only in the same Node.js process (Next.js dev
// server). The /api/dev/otp route reads from this map so Playwright tests can
// retrieve codes without a real email send.
const otpStore = new Map<string, string>();

/** Sentinel message ID returned by every dev-provider success path. Lets call
 * sites unconditionally pass `result.messageId` into audit metadata without
 * branching on environment. */
const DEV_MESSAGE_ID = "dev-no-op";

export const devProvider: EmailProvider = {
  async sendOtp({ to, otp }) {
    otpStore.set(to.toLowerCase(), otp);
    console.log(`[devProvider] OTP for ${to}: ${otp}`);
    return { ok: true, messageId: DEV_MESSAGE_ID };
  },
  async sendInvite({ to, name, role }) {
    console.log(`[devProvider] invite email to ${to} — ${name} (${role}) (no-op)`);
    return { ok: true, messageId: DEV_MESSAGE_ID };
  },
  async sendPasswordReset({ to }) {
    console.log(`[devProvider] password reset email to ${to} (no-op)`);
    return { ok: true, messageId: DEV_MESSAGE_ID };
  },
  async sendEntryCodeConfirmation({ to, entryCode, activationName }) {
    console.log(
      `[devProvider] entry code confirmation to ${to} — ${entryCode} for ${activationName} (no-op)`,
    );
    return { ok: true, messageId: DEV_MESSAGE_ID };
  },
};

export function getDevOtp(email: string): string | null {
  return otpStore.get(email.toLowerCase()) ?? null;
}

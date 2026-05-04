import type { EmailProvider } from "./provider";

// In-memory OTP store. Valid only in the same Node.js process (Next.js dev
// server). The /api/dev/otp route reads from this map so Playwright tests can
// retrieve codes without a real email send.
const otpStore = new Map<string, string>();

export const devProvider: EmailProvider = {
  async sendOtp({ to, otp }) {
    otpStore.set(to.toLowerCase(), otp);
    console.log(`[devProvider] OTP for ${to}: ${otp}`);
    return { ok: true };
  },
  async sendInvite({ to, name, role }) {
    console.log(`[devProvider] invite email to ${to} — ${name} (${role}) (no-op)`);
    return { ok: true };
  },
  async sendPasswordReset({ to }) {
    console.log(`[devProvider] password reset email to ${to} (no-op)`);
    return { ok: true };
  },
};

export function getDevOtp(email: string): string | null {
  return otpStore.get(email.toLowerCase()) ?? null;
}

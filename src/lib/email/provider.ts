import { resendProvider } from "./resend";
import { devProvider } from "./devProvider";
import { env } from "@/lib/env";

export interface EmailProvider {
  sendOtp(args: { to: string; otp: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  sendInvite(args: {
    to: string;
    name: string;
    setPasswordUrl: string;
    issuerName: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
  sendPasswordReset(args: {
    to: string;
    setPasswordUrl: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/**
 * The active email provider for this build. Swapping to Postmark (or any
 * other provider) means changing this one line and adding the new
 * implementation file. All call sites MUST import `emailProvider` from this
 * file — never from the implementation file directly.
 *
 * In non-production environments the dev provider is used so that Playwright
 * smoke tests can retrieve OTPs via the /api/dev/otp route without Resend.
 */
export const emailProvider: EmailProvider =
  env.NODE_ENV === "production" ? resendProvider : devProvider;

import { resendProvider } from "./resend";
import { devProvider } from "./devProvider";
import { env } from "@/lib/env";

/**
 * Structured failure shape returned by every method on `EmailProvider`.
 *
 * - `reason: 'rejected'` — Resend returned a 4xx (validation, suppressed
 *   recipient, rate-limit, security_error, restricted/missing API key, etc.)
 *   or any error name the provider doesn't recognise. Not retried.
 * - `reason: 'transient'` — Resend returned a 5xx (`application_error` or
 *   `internal_server_error`), the fetch timed out, or a network error fired.
 *   Retried once before giving up.
 *
 * `attempts` is `1` on the rejected path (no retry) and `2` on the transient
 * double-failure path. `lastError` is `"<name>: <message>"` truncated to 200
 * chars. Never includes recipient email or other PII.
 *
 * Canonical Resend error reference: https://resend.com/docs/api-reference/errors
 */
export type EmailSendFailure = {
  ok: false;
  reason: "rejected" | "transient";
  attempts: 1 | 2;
  lastError: string;
};

/**
 * Successful-send shape, uniform across every method. `messageId` is Resend's
 * outbound message ID — always populated by `ResendEmailProvider`, set to a
 * sentinel by `DevEmailProvider`. Future audit upgrades (recording
 * `resendMessageId` on OTP / invite / reset sends) become a one-line metadata
 * change at the call site rather than a provider refactor.
 */
export type EmailSendSuccess = { ok: true; messageId: string };

export interface EmailProvider {
  sendOtp(args: { to: string; otp: string; primaryColor?: string | null }): Promise<EmailSendSuccess | EmailSendFailure>;
  sendInvite(args: {
    to: string;
    name: string;
    setPasswordUrl: string;
    issuerName: string;
    workspaceName: string;
    role: "ADMIN" | "MEMBER";
  }): Promise<EmailSendSuccess | EmailSendFailure>;
  sendPasswordReset(args: {
    to: string;
    setPasswordUrl: string;
  }): Promise<EmailSendSuccess | EmailSendFailure>;
  sendEntryCodeConfirmation(args: {
    to: string;
    /** Null when the activation has no `entryCodePrefix` — the email still
     * sends but the code block is omitted and the subject/heading adjust. */
    entryCode: string | null;
    activationName: string;
    activationEndsAt: Date;
    supportEmail: string;
    /** `'verify'` for the post-OTP-verification send; `'resend'` for the
     * on-demand send from `/api/resend-confirmation-email`. Threads through
     * to the email template's headline + the audit row's `metadata.cause`. */
    cause: "verify" | "resend";
    // Per-activation email customisation
    emailSubject?: string | null;
    emailPreheader?: string | null;
    emailHeading?: string | null;
    emailBodyContent?: unknown | null;
    emailBodyCopy?: string | null;
    emailShowEntryCode?: boolean | null;
    emailShowEndDate?: boolean | null;
    emailTermsContent?: unknown | null;
    emailFooter?: string | null;
    primaryColor?: string | null;
  }): Promise<EmailSendSuccess | EmailSendFailure>;
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

import React from "react";
import { Resend, type ErrorResponse } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import { OtpEmail } from "./templates/OtpEmail";
import { InviteEmail } from "./templates/InviteEmail";
import { PasswordResetEmail } from "./templates/PasswordResetEmail";
import {
  EntryCodeConfirmationEmail,
  plainTextFor as entryCodeConfirmationText,
  subjectFor as entryCodeConfirmationSubject,
} from "./templates/EntryCodeConfirmationEmail";
import type { EmailProvider, EmailSendFailure, EmailSendSuccess } from "./provider";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = env.EMAIL_FROM;
const TIMEOUT_MS = 5000;
const LAST_ERROR_MAX_CHARS = 200;

/**
 * Resend error names that map to HTTP 5xx in the SDK's
 * RESEND_ERROR_CODES_BY_KEY table. These are the only failures that get
 * retried — everything else is treated as a non-retryable client error.
 *
 * The SDK does not export RESEND_ERROR_CODES_BY_KEY (it's `declare const`,
 * not `export`), so this allowlist is maintained by hand. If the SDK adds
 * new 5xx error names in a future version we'll find out by under-retrying
 * (treating them as rejected) — which is the safer default than retrying
 * a permanent failure.
 */
const TRANSIENT_RESEND_ERROR_NAMES: ReadonlySet<string> = new Set([
  "application_error",
  "internal_server_error",
]);

export type SendFailureReason = "rejected" | "transient";

type SendOnceOk = { ok: true; messageId: string };
type SendOnceFail = { ok: false; reason: SendFailureReason; lastError: string };
type SendOnceResult = SendOnceOk | SendOnceFail;

export type SendWithRetryResult =
  | { ok: true; messageId: string; attempts: 1 | 2 }
  | { ok: false; reason: SendFailureReason; attempts: 1 | 2; lastError: string };

function classifyResendError(err: ErrorResponse): SendFailureReason {
  return TRANSIENT_RESEND_ERROR_NAMES.has(err.name) ? "transient" : "rejected";
}

function truncate(s: string): string {
  return s.length > LAST_ERROR_MAX_CHARS ? s.slice(0, LAST_ERROR_MAX_CHARS) : s;
}

function describeError(err: ErrorResponse): string {
  return truncate(`${err.name}: ${err.message}`);
}

async function sendOnce(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendOnceResult> {
  const sendPromise = resend.emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("resend-timeout")), TIMEOUT_MS),
  );
  try {
    const res = await Promise.race([sendPromise, timeoutPromise]);
    if (res.error) {
      return {
        ok: false,
        reason: classifyResendError(res.error),
        lastError: describeError(res.error),
      };
    }
    if (!res.data?.id) {
      // Defensive: the SDK contract is { data, error } and one is always set,
      // but if a future SDK ever returns both null treat as transient.
      return { ok: false, reason: "transient", lastError: "no message id returned" };
    }
    return { ok: true, messageId: res.data.id };
  } catch (err) {
    // Caught: timeout, fetch network error, AbortError. All transient.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "transient", lastError: truncate(message) };
  }
}

async function sendWithRetry(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendWithRetryResult> {
  const first = await sendOnce(args);
  if (first.ok) return { ...first, attempts: 1 };
  // Don't retry on rejected — the failure is permanent for this request
  // (validation error, suppressed recipient, malformed from, etc.).
  if (first.reason === "rejected") return { ...first, attempts: 1 };
  await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
  const second = await sendOnce(args);
  if (second.ok) return { ...second, attempts: 2 };
  return { ...second, attempts: 2 };
}

/** Strip the helper's internal `attempts` from the success branch (the public
 * interface doesn't carry it on success — only on failure for audit purposes)
 * and pass the failure shape through unchanged. Single adapter shared by
 * every provider method so the public surface is uniform. */
function toProviderResult(result: SendWithRetryResult): EmailSendSuccess | EmailSendFailure {
  if (result.ok) return { ok: true, messageId: result.messageId };
  return {
    ok: false,
    reason: result.reason,
    attempts: result.attempts,
    lastError: result.lastError,
  };
}

export const resendProvider: EmailProvider = {
  sendOtp: async ({ to, otp }) => {
    const formatted = otp.replace(/\s/g, "").replace(/^(\d{3})(\d{3})$/, "$1 $2");
    const html = await render(React.createElement(OtpEmail, { otp, to }));
    const text = `Your MrQ Live verification code is ${formatted}.\n\nIt expires in 10 minutes. We will never ask for this code over email, chat or phone.\n\nIf you didn't try to sign in, you can safely ignore this email.`;
    return toProviderResult(
      await sendWithRetry({ to, subject: `Your MrQ Live code: ${formatted}`, html, text }),
    );
  },

  sendInvite: async ({ to, name, setPasswordUrl, issuerName, workspaceName, role }) => {
    const roleLabel = role === "ADMIN" ? "Administrator" : "Member";
    const html = await render(React.createElement(InviteEmail, { name, setPasswordUrl, issuerName, workspaceName, role }));
    const text = `Hi ${name},\n\n${issuerName} invited you to join ${workspaceName} on MrQ Live as ${roleLabel}.\n\nSet your password here:\n${setPasswordUrl}\n\nThis link expires in 1 hour. If you weren't expecting this invitation, you can ignore this email — no account is created until you accept.`;
    return toProviderResult(
      await sendWithRetry({ to, subject: `${issuerName} invited you to ${workspaceName}`, html, text }),
    );
  },

  sendPasswordReset: async ({ to, setPasswordUrl }) => {
    const html = await render(React.createElement(PasswordResetEmail, { setPasswordUrl, to }));
    const text = `We received a request to reset the password for your MrQ Live account.\n\nChoose a new password here:\n${setPasswordUrl}\n\nThis link expires in 60 minutes. If you didn't request this, you can ignore this email — your password won't change.`;
    return toProviderResult(
      await sendWithRetry({ to, subject: "Reset your MrQ Live password", html, text }),
    );
  },

  sendEntryCodeConfirmation: async ({ to, entryCode, activationName, activationEndsAt, supportEmail }) => {
    const html = await render(
      React.createElement(EntryCodeConfirmationEmail, {
        to,
        entryCode,
        activationName,
        activationEndsAt,
        supportEmail,
      }),
    );
    const text = entryCodeConfirmationText({
      to,
      entryCode,
      activationName,
      activationEndsAt,
      supportEmail,
    });
    const subject = entryCodeConfirmationSubject(activationName);
    return toProviderResult(await sendWithRetry({ to, subject, html, text }));
  },
};

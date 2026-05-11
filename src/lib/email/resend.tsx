import React from "react";
import { Resend } from "resend";
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
import type { EmailProvider } from "./provider";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = env.EMAIL_FROM;
const TIMEOUT_MS = 5000;

type SendResult = { ok: true; messageId: string } | { ok: false };

async function sendOnce(args: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const sendPromise = resend.emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("resend-timeout")), TIMEOUT_MS)
  );
  try {
    const res = await Promise.race([sendPromise, timeoutPromise]);
    if (res.error || !res.data?.id) return { ok: false };
    return { ok: true, messageId: res.data.id };
  } catch {
    return { ok: false };
  }
}

async function sendWithRetry(args: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const first = await sendOnce(args);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
  return sendOnce(args);
}

export const resendProvider: EmailProvider = {
  sendOtp: async ({ to, otp }) => {
    const formatted = otp.replace(/\s/g, "").replace(/^(\d{3})(\d{3})$/, "$1 $2");
    const html = await render(React.createElement(OtpEmail, { otp, to }));
    const text = `Your MrQ Live verification code is ${formatted}.\n\nIt expires in 10 minutes. We will never ask for this code over email, chat or phone.\n\nIf you didn't try to sign in, you can safely ignore this email.`;
    const result = await sendWithRetry({ to, subject: `Your MrQ Live code: ${formatted}`, html, text });
    return result.ok ? { ok: true } : { ok: false, reason: "send-failed" };
  },

  sendInvite: async ({ to, name, setPasswordUrl, issuerName, workspaceName, role }) => {
    const roleLabel = role === "ADMIN" ? "Administrator" : "Member";
    const html = await render(React.createElement(InviteEmail, { name, setPasswordUrl, issuerName, workspaceName, role }));
    const text = `Hi ${name},\n\n${issuerName} invited you to join ${workspaceName} on MrQ Live as ${roleLabel}.\n\nSet your password here:\n${setPasswordUrl}\n\nThis link expires in 1 hour. If you weren't expecting this invitation, you can ignore this email — no account is created until you accept.`;
    const result = await sendWithRetry({ to, subject: `${issuerName} invited you to ${workspaceName}`, html, text });
    return result.ok ? { ok: true } : { ok: false, reason: "send-failed" };
  },

  sendPasswordReset: async ({ to, setPasswordUrl }) => {
    const html = await render(React.createElement(PasswordResetEmail, { setPasswordUrl, to }));
    const text = `We received a request to reset the password for your MrQ Live account.\n\nChoose a new password here:\n${setPasswordUrl}\n\nThis link expires in 60 minutes. If you didn't request this, you can ignore this email — your password won't change.`;
    const result = await sendWithRetry({ to, subject: "Reset your MrQ Live password", html, text });
    return result.ok ? { ok: true } : { ok: false, reason: "send-failed" };
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
    const result = await sendWithRetry({ to, subject, html, text });
    return result.ok ? { ok: true, messageId: result.messageId } : { ok: false, reason: "send-failed" };
  },
};

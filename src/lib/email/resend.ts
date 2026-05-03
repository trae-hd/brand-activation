import { Resend } from "resend";
import { env } from "@/lib/env";
import { otpEmailTemplate } from "./templates/otpEmail";
import { inviteEmailTemplate } from "./templates/inviteEmail";
import { passwordResetEmailTemplate } from "./templates/passwordResetEmail";
import type { EmailProvider } from "./provider";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = env.EMAIL_FROM;
const TIMEOUT_MS = 5000;

async function sendOnce(args: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
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
    return !res.error;
  } catch {
    return false;
  }
}

async function sendWithRetry(args: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (await sendOnce(args)) return true;
  await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
  return sendOnce(args);
}

export const resendProvider: EmailProvider = {
  sendOtp: async ({ to, otp }) => {
    const { subject, html, text } = otpEmailTemplate(otp);
    return (await sendWithRetry({ to, subject, html, text }))
      ? { ok: true }
      : { ok: false, reason: "send-failed" };
  },

  sendInvite: async ({ to, name, setPasswordUrl, issuerName }) => {
    const { subject, html, text } = inviteEmailTemplate({ name, setPasswordUrl, issuerName });
    return (await sendWithRetry({ to, subject, html, text }))
      ? { ok: true }
      : { ok: false, reason: "send-failed" };
  },

  sendPasswordReset: async ({ to, setPasswordUrl }) => {
    const { subject, html, text } = passwordResetEmailTemplate({ setPasswordUrl });
    return (await sendWithRetry({ to, subject, html, text }))
      ? { ok: true }
      : { ok: false, reason: "send-failed" };
  },
};

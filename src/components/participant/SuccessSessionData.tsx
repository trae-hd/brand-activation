"use client";

import { useState } from "react";

interface Props {
  activationSlug: string;
  successCtaLabel: string;
  successCtaUrl: string | null;
  showEntryCode: boolean;
  showResend: boolean;
  showCta: boolean;
  isPreview?: boolean;
}

export function SuccessSessionData({
  activationSlug,
  successCtaLabel,
  successCtaUrl,
  showEntryCode,
  showResend,
  showCta,
  isPreview = false,
}: Props) {
  const [session] = useState<{
    activationId: string | null;
    email: string | null;
    consentVersion: string | null;
    entryCode: string | null;
  }>(() => {
    if (isPreview) {
      return { activationId: "preview", email: "you@example.com", consentVersion: "preview", entryCode: "PREVIEW-CODE" };
    }
    if (typeof window === "undefined") {
      return { activationId: null, email: null, consentVersion: null, entryCode: null };
    }
    return {
      activationId: sessionStorage.getItem(`mrq:activationId:${activationSlug}`),
      email: sessionStorage.getItem(`mrq:email:${activationSlug}`),
      consentVersion: sessionStorage.getItem(`mrq:consentVersion:${activationSlug}`),
      entryCode: sessionStorage.getItem(`mrq:entryCode:${activationSlug}`),
    };
  });

  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  const maskedEmail = session.email
    ? session.email.replace(/^(.)(.*)(@.*)$/, (_, a, _b, domain) => `${a}…${domain}`)
    : null;

  // --primary and --primary-foreground are injected by the server-rendered
  // <main> in success/page.tsx, so bg-primary / text-primary-foreground
  // automatically reflect the activation's brand colour in any theme.

  async function handleResend() {
    const { activationId, email, consentVersion } = session;
    if (isResending || !activationId || !email || !consentVersion) return;
    setIsResending(true);
    try {
      // Phase 5 of POST_VERIFY_EMAIL_PROMPT_V1.5: rewired from /api/register
      // (which no-op'd for VERIFIED rows and visually lied with "Sent!") to
      // the new participant-host endpoint that actually re-dispatches the
      // entry-code confirmation email. Body shape is identical so this is
      // purely a URL change.
      const res = await fetch("/api/resend-confirmation-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activationId, email, consentVersion }),
      });
      if (res.ok) setResent(true);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <>
      {maskedEmail && (
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a confirmation to{" "}
          <span className="underline">{maskedEmail}</span>.
        </p>
      )}

      {showEntryCode && session.entryCode && (
        <div className="mt-5 w-full rounded-md bg-primary p-4 text-primary-foreground">
          <p className="text-xs font-semibold uppercase tracking-widest">
            Your entry code
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-wider">
            {session.entryCode}
          </p>
          <p className="mt-1 text-xs">
            Keep this handy — you&apos;ll need it later.
          </p>
        </div>
      )}

      {showCta && (
        successCtaUrl ? (
          <a
            href={successCtaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground"
          >
            {successCtaLabel}
          </a>
        ) : (
          <button
            type="button"
            className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            {successCtaLabel}
          </button>
        )
      )}

      {showResend && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Didn&apos;t get it?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || resent}
            className="underline text-primary disabled:opacity-50"
          >
            {resent ? "Sent!" : isResending ? "Sending…" : "Resend"}
          </button>
        </p>
      )}
    </>
  );
}

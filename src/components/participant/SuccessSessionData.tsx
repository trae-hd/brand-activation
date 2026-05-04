"use client";

import { useState } from "react";

interface Props {
  activationSlug: string;
  successCtaLabel: string;
  successCtaUrl: string | null;
  showEntryCode: boolean;
  showResend: boolean;
  primaryColor: string | null;
}

export function SuccessSessionData({
  activationSlug,
  successCtaLabel,
  successCtaUrl,
  showEntryCode,
  showResend,
  primaryColor,
}: Props) {
  const [session] = useState<{
    activationId: string | null;
    email: string | null;
    consentVersion: string | null;
    entryCode: string | null;
  }>(() => {
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

  const btnStyle: React.CSSProperties =
    primaryColor?.match(/^#[0-9a-fA-F]{6}$/)
      ? { backgroundColor: primaryColor, color: "#fff" }
      : {};
  const btnClass = primaryColor?.match(/^#[0-9a-fA-F]{6}$/)
    ? ""
    : "bg-primary text-primary-foreground";

  async function handleResend() {
    const { activationId, email, consentVersion } = session;
    if (isResending || !activationId || !email || !consentVersion) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/register", {
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
        <div className="mt-5 w-full rounded-md p-4" style={{ background: "#fef4a8" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your entry code
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-wider">
            {session.entryCode}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep this handy — you&apos;ll need it later.
          </p>
        </div>
      )}

      {successCtaUrl ? (
        <a
          href={successCtaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 block w-full rounded-md px-4 py-3 text-center text-sm font-semibold ${btnClass}`}
          style={btnStyle}
        >
          {successCtaLabel}
        </a>
      ) : (
        <button
          type="button"
          className={`mt-4 w-full rounded-md px-4 py-3 text-sm font-semibold ${btnClass}`}
          style={btnStyle}
        >
          {successCtaLabel}
        </button>
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

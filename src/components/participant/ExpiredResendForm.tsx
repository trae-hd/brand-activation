"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  activationId: string;
  activationSlug: string;
  consentVersion: string;
  defaultEmail: string;
}

export function ExpiredResendForm({
  activationId,
  activationSlug,
  consentVersion,
  defaultEmail,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Replay the participant's original mrqContactConsent answer if we
        // have it in this tab's session — required by the API's Zod schema.
        // If the participant landed here via direct navigation (no prior
        // registration in this tab), default to false; the upsert no-ops on
        // existing rows so this can't overwrite their original answer.
        const mrqContactConsent =
          typeof window !== "undefined" &&
          sessionStorage.getItem(`mrq:mrqContactConsent:${activationSlug}`) === "1";
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activationId, email, consentVersion, mrqContactConsent }),
        });
        if (res.status === 503) {
          setError("Service is briefly unavailable. Please try again in a moment.");
          return;
        }
        if (res.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
          return;
        }
        if (!res.ok) {
          setError("Couldn't send the code. Please check your email address and try again.");
          return;
        }
        const { pendingToken } = (await res.json()) as { pendingToken: string };
        // Seed every session key /verify will read on mount. Direct navigation
        // to /expired (without going through /register first this tab) means
        // these may be missing — we fill them in here so /verify's resend button
        // works without needing a round-trip back to the landing page.
        sessionStorage.setItem(`mrq:pendingToken:${activationSlug}`, pendingToken);
        sessionStorage.setItem(`mrq:activationId:${activationSlug}`, activationId);
        sessionStorage.setItem(`mrq:email:${activationSlug}`, email);
        sessionStorage.setItem(`mrq:consentVersion:${activationSlug}`, consentVersion);
        sessionStorage.setItem(
          `mrq:mrqContactConsent:${activationSlug}`,
          mrqContactConsent ? "1" : "0",
        );
        // Show the helpful post-submit panel rather than auto-redirecting.
        // The participant chooses whether to continue to /verify (new code
        // path) or stay here to check their original confirmation email
        // (already-verified path). This closes the "no code arrives → user
        // sits on /verify forever" dead-end loop without leaking which branch
        // applies via the HTTP response — see thread on response opacity vs
        // observable side-channels.
        setSubmitted(true);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  // ── Post-submit confirmation panel ─────────────────────────────────
  // Same response shape covers both "fresh code issued" and "no-op because
  // already verified". The copy is observability-gated: a stranger without
  // inbox access learns nothing they couldn't already learn from the rate
  // limiter; a legitimate user with inbox access can read it and decide.
  if (submitted) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed">
          If a new code is required, it will arrive shortly. If you have
          already verified your email, your original entry code is still
          active — please check your confirmation email from us.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/${activationSlug}/verify`)}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Enter your new code →
        </button>
        <p className="text-xs text-ink-3">
          Need help?{" "}
          <a
            href="mailto:hello@mrqlive.com"
            className="underline underline-offset-2"
          >
            hello@mrqlive.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="expired-email"
          className="mb-1 block text-xs font-semibold uppercase tracking-wider"
        >
          Email
        </label>
        <input
          id="expired-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        disabled={!email || isPending}
        onClick={submit}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Send a fresh code"}
      </button>
    </div>
  );
}

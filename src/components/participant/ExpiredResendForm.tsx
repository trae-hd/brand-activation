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
        sessionStorage.setItem(
          `mrq:pendingToken:${activationSlug}`,
          pendingToken
        );
        router.push(`/${activationSlug}/verify`);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

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

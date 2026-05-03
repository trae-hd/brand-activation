"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConsentBlock } from "./ConsentBlock";

interface Props {
  activationId: string;
  activationSlug: string;
  boothCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  consentNotice: unknown;
  consentVersion: string;
}

export function RegistrationForm(props: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activationId: props.activationId,
            email,
            consentVersion: props.consentVersion,
            boothCode: props.boothCode,
            utmSource: props.utmSource,
            utmMedium: props.utmMedium,
            utmCampaign: props.utmCampaign,
          }),
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
          setError("Couldn't submit. Please check your email and try again.");
          return;
        }
        const { pendingToken } = (await res.json()) as { pendingToken: string };
        sessionStorage.setItem(`mrq:pendingToken:${props.activationSlug}`, pendingToken);
        router.push(`/${props.activationSlug}/verify`);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border px-3 py-2"
        />
      </label>

      <ConsentBlock notice={props.consentNotice} accepted={consentAccepted} onAccept={setConsentAccepted} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!email || !consentAccepted || isPending}
        onClick={submit}
        className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Sending code…" : "Send me a code"}
      </button>
    </div>
  );
}

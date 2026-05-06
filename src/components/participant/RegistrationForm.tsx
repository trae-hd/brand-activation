"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConsentBlock } from "./ConsentBlock";

interface ConsentItemData {
  text: string;
}

interface Props {
  activationId: string;
  activationSlug: string;
  boothCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  consentNotice: unknown;
  consentVersion: string;
  consentItems?: unknown;
  mrqContactConsentEnabled: boolean;
  ctaText: string | null;
}

function parseItems(raw: unknown): ConsentItemData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && "text" in item)
    .map((item) => ({ text: String((item as { text: unknown }).text ?? "") }))
    .filter((item) => item.text.trim().length > 0);
}

export function RegistrationForm(props: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const items = parseItems(props.consentItems);
  const ctaLabel = props.ctaText?.trim() || "Send me a code";

  // For multi-item consent, track each checkbox independently.
  const [itemChecks, setItemChecks] = useState<boolean[]>(() => items.map(() => false));
  const [mrqContactConsent, setMrqContactConsent] = useState(false);
  const allConsentsChecked =
    (items.length > 0 ? itemChecks.every(Boolean) : consentAccepted) &&
    (!props.mrqContactConsentEnabled || mrqContactConsent);

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
            mrqContactConsent,
            consentItemsAccepted: items.map((item, i) => ({
              text: item.text,
              accepted: itemChecks[i] ?? false,
            })),
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
        sessionStorage.setItem(`mrq:email:${props.activationSlug}`, email);
        sessionStorage.setItem(`mrq:activationId:${props.activationSlug}`, props.activationId);
        sessionStorage.setItem(`mrq:consentVersion:${props.activationSlug}`, props.consentVersion);
        router.push(`/${props.activationSlug}/verify`);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="reg-email"
          className="mb-1 block text-xs font-medium text-ink-3"
        >
          Email
        </label>
        <input
          id="reg-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      {/* Consent: dynamic items or fallback single checkbox */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                id={`reg-consent-${i}`}
                type="checkbox"
                checked={itemChecks[i] ?? false}
                onChange={(e) =>
                  setItemChecks((prev) => {
                    const next = [...prev];
                    next[i] = e.target.checked;
                    return next;
                  })
                }
                required
                className="mt-0.5 shrink-0"
              />
              <label
                htmlFor={`reg-consent-${i}`}
                className="text-sm leading-snug"
              >
                {item.text}
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <input
            id="reg-consent"
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            required
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="reg-consent" className="text-sm leading-snug">
            I&apos;m 18+ and accept the{" "}
            <ConsentBlock notice={props.consentNotice} />
          </label>
        </div>
      )}

      {/* MrQ winner contact consent — shown only when enabled on the activation */}
      {props.mrqContactConsentEnabled && (
        <div className="flex items-start gap-2">
          <input
            id="reg-consent-mrq"
            type="checkbox"
            checked={mrqContactConsent}
            onChange={(e) => setMrqContactConsent(e.target.checked)}
            required
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="reg-consent-mrq" className="text-sm leading-snug">
            I agree to be contacted by MrQ if I am selected as a winner.
          </label>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!email || !allConsentsChecked || isPending}
        onClick={submit}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Sending code…" : ctaLabel}
      </button>
    </div>
  );
}

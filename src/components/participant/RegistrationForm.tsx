"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ConsentItemData {
  text: string;
  required: boolean;
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
    .map((item) => {
      const obj = item as { text: unknown; required?: unknown };
      return {
        text: String(obj.text ?? ""),
        // Items predating the per-item required flag default to required so
        // existing activations behave exactly as they did before this change.
        required: obj.required === false ? false : true,
      };
    })
    .filter((item) => item.text.trim().length > 0);
}

export function RegistrationForm(props: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ageConsent, setAgeConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const items = parseItems(props.consentItems);
  const ctaLabel = props.ctaText?.trim() || "Send me a code";

  // For multi-item consent, track each checkbox independently.
  const [itemChecks, setItemChecks] = useState<boolean[]>(() => items.map(() => false));
  const [mrqContactConsent, setMrqContactConsent] = useState(false);
  // Required items must be ticked; optional items may be unchecked.
  const requiredItemsChecked = items.every((it, i) => !it.required || itemChecks[i]);
  const allConsentsChecked =
    ageConsent &&
    requiredItemsChecked &&
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
            // Snapshot the required flag at submit time so the audit trail is
            // unambiguous even if the activation's consent items are later edited.
            consentItemsAccepted: [
              { text: "I confirm that I am 18+", required: true, accepted: true },
              ...items.map((item, i) => ({
                text: item.text,
                required: item.required,
                accepted: itemChecks[i] ?? false,
              })),
            ],
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
        // Stored so /verify can replay it on resend — /api/register's Zod
        // schema requires mrqContactConsent on every call.
        sessionStorage.setItem(
          `mrq:mrqContactConsent:${props.activationSlug}`,
          mrqContactConsent ? "1" : "0",
        );
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

      {/* Age consent — always first, required on every activation */}
      <div className="flex items-start gap-2">
        <input
          id="reg-age-consent"
          type="checkbox"
          checked={ageConsent}
          onChange={(e) => setAgeConsent(e.target.checked)}
          required
          className="mt-0.5 shrink-0"
        />
        <label htmlFor="reg-age-consent" className="text-sm leading-snug min-w-0">
          I confirm that I am 18+
          <span className="text-destructive ml-0.5" aria-label="required">*</span>
        </label>
      </div>

      {/* Custom consent items */}
      {items.length > 0 && (
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
                required={item.required}
                className="mt-0.5 shrink-0"
              />
              <label
                htmlFor={`reg-consent-${i}`}
                className="text-sm leading-snug break-words min-w-0"
              >
                {item.text}
                {item.required && (
                  <span className="text-destructive ml-0.5" aria-label="required">
                    *
                  </span>
                )}
              </label>
            </div>
          ))}
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
          <label htmlFor="reg-consent-mrq" className="text-sm leading-snug min-w-0">
            I agree to be contacted by MrQ if I am selected as a winner.
            <span className="text-destructive ml-0.5" aria-label="required">*</span>
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

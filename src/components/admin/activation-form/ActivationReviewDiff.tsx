"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ActivationPreview } from "./ActivationPreview";
import type { ConsentItem } from "@/types/activation";

function parseSnapshotConsentItems(raw: unknown): ConsentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && "text" in item)
    .map((item, i) => {
      const obj = item as { text: unknown; required?: unknown };
      return {
        id: `snap-${i}`,
        text: String(obj.text ?? ""),
        required: obj.required === false ? false : true,
      };
    });
}

interface Props {
  // Last approved snapshot
  snapshot: Record<string, unknown>;
  consentVersionApproved: string;
  // Current (pending) state
  name: string;
  slug: string;
  participantHost: string;
  heroImageUrl: string;
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  mrqContactConsentEnabled: boolean;
  ctaText: string;
  termsContent: unknown;
  primaryColor: string;
  currentConsentVersion: string;
  // Controlled consent-diff acknowledgement
  acknowledgedConsentDiff: boolean;
  onAcknowledgedChange: (v: boolean) => void;
}

export function ActivationReviewDiff({
  snapshot,
  consentVersionApproved,
  name,
  slug,
  participantHost,
  heroImageUrl,
  content,
  consentNotice,
  consentItems,
  mrqContactConsentEnabled,
  ctaText,
  termsContent,
  primaryColor,
  currentConsentVersion,
  acknowledgedConsentDiff,
  onAcknowledgedChange,
}: Props) {
  const hasConsentDiff =
    consentVersionApproved !== currentConsentVersion;

  const snapshotName = String(snapshot.name ?? "");
  const snapshotSlug = String(snapshot.slug ?? "");
  const snapshotHeroImageUrl = String(snapshot.heroImageUrl ?? "");
  const snapshotContent = snapshot.content ?? null;
  const snapshotConsentNotice = snapshot.consentNotice ?? null;
  const snapshotConsentItems = parseSnapshotConsentItems(snapshot.consentItems);
  const snapshotCtaText = String(snapshot.ctaText ?? "");
  const snapshotTermsContent = snapshot.termsContent ?? null;
  const snapshotPrimaryColor = String(snapshot.primaryColor ?? "");
  // Snapshot's mrqContactConsentEnabled — read defensively because activations
  // approved before this field existed won't have it on their snapshot.
  const snapshotMrqContactConsentEnabled =
    typeof snapshot.mrqContactConsentEnabled === "boolean"
      ? snapshot.mrqContactConsentEnabled
      : false;

  return (
    <div className="flex flex-col gap-4">
      {/* Side-by-side previews */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Last approved
          </p>
          <div className="rounded-md border bg-muted/10 p-2">
            <ActivationPreview
              mode="readonly-diff"
              name={snapshotName}
              slug={snapshotSlug}
              participantHost={participantHost}
              heroImageUrl={snapshotHeroImageUrl}
              content={snapshotContent}
              consentNotice={snapshotConsentNotice}
              consentItems={snapshotConsentItems}
              mrqContactConsentEnabled={snapshotMrqContactConsentEnabled}
              ctaText={snapshotCtaText}
              termsContent={snapshotTermsContent}
              primaryColor={snapshotPrimaryColor}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pending changes
          </p>
          <div className="rounded-md border bg-muted/10 p-2 ring-1 ring-blue-500/30">
            <ActivationPreview
              mode="readonly-diff"
              name={name}
              slug={slug}
              participantHost={participantHost}
              heroImageUrl={heroImageUrl}
              content={content}
              consentNotice={consentNotice}
              consentItems={consentItems}
              mrqContactConsentEnabled={mrqContactConsentEnabled}
              ctaText={ctaText}
              termsContent={termsContent}
              primaryColor={primaryColor}
            />
          </div>
        </div>
      </div>

      {/* Consent-diff acknowledgement */}
      {hasConsentDiff && (
        <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <Checkbox
            id="consent-diff-ack"
            checked={acknowledgedConsentDiff}
            onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
            className="mt-0.5 shrink-0"
          />
          <label htmlFor="consent-diff-ack" className="cursor-pointer text-sm leading-snug text-amber-800 dark:text-amber-300">
            I confirm I have reviewed the consent notice changes in this version
            and they are compliant with applicable data-protection requirements.
          </label>
        </div>
      )}
    </div>
  );
}

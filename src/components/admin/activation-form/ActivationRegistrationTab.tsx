"use client";

import { useCallback } from "react";
import { TiptapEditor } from "@/components/admin/TiptapEditor";
import { Input } from "@/components/ui/input";
import { CharCount } from "@/components/ui/CharCount";
import { CONTENT_ALLOWLIST, CONSENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import type { RegistrationFormState } from "@/types/activation";
import { ActivationFormHeroImage } from "./ActivationFormHeroImage";
import { ActivationFormConsent } from "./ActivationFormConsent";
import { SectionLabel, Rule } from "./form-section";

interface Props {
  value: RegistrationFormState;
  onChange: (next: RegistrationFormState) => void;
  onAnyChange: () => void;
}

export function ActivationRegistrationTab({ value, onChange, onAnyChange }: Props) {
  const handleContentChange = useCallback(
    (doc: unknown) => {
      onChange({ ...value, content: doc });
      onAnyChange();
    },
    [value, onChange, onAnyChange],
  );

  const handleConsentNoticeChange = useCallback(
    (doc: unknown) => {
      onChange({ ...value, consentNotice: doc });
      onAnyChange();
    },
    [value, onChange, onAnyChange],
  );

  const handleTermsChange = useCallback(
    (doc: unknown) => {
      onChange({ ...value, termsContent: doc });
      onAnyChange();
    },
    [value, onChange, onAnyChange],
  );

  return (
    <div className="flex flex-col gap-6">
      <ActivationFormHeroImage
        heroImageUrl={value.heroImageUrl}
        onChange={(url) => { onChange({ ...value, heroImageUrl: url }); onAnyChange(); }}
        altText={value.heroImageAlt}
        onAltTextChange={(alt) => { onChange({ ...value, heroImageAlt: alt }); onAnyChange(); }}
        constraints={{
          // 300 KB cap — keeps the participant page snappy on event Wi-Fi.
          maxSizeBytes: 300_000,
          // 2:1 with ±2.5% tolerance (so 1.95–2.05 passes silently).
          aspectRange: [1.95, 2.05],
          aspectLabel: "2:1",
        }}
      />

      {/* Marketing copy */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Marketing copy</SectionLabel>
        <p className="text-muted-foreground text-xs">
          Shown below the activation title on the registration form.
        </p>
        <TiptapEditor
          content={value.content}
          onChange={handleContentChange}
          allowlist={CONTENT_ALLOWLIST}
        />
      </div>

      {/* Consent notice */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Consent notice</SectionLabel>
        <p className="text-muted-foreground text-xs">
          The overarching consent statement shown above the individual consent checkboxes.
        </p>
        <TiptapEditor
          content={value.consentNotice}
          onChange={handleConsentNoticeChange}
          allowlist={CONSENT_ALLOWLIST}
        />
      </div>

      <ActivationFormConsent
        consentItems={value.consentItems}
        onChange={(items) => {
          onChange({ ...value, consentItems: items });
          onAnyChange();
        }}
        mrqContactConsentEnabled={value.mrqContactConsentEnabled}
        onMrqContactConsentEnabledChange={(v) => {
          onChange({ ...value, mrqContactConsentEnabled: v });
          onAnyChange();
        }}
      />

      {/* CTA copy */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          CTA copy <CharCount value={value.ctaText} max={100} />
        </SectionLabel>
        <Input
          value={value.ctaText}
          onChange={(e) => {
            onChange({ ...value, ctaText: e.target.value });
            onAnyChange();
          }}
          placeholder="Send me a code"
          maxLength={100}
          className="max-w-sm text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Label on the submit button. Defaults to &ldquo;Send me a code&rdquo; if left blank.
        </p>
      </div>

      <Rule />

      {/* T&Cs */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Terms &amp; Conditions</SectionLabel>
        <p className="text-muted-foreground text-xs">
          Shown as an expandable accordion at the bottom of the registration form. Leave empty
          to show only the static &ldquo;T&amp;Cs apply.&rdquo; line.
        </p>
        <TiptapEditor
          content={value.termsContent}
          onChange={handleTermsChange}
          allowlist={CONTENT_ALLOWLIST}
        />
      </div>
    </div>
  );
}

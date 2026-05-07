"use client";

import { useCallback } from "react";
import { TiptapEditor } from "@/components/admin/TiptapEditor";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CharCount } from "@/components/ui/CharCount";
import { CONTENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import type { SuccessFormState } from "@/types/activation";
import { ActivationFormHeroImage } from "./ActivationFormHeroImage";
import { SectionLabel, Rule } from "./form-section";
import { SuccessTabBanner } from "./SuccessTabBanner";
import { DynamicIcon } from "@/components/ui/DynamicIcon";

interface Props {
  value: SuccessFormState;
  onChange: (next: SuccessFormState) => void;
  onAnyChange: () => void;
  activationId?: string;
  mode: "create" | "edit";
  slug: string;
  startsAt: string;
  endsAt: string;
  entryCodePrefix: string;
}

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function formatDatetimeLocal(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ActivationSuccessTab({ value, onChange, onAnyChange, activationId, mode, slug, startsAt, endsAt, entryCodePrefix }: Props) {
  const handleContentChange = useCallback(
    (doc: unknown) => {
      onChange({ ...value, successContent: doc });
      onAnyChange();
    },
    [value, onChange, onAnyChange],
  );

  function set<K extends keyof SuccessFormState>(key: K, val: SuccessFormState[K]) {
    onChange({ ...value, [key]: val });
    onAnyChange();
  }

  const hasSponsor = !!(
    value.successSponsorHeadline.trim() ||
    value.successSponsorBody.trim() ||
    value.successSponsorCtaLabel.trim() ||
    value.successSponsorLogoUrl
  );

  return (
    <div className="flex flex-col gap-6">
      <SuccessTabBanner activationId={activationId} mode={mode} />

      {/* Shared fields read-only summary */}
      <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 px-3 py-2.5">
        <DynamicIcon name="Info" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            Dates, slug, and entry code prefix are shared with the registration page — edit them in
            the main form above.
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground/70 font-medium">Slug</dt>
            <dd className="font-mono text-foreground truncate">{slug || <span className="text-muted-foreground/50 italic">not set</span>}</dd>
            <dt className="text-muted-foreground/70 font-medium">Starts</dt>
            <dd className="text-foreground">{formatDatetimeLocal(startsAt)}</dd>
            <dt className="text-muted-foreground/70 font-medium">Ends</dt>
            <dd className="text-foreground">{formatDatetimeLocal(endsAt)}</dd>
            {entryCodePrefix && (
              <>
                <dt className="text-muted-foreground/70 font-medium">Code prefix</dt>
                <dd className="font-mono text-foreground">{entryCodePrefix.toUpperCase()}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* ── Confirmation message ──────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Heading <CharCount value={value.successHeading} max={200} />
        </SectionLabel>
        <Input
          value={value.successHeading}
          onChange={(e) => set("successHeading", e.target.value)}
          placeholder="You're on the list."
          maxLength={200}
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          Defaults to &ldquo;You&apos;re on the list.&rdquo; if left blank.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Subheading{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>{" "}
          <CharCount value={value.successSubheading} max={500} />
        </SectionLabel>
        <Input
          value={value.successSubheading}
          onChange={(e) => set("successSubheading", e.target.value)}
          placeholder="Short message above the content block…"
          maxLength={500}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Content{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
        </SectionLabel>
        <TiptapEditor
          content={value.successContent ?? EMPTY_DOC}
          onChange={handleContentChange}
          allowlist={CONTENT_ALLOWLIST}
        />
      </div>

      {/* ── Main CTA ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>
            CTA label <CharCount value={value.successCtaLabel} max={100} />
          </SectionLabel>
          <Input
            value={value.successCtaLabel}
            onChange={(e) => set("successCtaLabel", e.target.value)}
            placeholder="Open my email"
            maxLength={100}
            className="text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Defaults to &ldquo;Open my email&rdquo; if blank.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionLabel>
            CTA URL{" "}
            <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
          </SectionLabel>
          <Input
            type="url"
            value={value.successCtaUrl}
            onChange={(e) => set("successCtaUrl", e.target.value)}
            placeholder="https://…"
            className="text-sm"
          />
        </div>
      </div>

      {/* ── Display toggles ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <SectionLabel>Display options</SectionLabel>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={value.successShowEntryCode}
            onCheckedChange={(checked) => set("successShowEntryCode", checked === true)}
          />
          <span className="text-sm">Show entry code</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={value.successShowResend}
            onCheckedChange={(checked) => set("successShowResend", checked === true)}
          />
          <span className="text-sm">Show &ldquo;Resend&rdquo; link</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={value.successShowCta}
            onCheckedChange={(checked) => set("successShowCta", checked === true)}
          />
          <span className="text-sm">Show CTA button</span>
        </label>
        <p className="text-muted-foreground -mt-1 ml-7 text-xs">
          Hide for activations where there&apos;s no follow-up email or external action to nudge the
          participant to.
        </p>
      </div>

      <Rule />

      {/* ── Sponsor block ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <SectionLabel>Sponsor / promo block</SectionLabel>
        <p className="text-muted-foreground text-xs mb-3">
          Shown at the bottom of the success page. Leave all fields empty to omit the section entirely.
          When no sponsor is set, the MrQ house ad is shown as a fallback.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Sponsor name{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>{" "}
          <CharCount value={value.successSponsorName} max={200} />
        </SectionLabel>
        <Input
          value={value.successSponsorName}
          onChange={(e) => set("successSponsorName", e.target.value)}
          placeholder="Acme Corp"
          maxLength={200}
          className="text-sm"
        />
        {value.successSponsorName.trim() ? (
          <p className="text-muted-foreground text-xs">
            Divider reads: &ldquo;Brought to you by {value.successSponsorName.trim()}&rdquo;
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Divider reads: &ldquo;Brought to you by&rdquo; when left blank.
          </p>
        )}
      </div>

      <ActivationFormHeroImage
        heroImageUrl={value.successSponsorLogoUrl}
        onChange={(url) => set("successSponsorLogoUrl", url)}
        altText={value.successSponsorLogoAlt}
        onAltTextChange={(alt) => set("successSponsorLogoAlt", alt)}
        label="Sponsor logo"
      />

      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Sponsor headline{" "}
          <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>{" "}
          <CharCount value={value.successSponsorHeadline} max={200} />
        </SectionLabel>
        <Input
          value={value.successSponsorHeadline}
          onChange={(e) => set("successSponsorHeadline", e.target.value)}
          placeholder="Sponsor headline goes here"
          maxLength={200}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>
          Short description <CharCount value={value.successSponsorBody} max={90} />
        </SectionLabel>
        <Input
          value={value.successSponsorBody}
          onChange={(e) => set("successSponsorBody", e.target.value.slice(0, 90))}
          placeholder="A short message — 90 chars max."
          maxLength={90}
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>
            Sponsor CTA label{" "}
            <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>{" "}
            <CharCount value={value.successSponsorCtaLabel} max={100} />
          </SectionLabel>
          <Input
            value={value.successSponsorCtaLabel}
            onChange={(e) => set("successSponsorCtaLabel", e.target.value)}
            placeholder="Sponsor CTA"
            maxLength={100}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionLabel>
            Sponsor CTA URL{" "}
            <span className="text-muted-foreground/60 tracking-normal normal-case">(optional)</span>
          </SectionLabel>
          <Input
            type="url"
            value={value.successSponsorCtaUrl}
            onChange={(e) => set("successSponsorCtaUrl", e.target.value)}
            placeholder="https://…"
            className="text-sm"
          />
        </div>
      </div>

      {hasSponsor && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Preview:</span> sponsor block will appear at
          the bottom of the success page with a &ldquo;Not interested? Hide promos&rdquo; dismiss link.
        </p>
      )}
    </div>
  );
}

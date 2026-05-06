"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { StatusTransitionDialog } from "@/components/admin/StatusTransitionDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { statusBadgeClass, reviewStatusBadge } from "@/lib/activationStatus";
import type { ActivationReviewStatus, ActivationStatus } from "@prisma/client";
import type {
  ActivationFormProps,
  ConsentItem,
  BoothRow,
  RegistrationFormState,
  SuccessFormState,
} from "@/types/activation";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { ActivationFormBooths } from "./activation-form/ActivationFormBooths";
import { ActivationFormBranding } from "./activation-form/ActivationFormBranding";
import { ActivationFormUtm } from "./activation-form/ActivationFormUtm";
import { ActivationFormReview } from "./activation-form/ActivationFormReview";
import { ActivationFormSaveBar } from "./activation-form/ActivationFormSaveBar";
import { ActivationPreview } from "./activation-form/ActivationPreview";
import { ActivationRegistrationTab } from "./activation-form/ActivationRegistrationTab";
import { ActivationSuccessTab } from "./activation-form/ActivationSuccessTab";
import { SectionLabel, Rule } from "./activation-form/form-section";
import { useTabUrlState } from "@/lib/admin/useTabUrlState";
import { useUnsavedChangesGuard } from "@/lib/admin/useUnsavedChangesGuard";

export type { ActivationFormProps };

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function parseConsentItems(raw: unknown): ConsentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && "text" in item)
    .map((item, i) => ({
      id: `init-${i}`,
      text: String((item as { text: unknown }).text ?? ""),
    }));
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function autoSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function ActivationForm({ mode, userRole, currentUserId, initialData, participantBaseUrl, previewToken }: ActivationFormProps) {
  const router = useRouter();
  const { tab, preview, setTab, setPreview } = useTabUrlState();
  const isAdmin = userRole === "ADMIN";
  const isCreator = !!currentUserId && currentUserId === initialData?.createdById;
  // Display-only host (e.g. "live.hqmops.com") — derived from the env-driven
  // base URL so labels track whichever domain the deployment is serving.
  const participantHost = new URL(participantBaseUrl).host;

  // ── Parent-level state (always-visible header + branding) ──────────
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [startsAt, setStartsAt] = useState(
    initialData ? toDatetimeLocal(new Date(initialData.startsAt)) : "",
  );
  const [endsAt, setEndsAt] = useState(
    initialData ? toDatetimeLocal(new Date(initialData.endsAt)) : "",
  );
  const [primaryColor, setPrimaryColor] = useState(initialData?.primaryColor ?? "");
  const [timezone, setTimezone] = useState(initialData?.timezone ?? "Europe/London");
  const [entryCodePrefix, setEntryCodePrefix] = useState(initialData?.entryCodePrefix ?? "");
  const [booths, setBooths] = useState<BoothRow[]>(initialData?.booths ?? []);
  const [utmSource, setUtmSource] = useState(initialData?.utmSource ?? "");
  const [utmMedium, setUtmMedium] = useState(initialData?.utmMedium ?? "");
  const [utmCampaign, setUtmCampaign] = useState(initialData?.utmCampaign ?? "");

  function handleUtmChange(field: "utmSource" | "utmMedium" | "utmCampaign", value: string) {
    if (field === "utmSource") setUtmSource(value);
    else if (field === "utmMedium") setUtmMedium(value);
    else setUtmCampaign(value);
  }

  // ── Registration tab state ─────────────────────────────────────────
  const [registration, setRegistration] = useState<RegistrationFormState>({
    content: initialData?.content ?? EMPTY_DOC,
    consentNotice: initialData?.consentNotice ?? EMPTY_DOC,
    consentItems: parseConsentItems(initialData?.consentItems),
    ctaText: initialData?.ctaText ?? "",
    termsContent: initialData?.termsContent ?? EMPTY_DOC,
    heroImageUrl: initialData?.heroImageUrl ?? "",
    heroImageAlt: initialData?.heroImageAlt ?? "",
    mrqContactConsentEnabled: initialData?.mrqContactConsentEnabled ?? true,
  });

  // ── Success tab state ──────────────────────────────────────────────
  const [success, setSuccess] = useState<SuccessFormState>({
    successHeading: initialData?.successHeading ?? "",
    successSubheading: initialData?.successSubheading ?? "",
    successContent: initialData?.successContent ?? EMPTY_DOC,
    successCtaLabel: initialData?.successCtaLabel ?? "",
    successCtaUrl: initialData?.successCtaUrl ?? "",
    successShowEntryCode: initialData?.successShowEntryCode ?? true,
    successShowResend: initialData?.successShowResend ?? true,
    successSponsorName: initialData?.successSponsorName ?? "",
    successSponsorLogoUrl: initialData?.successSponsorLogoUrl ?? "",
    successSponsorLogoAlt: initialData?.successSponsorLogoAlt ?? "",
    successSponsorHeadline: initialData?.successSponsorHeadline ?? "",
    successSponsorBody: initialData?.successSponsorBody ?? "",
    successSponsorCtaLabel: initialData?.successSponsorCtaLabel ?? "",
    successSponsorCtaUrl: initialData?.successSponsorCtaUrl ?? "",
  });

  // ── Review state ───────────────────────────────────────────────────
  const [reviewStatus, setReviewStatus] = useState<ActivationReviewStatus>(
    initialData?.reviewStatus ?? "DRAFT",
  );
  const [submittedAt, setSubmittedAt] = useState<Date | null>(
    initialData?.submittedAt ?? null,
  );
  const [approvedAt, setApprovedAt] = useState<Date | null>(
    initialData?.approvedAt ?? null,
  );
  const [reviewNotes, setReviewNotes] = useState<string | null>(
    initialData?.reviewNotes ?? null,
  );

  // ── Status transition state ────────────────────────────────────────
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ActivationStatus>(
    initialData?.status ?? "DRAFT",
  );

  // ── Save + dirty state ─────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useUnsavedChangesGuard(isDirty && mode === "edit");

  const markDirty = useCallback(() => setIsDirty(true), []);

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        name,
        slug,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        content: registration.content as Record<string, unknown>,
        consentNotice: registration.consentNotice as Record<string, unknown>,
        consentItems: registration.consentItems.map(({ text }) => ({ text })),
        ctaText: registration.ctaText.trim() || null,
        termsContent: registration.termsContent as Record<string, unknown>,
        primaryColor: primaryColor || null,
        heroImageUrl: registration.heroImageUrl || null,
        heroImageAlt: registration.heroImageAlt.trim() || null,
        timezone,
        entryCodePrefix: entryCodePrefix.trim().toUpperCase() || null,
        // Success page fields
        successHeading: success.successHeading.trim() || null,
        successSubheading: success.successSubheading.trim() || null,
        successContent: success.successContent as Record<string, unknown>,
        successCtaLabel: success.successCtaLabel.trim() || null,
        successCtaUrl: success.successCtaUrl.trim() || null,
        successShowEntryCode: success.successShowEntryCode,
        successShowResend: success.successShowResend,
        // Sponsor block
        successSponsorName: success.successSponsorName.trim() || null,
        successSponsorLogoUrl: success.successSponsorLogoUrl || null,
        successSponsorLogoAlt: success.successSponsorLogoAlt.trim() || null,
        successSponsorHeadline: success.successSponsorHeadline.trim() || null,
        successSponsorBody: success.successSponsorBody.trim() || null,
        successSponsorCtaLabel: success.successSponsorCtaLabel.trim() || null,
        successSponsorCtaUrl: success.successSponsorCtaUrl.trim() || null,
        utmSource: utmSource.trim() || null,
        utmMedium: utmMedium.trim() || null,
        utmCampaign: utmCampaign.trim() || null,
        mrqContactConsentEnabled: registration.mrqContactConsentEnabled,
      };
      if (mode === "create") {
        const result = await trpc.activation.create.mutate(payload);
        router.push(`/activations/${result.id}/edit?tab=success`);
      } else {
        await trpc.activation.update.mutate({ id: initialData!.id, data: payload });
        setIsDirty(false);
        router.refresh();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Save failed. Please try again.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex w-full items-start gap-8">
      {/* ── Left: form pane ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-6 pb-12">
        {/* Status badge + change status */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Badge className={statusBadgeClass(currentStatus)}>{currentStatus}</Badge>
            {(() => {
              const rb = reviewStatusBadge(reviewStatus);
              return rb ? (
                <Badge className={rb.className}>{rb.label}</Badge>
              ) : null;
            })()}
            {initialData && (isAdmin || isCreator) && (
              <button
                type="button"
                onClick={() => setTransitionDialogOpen(true)}
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 transition-colors"
              >
                Change status
              </button>
            )}
          </div>
        </div>

        {/* Activation name */}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (mode === "create") setSlug(autoSlug(e.target.value));
            markDirty();
          }}
          placeholder={mode === "create" ? "New Activation" : "Activation name"}
          className="placeholder:text-muted-foreground/40 hover:border-muted-foreground/20 focus:border-primary w-full border-b border-transparent bg-transparent pb-0.5 text-2xl font-semibold transition-colors outline-none"
        />

        {initialData && (
          <StatusTransitionDialog
            open={transitionDialogOpen}
            onOpenChange={setTransitionDialogOpen}
            activationId={initialData.id}
            currentStatus={currentStatus}
            reviewStatus={reviewStatus}
            startsAt={new Date(initialData.startsAt)}
            endsAt={new Date(initialData.endsAt)}
            slug={slug}
            content={registration.content}
            consentNotice={registration.consentNotice}
            consentItems={registration.consentItems}
            boothCount={booths.length}
            isCreator={currentUserId === initialData.createdById}
            onSuccess={(newStatus) => {
              setCurrentStatus(newStatus);
              router.refresh();
            }}
            onReviewStatusChange={(newReviewStatus) => {
              setReviewStatus(newReviewStatus);
              router.refresh();
            }}
          />
        )}

        <Rule />

        {/* Slug · Starts · Ends */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Slug</SectionLabel>
            <div className="bg-background focus-within:ring-ring flex items-center overflow-hidden rounded-md border text-sm focus-within:ring-1">
              <span className="bg-muted/50 text-muted-foreground border-r px-2 py-2 font-mono text-[11px] whitespace-nowrap select-none">
                {participantHost}/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  markDirty();
                }}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-xs outline-none"
                placeholder="slug"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Starts</SectionLabel>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => { setStartsAt(e.target.value); markDirty(); }}
              className="text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Ends</SectionLabel>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => { setEndsAt(e.target.value); markDirty(); }}
              className="text-sm"
              required
            />
          </div>
        </div>

        {/* ── Tab selector ── */}
        <div className="flex rounded-md border overflow-hidden text-sm font-medium">
          {(["registration", "success"] as const).map((t) => {
            const previewHref =
              mode === "edit" && slug
                ? `${participantBaseUrl}/${slug}${t === "success" ? "/success" : ""}?preview=true${previewToken ? `&pt=${previewToken}` : ""}`
                : null;
            return (
              <div
                key={t}
                className={cn(
                  "flex flex-1 items-center justify-center transition-colors",
                  tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setTab(t)}
                  className="flex-1 py-2"
                >
                  {t === "registration" ? "Registration page" : "Success page"}
                </button>
                {previewHref && (
                  <a
                    href={previewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={`Preview ${t} page`}
                    className={cn(
                      "pr-3 opacity-60 hover:opacity-100 transition-opacity",
                      tab === t ? "text-background" : "text-muted-foreground",
                    )}
                  >
                    <DynamicIcon name="ExternalLink" className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        {tab === "registration" ? (
          <ActivationRegistrationTab
            value={registration}
            onChange={setRegistration}
            onAnyChange={markDirty}
          />
        ) : (
          <ActivationSuccessTab
            value={success}
            onChange={setSuccess}
            onAnyChange={markDirty}
            activationId={initialData?.id}
            mode={mode}
            slug={slug}
            startsAt={startsAt}
            endsAt={endsAt}
            entryCodePrefix={entryCodePrefix}
          />
        )}

        <Rule />

        <ActivationFormBranding
          primaryColor={primaryColor}
          timezone={timezone}
          entryCodePrefix={entryCodePrefix}
          onPrimaryColorChange={(v) => { setPrimaryColor(v); markDirty(); }}
          onTimezoneChange={(v) => { setTimezone(v); markDirty(); }}
          onEntryCodePrefixChange={(v) => { setEntryCodePrefix(v); markDirty(); }}
        />

        <Rule />

        <ActivationFormUtm
          slug={slug}
          activationId={initialData?.id}
          participantBaseUrl={participantBaseUrl}
          utmSource={utmSource}
          utmMedium={utmMedium}
          utmCampaign={utmCampaign}
          onUtmChange={handleUtmChange}
        />

        <ActivationFormBooths
          mode={mode}
          activationId={initialData?.id}
          booths={booths}
          onBoothsChange={setBooths}
          utmSource={utmSource}
          utmMedium={utmMedium}
          utmCampaign={utmCampaign}
        />

        {mode === "edit" && (
          <>
            <Rule />
            <ActivationFormReview
              mode={mode}
              isAdmin={isAdmin}
              isCreator={isCreator}
              activationId={initialData!.id}
              reviewStatus={reviewStatus}
              submittedAt={submittedAt}
              approvedAt={approvedAt}
              reviewNotes={reviewNotes}
              currentStatus={currentStatus}
              consentVersion={initialData!.consentVersion}
              name={name}
              slug={slug}
              participantHost={participantHost}
              heroImageUrl={registration.heroImageUrl}
              content={registration.content}
              consentNotice={registration.consentNotice}
              consentItems={registration.consentItems}
              ctaText={registration.ctaText}
              termsContent={registration.termsContent}
              primaryColor={primaryColor}
              onReviewChange={(updates) => {
                setReviewStatus(updates.reviewStatus);
                if ("submittedAt" in updates) setSubmittedAt(updates.submittedAt ?? null);
                if ("approvedAt" in updates) setApprovedAt(updates.approvedAt ?? null);
                if ("reviewNotes" in updates) setReviewNotes(updates.reviewNotes ?? null);
              }}
              onOpenTransitionDialog={() => setTransitionDialogOpen(true)}
            />
          </>
        )}

        <ActivationFormSaveBar
          mode={mode}
          isSaving={isSaving}
          saveError={saveError}
          reviewStatus={reviewStatus}
          currentStatus={currentStatus}
          name={name}
          onSave={handleSave}
          onCancel={() => router.back()}
        />
      </div>

      {/* ── Right: live preview ── */}
      <ActivationPreview
        preview={preview}
        onPreviewChange={setPreview}
        name={name}
        slug={slug}
        participantHost={participantHost}
        primaryColor={primaryColor}
        heroImageUrl={registration.heroImageUrl}
        content={registration.content}
        consentNotice={registration.consentNotice}
        consentItems={registration.consentItems}
        ctaText={registration.ctaText}
        termsContent={registration.termsContent}
        successHeading={success.successHeading}
        successSubheading={success.successSubheading}
        successContent={success.successContent}
        successCtaLabel={success.successCtaLabel}
        successShowEntryCode={success.successShowEntryCode}
        successShowResend={success.successShowResend}
        successSponsorLogoUrl={success.successSponsorLogoUrl}
        successSponsorHeadline={success.successSponsorHeadline}
        successSponsorBody={success.successSponsorBody}
        successSponsorCtaLabel={success.successSponsorCtaLabel}
      />
    </div>
  );
}

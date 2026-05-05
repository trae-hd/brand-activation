"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ConsentItem } from "@/types/activation";

// ── Tiptap text helpers ────────────────────────────────────────────
function flatText(nodes: unknown[]): string {
  return nodes
    .map((n) => {
      const node = n as { type?: string; text?: string; content?: unknown[] };
      if (node.type === "text") return node.text ?? "";
      if (node.content) return flatText(node.content);
      return "";
    })
    .join("");
}

function extractBody(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return "";
  for (const node of root.content) {
    const n = node as { type?: string; content?: unknown[] };
    const text = flatText(n.content ?? []).trim();
    if (text) return text;
  }
  return "";
}

function renderTermsLines(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return [];
  return root.content
    .map((n) => flatText((n as { content?: unknown[] }).content ?? []).trim())
    .filter(Boolean);
}

function hasContent(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const content = (doc as { content?: unknown[] }).content;
  if (!Array.isArray(content)) return false;
  return content.some((n) => {
    const node = n as { type?: string; content?: unknown[] };
    return flatText(node.content ?? []).trim().length > 0;
  });
}

// ── Props ──────────────────────────────────────────────────────────
interface Props {
  // Registration preview fields
  name: string;
  slug: string;
  /** Display-only host (e.g. "live.hqmops.com") shown in the preview URL strip. */
  participantHost: string;
  heroImageUrl: string;
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  ctaText: string;
  termsContent: unknown;
  primaryColor: string;
  // Success preview fields
  successHeading?: string;
  successSubheading?: string;
  successContent?: unknown;
  successCtaLabel?: string;
  successShowEntryCode?: boolean;
  successShowResend?: boolean;
  successSponsorLogoUrl?: string;
  successSponsorHeadline?: string;
  successSponsorBody?: string;
  successSponsorCtaLabel?: string;
  /** Which preview pane is active. Controlled from parent (URL-backed in edit mode). */
  preview?: "registration" | "success";
  onPreviewChange?: (next: "registration" | "success") => void;
  /** "edit" (default) shows the sticky aside with label + toggle.
   *  "readonly-diff" renders just the mobile frame — used in review diffs. */
  mode?: "edit" | "readonly-diff";
}

// ── Component ─────────────────────────────────────────────────────
export function ActivationPreview({
  name,
  slug,
  participantHost,
  heroImageUrl,
  content,
  consentNotice,
  consentItems,
  ctaText,
  termsContent,
  primaryColor,
  successHeading,
  successSubheading,
  successContent,
  successCtaLabel,
  successShowEntryCode = true,
  successShowResend = true,
  successSponsorLogoUrl,
  successSponsorHeadline,
  successSponsorBody,
  successSponsorCtaLabel,
  preview = "registration",
  onPreviewChange,
  mode = "edit",
}: Props) {
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [termsOpen, setTermsOpen] = useState(false);

  const btnStyle: React.CSSProperties = primaryColor.match(/^#[0-9a-fA-F]{6}$/)
    ? { backgroundColor: primaryColor, color: "#fff" }
    : {};
  const btnClass = primaryColor.match(/^#[0-9a-fA-F]{6}$/)
    ? ""
    : "bg-primary text-primary-foreground";

  const previewBody = extractBody(content);
  const ctaLabel = ctaText.trim() || "Send me a code";
  const showTerms = hasContent(termsContent);

  const mobilePreviewProps = {
    name,
    heroImageUrl,
    previewBody,
    consentNotice,
    consentItems,
    ctaLabel,
    btnClass,
    btnStyle,
    showTerms,
    termsOpen,
    onToggleTerms: () => setTermsOpen((v) => !v),
    termsContent,
  };

  const successPreviewProps: SuccessMobilePreviewProps = {
    successHeading: successHeading || "",
    successSubheading: successSubheading || "",
    successContent,
    successCtaLabel: successCtaLabel || "",
    successShowEntryCode,
    successShowResend,
    successSponsorLogoUrl: successSponsorLogoUrl || "",
    successSponsorHeadline: successSponsorHeadline || "",
    successSponsorBody: successSponsorBody || "",
    successSponsorCtaLabel: successSponsorCtaLabel || "",
    btnClass,
    btnStyle,
  };

  if (mode === "readonly-diff") {
    return <MobilePreview {...mobilePreviewProps} />;
  }

  return (
    <aside className="hidden lg:sticky lg:top-6 lg:flex lg:w-[380px] lg:shrink-0 lg:flex-col lg:self-start">
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        Preview · /{slug || "…"}
      </p>

      {/* Registration / Success page toggle */}
      {onPreviewChange && (
        <div className="mb-2 flex rounded-md border overflow-hidden text-xs font-medium">
          {(["registration", "success"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onPreviewChange(v)}
              className={cn(
                "flex-1 py-1 transition-colors",
                preview === v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "registration" ? "Registration" : "Success"}
            </button>
          ))}
        </div>
      )}

      {preview === "success" ? (
        <SuccessMobilePreview {...successPreviewProps} />
      ) : previewMode === "mobile" ? (
        <MobilePreview {...mobilePreviewProps} />
      ) : (
        <DesktopPreview
          name={name}
          slug={slug}
          participantHost={participantHost}
          heroImageUrl={heroImageUrl}
          previewBody={previewBody}
          consentNotice={consentNotice}
          consentItems={consentItems}
          ctaLabel={ctaLabel}
          btnClass={btnClass}
          btnStyle={btnStyle}
          showTerms={showTerms}
          termsOpen={termsOpen}
          onToggleTerms={() => setTermsOpen((v) => !v)}
          termsContent={termsContent}
        />
      )}

      {/* Mobile / Desktop toggle — only shown for registration preview */}
      {preview !== "success" && (
        <div className="mt-3 flex justify-center gap-1.5">
          {(["mobile", "desktop"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPreviewMode(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                previewMode === v
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground border",
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

// ── Registration sub-renders ───────────────────────────────────────
interface PreviewBodyProps {
  name: string;
  heroImageUrl: string;
  previewBody: string;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  ctaLabel: string;
  btnClass: string;
  btnStyle: React.CSSProperties;
  showTerms: boolean;
  termsOpen: boolean;
  onToggleTerms: () => void;
  termsContent: unknown;
}

function MobilePreview({
  name,
  heroImageUrl,
  previewBody,
  consentNotice,
  consentItems,
  ctaLabel,
  btnClass,
  btnStyle,
  showTerms,
  termsOpen,
  onToggleTerms,
  termsContent,
}: PreviewBodyProps) {
  const consentNoticeText = extractBody(consentNotice);
  return (
    <div className="bg-muted/10 rounded-md border p-3">
      <div className="border-foreground/15 bg-background mx-auto w-[240px] overflow-hidden rounded-[22px] border-2 shadow-sm">
        <div className="bg-muted/50 text-muted-foreground flex items-center justify-between px-3 py-1.5 text-[10px]">
          <span>9:41</span>
          <span>· · ·</span>
        </div>
        <div className="text-foreground flex flex-col gap-2 p-3">
          <HeroImage url={heroImageUrl} size="mobile" />
          <p className="text-[11px] leading-snug font-semibold">{name || "Activation name"}</p>
          {previewBody && (
            <p className="text-muted-foreground -mt-1 line-clamp-2 text-[10px] leading-snug">
              {previewBody}
            </p>
          )}
          <p className="text-muted-foreground text-[10px]">Pop your email in.</p>
          <div className="bg-background text-muted-foreground/50 h-6 rounded border px-2 text-[10px] leading-6">
            name@email.com
          </div>
          {consentNoticeText && (
            <p className="text-muted-foreground line-clamp-3 text-[9px] leading-snug">
              {consentNoticeText}
            </p>
          )}
          <ConsentPreview consentItems={consentItems} size="mobile" />
          <div
            className={cn("rounded py-1 text-center text-[10px] font-medium", btnClass)}
            style={btnStyle}
          >
            {ctaLabel}
          </div>
          <TermsPreview
            showTerms={showTerms}
            termsOpen={termsOpen}
            onToggle={onToggleTerms}
            termsContent={termsContent}
            size="mobile"
          />
        </div>
      </div>
    </div>
  );
}

interface DesktopPreviewProps extends PreviewBodyProps {
  slug: string;
  participantHost: string;
}

function DesktopPreview({
  name,
  slug,
  participantHost,
  heroImageUrl,
  previewBody,
  consentNotice,
  consentItems,
  ctaLabel,
  btnClass,
  btnStyle,
  showTerms,
  termsOpen,
  onToggleTerms,
  termsContent,
}: DesktopPreviewProps) {
  const consentNoticeText = extractBody(consentNotice);
  return (
    <div className="bg-background overflow-hidden rounded-md border">
      <div className="bg-muted/30 flex items-center gap-2 border-b px-3 py-2">
        <div className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
        </div>
        <div className="bg-muted/60 text-muted-foreground flex-1 truncate overflow-hidden rounded px-2 py-0.5 font-mono text-[10px]">
          {participantHost}/{slug || "…"}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <HeroImage url={heroImageUrl} size="desktop" />
        <p className="text-sm leading-snug font-semibold">{name || "Activation name"}</p>
        {previewBody && (
          <p className="text-muted-foreground -mt-1 line-clamp-2 text-xs leading-snug">
            {previewBody}
          </p>
        )}
        <p className="text-muted-foreground text-xs">Pop your email in.</p>
        <div className="bg-background text-muted-foreground/50 h-8 rounded border px-2 text-xs leading-8">
          name@email.com
        </div>
        {consentNoticeText && (
          <p className="text-muted-foreground line-clamp-3 text-xs leading-snug">
            {consentNoticeText}
          </p>
        )}
        <ConsentPreview consentItems={consentItems} size="desktop" />
        <div
          className={cn("rounded py-1.5 text-center text-xs font-medium", btnClass)}
          style={btnStyle}
        >
          {ctaLabel}
        </div>
        <TermsPreview
          showTerms={showTerms}
          termsOpen={termsOpen}
          onToggle={onToggleTerms}
          termsContent={termsContent}
          size="desktop"
        />
      </div>
    </div>
  );
}

// ── Success page mockup ────────────────────────────────────────────
interface SuccessMobilePreviewProps {
  successHeading: string;
  successSubheading: string;
  successContent: unknown;
  successCtaLabel: string;
  successShowEntryCode: boolean;
  successShowResend: boolean;
  successSponsorLogoUrl: string;
  successSponsorHeadline: string;
  successSponsorBody: string;
  successSponsorCtaLabel: string;
  btnClass: string;
  btnStyle: React.CSSProperties;
}

function SuccessMobilePreview({
  successHeading,
  successSubheading,
  successContent,
  successCtaLabel,
  successShowEntryCode,
  successShowResend,
  successSponsorLogoUrl,
  successSponsorHeadline,
  successSponsorBody,
  successSponsorCtaLabel,
  btnClass,
  btnStyle,
}: SuccessMobilePreviewProps) {
  const heading = successHeading.trim() || "You're on the list.";
  const ctaLabel = successCtaLabel.trim() || "Open my email";
  const bodyText = extractBody(successContent);
  const hasSponsor = !!(successSponsorHeadline || successSponsorBody || successSponsorLogoUrl);

  return (
    <div className="bg-muted/10 rounded-md border p-3">
      <div className="border-foreground/15 bg-background mx-auto w-[240px] overflow-hidden rounded-[22px] border-2 shadow-sm">
        <div className="bg-muted/50 text-muted-foreground flex items-center justify-between px-3 py-1.5 text-[10px]">
          <span>9:41</span>
          <span className="text-green-600 font-semibold">✓ VERIFIED</span>
        </div>
        <div className="text-foreground flex flex-col gap-2 p-3">
          <p className="text-[11px] leading-snug font-semibold">{heading}</p>
          {successSubheading && (
            <p className="text-muted-foreground -mt-1 text-[10px] leading-snug line-clamp-2">
              {successSubheading}
            </p>
          )}
          {bodyText && (
            <p className="text-muted-foreground text-[10px] leading-snug line-clamp-2">{bodyText}</p>
          )}
          {successShowEntryCode && (
            <div className="rounded border bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1.5">
              <p className="text-muted-foreground text-[8px] uppercase tracking-widest">Entry code</p>
              <p className="font-mono text-[13px] font-bold tracking-wider">ABC123</p>
            </div>
          )}
          <div
            className={cn("rounded py-1 text-center text-[10px] font-medium", btnClass)}
            style={btnStyle}
          >
            {ctaLabel}
          </div>
          {successShowResend && (
            <p className="text-center text-[9px] text-muted-foreground">
              Didn&apos;t get it? <span className="underline">Resend</span>
            </p>
          )}
          {hasSponsor && (
            <div className="mt-1 rounded border bg-muted/20 p-2 flex flex-col gap-1">
              <p className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground">Brought to you by</p>
              {successSponsorLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={successSponsorLogoUrl} alt="" className="h-5 w-auto object-contain" />
              )}
              {successSponsorHeadline && (
                <p className="text-[9px] font-semibold leading-snug">{successSponsorHeadline}</p>
              )}
              {successSponsorBody && (
                <p className="text-[8px] text-muted-foreground leading-snug line-clamp-2">{successSponsorBody}</p>
              )}
              {successSponsorCtaLabel && (
                <div className="rounded bg-primary px-2 py-0.5 text-center text-[8px] font-medium text-primary-foreground">
                  {successSponsorCtaLabel} →
                </div>
              )}
              <p className="text-center text-[8px] text-muted-foreground underline">Not interested? Hide promos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────
function HeroImage({ url, size }: { url: string; size: "mobile" | "desktop" }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="aspect-[2/1] w-full rounded object-cover" />;
  }
  return (
    <div
      className={cn(
        "flex aspect-[2/1] items-center justify-center rounded bg-muted/60 text-muted-foreground",
        size === "mobile" ? "text-[9px]" : "bg-muted/40 text-[10px]",
      )}
    >
      hero image
    </div>
  );
}

function ConsentPreview({
  consentItems,
  size,
}: {
  consentItems: ConsentItem[];
  size: "mobile" | "desktop";
}) {
  const checkSize = size === "mobile" ? "h-3 w-3" : "h-3.5 w-3.5";
  const textSize = size === "mobile" ? "text-[9px]" : "text-xs";
  const gap = size === "mobile" ? "gap-1" : "gap-1.5";

  if (consentItems.length > 0) {
    return (
      <div className={cn("flex flex-col", gap)}>
        {consentItems.slice(0, 3).map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className={cn("border-foreground/30 mt-0.5 shrink-0 rounded-sm border", checkSize)} />
            <p className={cn("text-muted-foreground line-clamp-1 leading-tight", textSize)}>
              {item.text || "Consent item…"}
            </p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <div className={cn("border-muted-foreground/20 mt-0.5 shrink-0 rounded-sm border", checkSize)} />
      <p className={cn("text-muted-foreground/40 leading-tight", textSize)}>No consent items added</p>
    </div>
  );
}

function TermsPreview({
  showTerms,
  termsOpen,
  onToggle,
  termsContent,
  size,
}: {
  showTerms: boolean;
  termsOpen: boolean;
  onToggle: () => void;
  termsContent: unknown;
  size: "mobile" | "desktop";
}) {
  const isMobile = size === "mobile";
  return (
    <div className="border-t pt-1.5">
      {showTerms ? (
        <>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "text-muted-foreground underline underline-offset-1",
              isMobile ? "text-[9px]" : "flex items-center gap-1 text-xs underline-offset-2",
            )}
          >
            T&amp;Cs apply{" "}
            <span className={isMobile ? undefined : "no-underline"} aria-hidden>
              {termsOpen ? "↑" : "↓"}
            </span>
          </button>
          {termsOpen && (
            <div
              className={cn(
                "bg-muted/30 mt-1 rounded border",
                isMobile ? "space-y-0.5 p-1.5" : "mt-2 space-y-1 p-3",
              )}
            >
              {renderTermsLines(termsContent).map((line, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-muted-foreground leading-snug",
                    isMobile ? "text-[8px]" : "text-xs leading-relaxed",
                  )}
                >
                  {line}
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className={cn("text-muted-foreground", isMobile ? "text-[9px]" : "text-xs")}>
          T&amp;Cs apply.
        </p>
      )}
    </div>
  );
}

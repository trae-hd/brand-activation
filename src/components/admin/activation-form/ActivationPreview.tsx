"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ConsentItem, EmailFormState } from "@/types/activation";

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

// Renders inline content preserving bold, italic, underline marks.
function renderInline(nodes: unknown[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    const node = n as {
      type?: string;
      text?: string;
      content?: unknown[];
      marks?: { type: string }[];
    };
    if (node.type === "text") {
      const marks = node.marks ?? [];
      let el: React.ReactNode = node.text ?? "";
      if (marks.some((m) => m.type === "bold")) el = <strong key={`b${i}`}>{el}</strong>;
      if (marks.some((m) => m.type === "italic")) el = <em key={`em${i}`}>{el}</em>;
      if (marks.some((m) => m.type === "underline")) el = <u key={`u${i}`}>{el}</u>;
      return <span key={i}>{el}</span>;
    }
    if (node.content) return <span key={i}>{renderInline(node.content)}</span>;
    return null;
  });
}

function extractBody(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return "";
  return root.content
    .map((n) => flatText((n as { content?: unknown[] }).content ?? []).trim())
    .filter(Boolean)
    .join(" ");
}

function renderContentParagraphs(doc: unknown, isMobile: boolean): React.ReactNode {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return null;
  const nodes = root.content
    .map((n, i) => {
      const node = n as { type?: string; content?: unknown[] };
      const inline = renderInline(node.content ?? []);
      const hasText = flatText(node.content ?? []).trim().length > 0;
      if (!hasText) return null;
      const cls = isMobile
        ? "text-muted-foreground text-[10px] leading-snug"
        : "text-muted-foreground text-xs leading-snug";
      return <p key={i} className={cls}>{inline}</p>;
    })
    .filter(Boolean);
  if (!nodes.length) return null;
  return <div className={isMobile ? "flex flex-col gap-1 -mt-1" : "flex flex-col gap-1.5 -mt-1"}>{nodes}</div>;
}

function renderTermsNode(node: unknown, key: number, isMobile: boolean): React.ReactNode {
  if (!node || typeof node !== "object") return null;
  const n = node as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  const textSz = isMobile ? "text-[8px]" : "text-xs";
  switch (n.type) {
    case "doc":
      return (
        <div key={key} className="flex flex-col gap-0.5">
          {(n.content ?? []).map((c, i) => renderTermsNode(c, i, isMobile))}
        </div>
      );
    case "paragraph":
    case "heading": {
      const hasText = flatText(n.content ?? []).trim().length > 0;
      if (!hasText) return null;
      return (
        <p key={key} className={cn("text-muted-foreground leading-snug", textSz)}>
          {renderInline(n.content ?? [])}
        </p>
      );
    }
    case "orderedList":
      return (
        <ol key={key} className={cn("list-decimal list-inside text-muted-foreground space-y-0.5", textSz)}>
          {(n.content ?? []).map((c, i) => renderTermsNode(c, i, isMobile))}
        </ol>
      );
    case "bulletList":
      return (
        <ul key={key} className={cn("list-disc list-inside text-muted-foreground space-y-0.5", textSz)}>
          {(n.content ?? []).map((c, i) => renderTermsNode(c, i, isMobile))}
        </ul>
      );
    case "listItem":
      return <li key={key}>{renderInline(n.content ?? [])}</li>;
    default:
      return null;
  }
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
  /** Display-only host (e.g. "activation.mrq.com") shown in the preview URL strip. */
  participantHost: string;
  heroImageUrl: string;
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  /** When true, the registration form renders an extra "I agree to be
   *  contacted by MrQ if I am selected as a winner" checkbox below the
   *  configured consent items. The preview should mirror that. */
  mrqContactConsentEnabled?: boolean;
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
  successShowCta?: boolean;
  successSponsorLogoUrl?: string;
  successSponsorHeadline?: string;
  successSponsorBody?: string;
  successSponsorCtaLabel?: string;
  successSponsorTermsContent?: unknown;
  /** Which preview pane is active. Controlled from parent (URL-backed in edit mode). */
  preview?: "registration" | "success" | "email";
  onPreviewChange?: (next: "registration" | "success" | "email") => void;
  /** URL for the email preview iframe (points to /api/email-preview/[id]?pt=...). */
  emailPreviewUrl?: string | null;
  /** Live email form state — used to render the inline email preview. */
  emailState?: EmailFormState;
  /** Activation name, passed through for email preview defaults. */
  activationName?: string;
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
  mrqContactConsentEnabled = false,
  ctaText,
  termsContent,
  primaryColor,
  successHeading,
  successSubheading,
  successContent,
  successCtaLabel,
  successShowEntryCode = true,
  successShowResend = true,
  successShowCta = true,
  successSponsorLogoUrl,
  successSponsorHeadline,
  successSponsorBody,
  successSponsorCtaLabel,
  successSponsorTermsContent,
  preview = "registration",
  onPreviewChange,
  emailPreviewUrl,
  emailState,
  activationName,
  mode = "edit",
}: Props) {
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [termsOpen, setTermsOpen] = useState(false);
  const [emailFrameKey, setEmailFrameKey] = useState(0);
  const prevPreview = useRef(preview);
  useEffect(() => {
    if (preview === "email" && prevPreview.current !== "email") {
      setEmailFrameKey((k) => k + 1);
    }
    prevPreview.current = preview;
  }, [preview]);

  const btnStyle: React.CSSProperties = primaryColor.match(/^#[0-9a-fA-F]{6}$/)
    ? { backgroundColor: primaryColor, color: "#fff" }
    : {};
  const btnClass = primaryColor.match(/^#[0-9a-fA-F]{6}$/)
    ? ""
    : "bg-primary text-primary-foreground";

  // Mirrors the live SuccessSessionData entry-code card: brand colour as
  // background, white text, with #0a2ecb as the platform fallback when the
  // activation has no valid hex set yet.
  const entryCodeBg = primaryColor.match(/^#[0-9a-fA-F]{6}$/)
    ? primaryColor
    : "#0a2ecb";

  const ctaLabel = ctaText.trim() || "Send me a code";
  const showTerms = hasContent(termsContent);

  const mobilePreviewProps = {
    name,
    heroImageUrl,
    content,
    consentNotice,
    consentItems,
    mrqContactConsentEnabled,
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
    successShowCta,
    entryCodeBg,
    successSponsorLogoUrl: successSponsorLogoUrl || "",
    successSponsorHeadline: successSponsorHeadline || "",
    successSponsorBody: successSponsorBody || "",
    successSponsorCtaLabel: successSponsorCtaLabel || "",
    successSponsorTermsContent,
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

      {/* Registration / Success / Email toggle */}
      {onPreviewChange && (
        <div className="mb-2 flex rounded-md border overflow-hidden text-xs font-medium">
          {(["registration", "success", "email"] as const).map((v) => (
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
              {v === "registration" ? "Registration" : v === "success" ? "Success" : "Email"}
            </button>
          ))}
        </div>
      )}

      {preview === "email" ? (
        <InlineEmailPreview
          emailState={emailState}
          activationName={activationName ?? name}
          fallbackUrl={emailPreviewUrl ?? null}
          key={emailFrameKey}
        />
      ) : preview === "success" ? (
        <SuccessMobilePreview {...successPreviewProps} />
      ) : previewMode === "mobile" ? (
        <MobilePreview {...mobilePreviewProps} />
      ) : (
        <DesktopPreview
          name={name}
          slug={slug}
          participantHost={participantHost}
          heroImageUrl={heroImageUrl}
          content={content}
          consentNotice={consentNotice}
          consentItems={consentItems}
          mrqContactConsentEnabled={mrqContactConsentEnabled}
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
      {preview !== "success" && preview !== "email" && (
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

// ── Inline email preview ───────────────────────────────────────────
function InlineEmailPreview({
  emailState,
  activationName,
  fallbackUrl,
}: {
  emailState?: EmailFormState;
  activationName: string;
  fallbackUrl: string | null;
}) {
  // If no live state (e.g. readonly-diff), fall back to iframe
  if (!emailState) {
    if (!fallbackUrl) {
      return (
        <div className="bg-muted/10 rounded-md border p-4 flex flex-col items-center justify-center gap-2 min-h-[200px]">
          <p className="text-xs text-muted-foreground text-center">
            Save the activation to preview the verification email.
          </p>
        </div>
      );
    }
    return (
      <div className="bg-muted/10 rounded-md border overflow-hidden">
        <iframe src={fallbackUrl} title="Verification email preview" className="w-full border-0" style={{ height: 520 }} />
      </div>
    );
  }

  const {
    emailHeading,
    emailBodyContent,
    emailBodyCopy,
    emailShowEntryCode,
    emailShowEndDate,
    emailTermsContent,
    emailFooter,
  } = emailState;

  const showEntryCode = emailShowEntryCode !== false;
  const showEndDate = emailShowEndDate !== false;

  const heading = emailHeading?.trim() || `You're registered for ${activationName}.`;
  const bodyCopy = emailBodyCopy?.trim() || `Show this at the booth to claim your reward. Keep this email — it's the only place you'll find your code if you close the page.`;
  const footer = emailFooter?.trim() || `— The MrQ Activation team`;
  const hasTerms = hasContent(emailTermsContent);
  const hasBodyContent = hasContent(emailBodyContent);

  return (
    <div className="overflow-y-auto rounded-md border bg-[#f5f4f0]" style={{ maxHeight: 560 }}>
      <div className="mx-auto max-w-[480px] p-4">
        <div className="rounded-xl border border-[#e7e5e4] bg-white overflow-hidden text-[#1c1917]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-tight">MrQ</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3B5BFF]">Activation</span>
            </div>
            <span className="text-[10px] font-mono text-[#a8a29e] tracking-wide">Entry code</span>
          </div>

          {/* Heading */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-lg font-bold leading-snug tracking-tight">{heading}</p>
          </div>

          {/* Body copy */}
          {hasBodyContent && (
            <div className="px-6 pb-3">
              {renderContentParagraphs(emailBodyContent, false)}
            </div>
          )}

          {/* "Here's your entry code:" — below body, above block */}
          {showEntryCode && (
            <div className="px-6 pb-4">
              <p className="text-xs text-[#57534e]">Here&apos;s your entry code:</p>
            </div>
          )}

          {/* Entry code block */}
          {showEntryCode && (
            <div className="px-6 pb-3">
              <div className="rounded-lg border border-[#e7e5e4] bg-[#fafaf9] py-5 text-center">
                <span className="font-mono text-2xl font-bold tracking-widest text-[#1c1917]">
                  PREVIEW-0001
                </span>
              </div>
            </div>
          )}

          {/* Helper copy + end date */}
          <div className="px-6 pb-4 flex flex-col gap-1.5">
            {showEntryCode && (
              <p className="text-xs leading-snug text-[#57534e]">{bodyCopy}</p>
            )}
            {showEndDate && (
              <p className="text-xs leading-snug text-[#57534e]">
                The activation runs until the configured end date.
              </p>
            )}
            <p className="text-[10px] text-[#a8a29e]">
              This mailbox isn&apos;t monitored — please don&apos;t reply.
            </p>
          </div>

          {/* T&Cs tinted section */}
          {hasTerms && (
            <div className="border-t border-[#e7e5e4] bg-[#fafaf9] px-6 py-3">
              <div className="text-[10px] leading-relaxed text-[#78716c]">
                {renderTermsNode(emailTermsContent, 0, false)}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-[#e7e5e4] px-6 py-4">
            <p className="text-[11px] text-[#a8a29e]">{footer}</p>
            <p className="mt-0.5 text-[11px] text-[#a8a29e]">
              Sent to <span className="text-[#57534e]">participant@example.com</span> · Transactional receipt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Registration sub-renders ───────────────────────────────────────
interface PreviewBodyProps {
  name: string;
  heroImageUrl: string;
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  mrqContactConsentEnabled: boolean;
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
  content,
  consentNotice,
  consentItems,
  mrqContactConsentEnabled,
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
          {renderContentParagraphs(content, true)}
          <p className="text-muted-foreground text-[10px]">Pop your email in.</p>
          <div className="bg-background text-muted-foreground/50 h-6 rounded border px-2 text-[10px] leading-6">
            name@email.com
          </div>
          {consentNoticeText && (
            <p className="text-muted-foreground line-clamp-3 text-[9px] leading-snug">
              {consentNoticeText}
            </p>
          )}
          <ConsentPreview
            consentItems={consentItems}
            mrqContactConsentEnabled={mrqContactConsentEnabled}
            size="mobile"
          />
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
  content,
  consentNotice,
  consentItems,
  mrqContactConsentEnabled,
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
        {renderContentParagraphs(content, false)}
        <p className="text-muted-foreground text-xs">Pop your email in.</p>
        <div className="bg-background text-muted-foreground/50 h-8 rounded border px-2 text-xs leading-8">
          name@email.com
        </div>
        {consentNoticeText && (
          <p className="text-muted-foreground line-clamp-3 text-xs leading-snug">
            {consentNoticeText}
          </p>
        )}
        <ConsentPreview
          consentItems={consentItems}
          mrqContactConsentEnabled={mrqContactConsentEnabled}
          size="desktop"
        />
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
  successShowCta: boolean;
  entryCodeBg: string;
  successSponsorLogoUrl: string;
  successSponsorHeadline: string;
  successSponsorBody: string;
  successSponsorCtaLabel: string;
  successSponsorTermsContent?: unknown;
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
  successShowCta,
  entryCodeBg,
  successSponsorLogoUrl,
  successSponsorHeadline,
  successSponsorBody,
  successSponsorCtaLabel,
  successSponsorTermsContent,
  btnClass,
  btnStyle,
}: SuccessMobilePreviewProps) {
  const heading = successHeading.trim() || "You're on the list.";
  const ctaLabel = successCtaLabel.trim() || "Open my email";
  const bodyText = extractBody(successContent);
  const hasSponsor = !!(successSponsorHeadline || successSponsorBody || successSponsorLogoUrl);
  const hasSponsorTerms = hasContent(successSponsorTermsContent);

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
            <div
              className="rounded px-2 py-1.5"
              style={{ backgroundColor: entryCodeBg, color: "#ffffff" }}
            >
              <p className="text-[8px] uppercase tracking-widest">Entry code</p>
              <p className="font-mono text-[13px] font-bold tracking-wider">ABC123</p>
            </div>
          )}
          {successShowCta && (
            <div
              className={cn("rounded py-1 text-center text-[10px] font-medium", btnClass)}
              style={btnStyle}
            >
              {ctaLabel}
            </div>
          )}
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
              {hasSponsorTerms && (
                <p className="text-[8px] text-muted-foreground underline cursor-pointer">
                  T&amp;Cs apply ▾
                </p>
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
  mrqContactConsentEnabled,
  size,
}: {
  consentItems: ConsentItem[];
  mrqContactConsentEnabled: boolean;
  size: "mobile" | "desktop";
}) {
  const checkSize = size === "mobile" ? "h-3 w-3" : "h-3.5 w-3.5";
  const textSize = size === "mobile" ? "text-[9px]" : "text-xs";
  const gap = size === "mobile" ? "gap-1" : "gap-1.5";

  // The MrQ-winner-contact checkbox sits below the configured items in the
  // live form (see RegistrationForm). The preview mirrors that ordering so
  // admins can see exactly what the participant will see when the toggle is
  // on. We slice the regular items to 3 for visual compactness, but the MrQ
  // row always renders on top of that when enabled.
  const mrqRow = mrqContactConsentEnabled ? (
    <div className="flex items-start gap-1.5">
      <div className={cn("border-foreground/30 mt-0.5 shrink-0 rounded-sm border", checkSize)} />
      <p className={cn("text-muted-foreground line-clamp-1 leading-tight", textSize)}>
        I agree to be contacted by MrQ if I am selected as a winner.
      </p>
    </div>
  ) : null;

  const ageRow = (
    <div className="flex items-start gap-1.5">
      <div className={cn("border-foreground/30 mt-0.5 shrink-0 rounded-sm border", checkSize)} />
      <p className={cn("text-muted-foreground line-clamp-1 leading-tight", textSize)}>
        I confirm that I am 18+<span className="text-destructive ml-0.5">*</span>
      </p>
    </div>
  );

  return (
    <div className={cn("flex flex-col", gap)}>
      {ageRow}
      {consentItems.slice(0, 2).map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className={cn("border-foreground/30 mt-0.5 shrink-0 rounded-sm border", checkSize)} />
          <p className={cn("text-muted-foreground line-clamp-1 leading-tight", textSize)}>
            {item.text || "Consent item…"}
            {item.required && <span className="text-destructive ml-0.5">*</span>}
          </p>
        </div>
      ))}
      {mrqRow}
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
              {((termsContent as { content?: unknown[] })?.content ?? []).map((n, i) =>
                renderTermsNode(n, i, isMobile)
              )}
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

import React from "react";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import type { CSSProperties } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { verifyPreviewToken } from "@/lib/preview/token";
import { SuccessSessionData } from "@/components/participant/SuccessSessionData";
import { TermsAccordion } from "@/components/participant/TermsAccordion";

// ── Cache (matches landing page pattern) ──────────────────────────
const getActivation = (slug: string) =>
  unstable_cache(
    async () =>
      prisma.activation.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          status: true,
          primaryColor: true,
          successHeading: true,
          successSubheading: true,
          successContent: true,
          successCtaLabel: true,
          successCtaUrl: true,
          successShowEntryCode: true,
          successShowResend: true,
          successShowCta: true,
          successSponsorName: true,
          successSponsorLogoUrl: true,
          successSponsorLogoAlt: true,
          successSponsorHeadline: true,
          successSponsorBody: true,
          successSponsorCtaLabel: true,
          successSponsorCtaUrl: true,
          successSponsorTermsContent: true,
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 }
  )();

// ── Tiptap rich-text renderer ──────────────────────────────────────
type TNode = {
  type?: string;
  text?: string;
  content?: unknown[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

function renderInline(nodes: unknown[]): React.ReactNode {
  return (nodes as TNode[]).map((n, i) => {
    if (n.type !== "text") {
      if (n.content) return <React.Fragment key={i}>{renderInline(n.content)}</React.Fragment>;
      return null;
    }
    let el: React.ReactNode = n.text ?? "";
    const marks = n.marks ?? [];
    if (marks.some((m) => m.type === "bold")) el = <strong className="font-semibold">{el}</strong>;
    if (marks.some((m) => m.type === "italic")) el = <em>{el}</em>;
    if (marks.some((m) => m.type === "underline")) el = <u>{el}</u>;
    const linkMark = marks.find((m) => m.type === "link");
    if (linkMark?.attrs?.href) {
      el = <a href={String(linkMark.attrs.href)} target="_blank" rel="noopener noreferrer" className="underline">{el}</a>;
    }
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });
}

function renderContent(doc: unknown): React.ReactNode[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return [];
  const result: React.ReactNode[] = [];
  (root.content as TNode[]).forEach((node, i) => {
    if (node.type === "paragraph") {
      const hasText = (node.content ?? []).some((n) => (n as TNode).type === "text" && (n as TNode).text?.trim());
      if (!hasText) return;
      result.push(<p key={i} className="text-sm text-muted-foreground break-words leading-relaxed">{renderInline(node.content ?? [])}</p>);
    } else if (node.type === "heading") {
      const level = (node.attrs?.level as number) ?? 2;
      result.push(<p key={i} className={level <= 2 ? "text-base font-semibold break-words" : "text-sm font-semibold break-words"}>{renderInline(node.content ?? [])}</p>);
    } else if (node.type === "bulletList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        result.push(<p key={`${i}-${j}`} className="text-sm text-muted-foreground break-words">• {renderInline(textNodes)}</p>);
      });
    } else if (node.type === "orderedList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        result.push(<p key={`${i}-${j}`} className="text-sm text-muted-foreground break-words">{j + 1}. {renderInline(textNodes)}</p>);
      });
    }
  });
  return result;
}

// ── Page ───────────────────────────────────────────────────────────
export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ activationSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { activationSlug } = await params;
  const sp = await searchParams;
  const isPreview = sp.preview === "true";
  const activation = await getActivation(activationSlug);

  if (!activation) notFound();
  if (activation.status === "DRAFT") {
    if (!isPreview) notFound();
    const tokenValid = sp.pt ? verifyPreviewToken(activation.id, sp.pt) : false;
    if (!tokenValid) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.adminUserId) notFound();
    }
  }

  // Field defaults
  const heading = activation.successHeading ?? "You're on the list.";
  const subheading = activation.successSubheading ?? null;
  const ctaLabel = activation.successCtaLabel ?? "Open my email";
  const ctaUrl = activation.successCtaUrl ?? null;
  const showEntryCode = activation.successShowEntryCode ?? true;
  const showResend = activation.successShowResend ?? true;
  const showCta = activation.successShowCta ?? true;

  const contentNodes = renderContent(activation.successContent);

  const sponsorName = activation.successSponsorName ?? null;
  const sponsorLogoUrl = activation.successSponsorLogoUrl ?? null;
  const sponsorLogoAlt = activation.successSponsorLogoAlt ?? "";
  const sponsorHeadline = activation.successSponsorHeadline ?? null;
  const sponsorBody = activation.successSponsorBody ?? null;
  const sponsorCtaLabel = activation.successSponsorCtaLabel ?? null;
  const sponsorCtaUrl = activation.successSponsorCtaUrl ?? null;
  const sponsorTermsContent = activation.successSponsorTermsContent ?? null;
  const hasSponsor = !!(sponsorHeadline || sponsorBody || sponsorLogoUrl);

  const brandStyle: CSSProperties = activation.primaryColor?.match(/^#[0-9a-fA-F]{6}$/)
    ? ({ "--primary": activation.primaryColor, "--primary-foreground": "#ffffff" } as CSSProperties)
    : {};

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-5 pb-8 pt-10" style={brandStyle}>
      {/* Header */}
      <div className="flex w-full items-center justify-between mb-6">
        <span className="text-sm font-bold tracking-tight">
          MrQ <span className="font-normal opacity-60">Activation</span>
        </span>
        <span className="rounded-full border border-green-600 px-2 py-0.5 text-xs font-semibold text-green-600">
          VERIFIED
        </span>
      </div>

      {/* Confirmation heading */}
      <div className="w-full space-y-3">
        <h1 className="text-3xl font-bold break-words">{heading}</h1>
        {subheading && (
          <p className="text-sm text-muted-foreground break-words">{subheading}</p>
        )}
      </div>

      {/* Main content block */}
      {contentNodes.length > 0 && (
        <div className="mt-3 w-full space-y-3">
          {contentNodes}
        </div>
      )}

      {/* Client island — reads sessionStorage, renders entry code + CTA + resend.
          Post-verification copy (e.g. "check your inbox") is now authored in the
          successContent rich-text block above. Admins who want that prompt add it
          there; activations that don't follow up by email can leave it out. */}
      <SuccessSessionData
        activationSlug={activationSlug}
        successCtaLabel={ctaLabel}
        successCtaUrl={ctaUrl}
        showEntryCode={showEntryCode}
        showResend={showResend}
        showCta={showCta}
        isPreview={isPreview}
      />

      {/* Sponsor / promo block */}
      {hasSponsor && (
        <>
          <div className="relative my-8 w-full">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground tracking-widest uppercase">
                {"Brought to you by "}
                {sponsorName && <span className="normal-case">{sponsorName}</span>}
              </span>
            </div>
          </div>
          <div className="w-full rounded-md border p-4 space-y-3">
            {sponsorLogoUrl && (
              <Image
                src={sponsorLogoUrl}
                alt={sponsorLogoAlt}
                width={120}
                height={40}
                className="h-auto max-w-full object-contain"
                unoptimized
              />
            )}
            {sponsorHeadline && (
              <p className="text-base font-semibold leading-snug break-words">{sponsorHeadline}</p>
            )}
            {sponsorBody && (
              <p className="text-sm text-muted-foreground break-words">{sponsorBody}</p>
            )}
            {sponsorCtaLabel && (
              <a
                href={sponsorCtaUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground break-words"
              >
                {sponsorCtaLabel} →
              </a>
            )}
            {sponsorTermsContent && (
              <TermsAccordion content={sponsorTermsContent} />
            )}
          </div>
        </>
      )}
    </main>
  );
}

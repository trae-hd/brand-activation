import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { verifyPreviewToken } from "@/lib/preview/token";
import { SuccessSessionData } from "@/components/participant/SuccessSessionData";

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
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 }
  )();

// ── Tiptap text renderer ───────────────────────────────────────────
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

function renderParagraphs(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return [];
  return root.content
    .map((n) => flatText((n as { content?: unknown[] }).content ?? []).trim())
    .filter(Boolean);
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

  const contentLines = renderParagraphs(activation.successContent);

  const sponsorName = activation.successSponsorName ?? null;
  const sponsorLogoUrl = activation.successSponsorLogoUrl ?? null;
  const sponsorLogoAlt = activation.successSponsorLogoAlt ?? "";
  const sponsorHeadline = activation.successSponsorHeadline ?? null;
  const sponsorBody = activation.successSponsorBody ?? null;
  const sponsorCtaLabel = activation.successSponsorCtaLabel ?? null;
  const sponsorCtaUrl = activation.successSponsorCtaUrl ?? null;
  const hasSponsor = !!(sponsorHeadline || sponsorBody || sponsorLogoUrl);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-5 pb-8 pt-10">
      {/* Header */}
      <div className="flex w-full items-center justify-between mb-8">
        <span className="text-sm font-bold tracking-tight">
          MrQ <span className="font-normal opacity-60">Activation</span>
        </span>
        <span className="rounded-full border border-green-600 px-2 py-0.5 text-xs font-semibold text-green-600">
          VERIFIED
        </span>
      </div>

      {/* Confirmation heading */}
      <div className="w-full space-y-2">
        <h1 className="text-3xl font-bold break-words">{heading}</h1>
        {subheading && (
          <p className="text-sm text-muted-foreground break-words">{subheading}</p>
        )}
      </div>

      {/* Main content block */}
      {contentLines.length > 0 && (
        <div className="mt-4 w-full space-y-2">
          {contentLines.map((line, i) => (
            <p key={i} className="text-sm text-muted-foreground break-words">{line}</p>
          ))}
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
        primaryColor={activation.primaryColor}
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
              <span className="bg-background px-3 text-xs text-muted-foreground uppercase tracking-widest">
                {sponsorName ? `Brought to you by ${sponsorName}` : "Brought to you by"}
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
          </div>
        </>
      )}
    </main>
  );
}

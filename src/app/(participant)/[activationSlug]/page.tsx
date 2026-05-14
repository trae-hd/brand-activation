import React from "react";
import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import type { CSSProperties } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { verifyPreviewToken } from "@/lib/preview/token";
import { RegistrationForm } from "@/components/participant/RegistrationForm";
import { TermsAccordion } from "@/components/participant/TermsAccordion";

const getActivation = (slug: string) =>
  unstable_cache(
    async () =>
      prisma.activation.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          content: true,
          consentNotice: true,
          consentVersion: true,
          consentItems: true,
          mrqContactConsentEnabled: true,
          ctaText: true,
          heroImageUrl: true,
          heroImageAlt: true,
          startsAt: true,
          termsContent: true,
          primaryColor: true,
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 },
  )();

function formatLondonDateTime(date: Date): { label: string; time: string } {
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "Europe/London",
  })
    .format(date)
    .toUpperCase();
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    hour12: false,
  }).format(date);
  const tzPart = new Intl.DateTimeFormat("en-GB", {
    timeZoneName: "short",
    timeZone: "Europe/London",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  const tz = tzPart?.value ?? "GMT";
  return { label: `${day} ${month} · ${time} ${tz}`, time: `${time} ${tz}` };
}

function renderInline(nodes: unknown[]): React.ReactNode {
  return nodes.map((n, i) => {
    const node = n as { type?: string; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: unknown[] };
    if (node.type !== "text") {
      if (node.content) return <React.Fragment key={i}>{renderInline(node.content)}</React.Fragment>;
      return null;
    }
    let content: React.ReactNode = node.text ?? "";
    const marks = node.marks ?? [];
    if (marks.some((m) => m.type === "bold")) content = <strong className="font-semibold">{content}</strong>;
    if (marks.some((m) => m.type === "italic")) content = <em>{content}</em>;
    if (marks.some((m) => m.type === "underline")) content = <u>{content}</u>;
    const fontSize = marks.find((m) => m.type === "textStyle")?.attrs?.fontSize as string | undefined;
    if (fontSize) content = <span style={{ fontSize }}>{content}</span>;
    const linkMark = marks.find((m) => m.type === "link");
    if (linkMark?.attrs?.href) content = <a href={String(linkMark.attrs.href)} target="_blank" rel="noopener noreferrer" className="underline">{content}</a>;
    return <React.Fragment key={i}>{content}</React.Fragment>;
  });
}

type TNode = {
  type?: string;
  text?: string;
  content?: unknown[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

function MarketingCopy({ doc }: { doc: unknown }) {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return null;
  const nodes: React.ReactNode[] = [];
  (root.content as TNode[]).forEach((node, i) => {
    if (node.type === "paragraph") {
      const hasText = (node.content ?? []).some((n) => (n as TNode).type === "text" && (n as TNode).text?.trim());
      if (!hasText) return;
      nodes.push(<p key={i} className="text-ink-3 text-sm leading-relaxed">{renderInline(node.content ?? [])}</p>);
    } else if (node.type === "heading") {
      const level = (node.attrs?.level as number) ?? 2;
      nodes.push(<p key={i} className={level <= 2 ? "text-ink-1 text-base font-semibold leading-snug" : "text-ink-1 text-sm font-semibold leading-snug"}>{renderInline(node.content ?? [])}</p>);
    } else if (node.type === "bulletList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        nodes.push(<p key={`${i}-${j}`} className="text-ink-3 text-sm leading-relaxed">• {renderInline(textNodes)}</p>);
      });
    } else if (node.type === "orderedList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        nodes.push(<p key={`${i}-${j}`} className="text-ink-3 text-sm leading-relaxed">{j + 1}. {renderInline(textNodes)}</p>);
      });
    }
  });
  if (!nodes.length) return null;
  return <div className="mb-3 flex flex-col gap-3">{nodes}</div>;
}

export default async function LandingPage({
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

  if (activation.status === "ENDED" && !isPreview) redirect(`/${activationSlug}/ended`);
  if (activation.status === "DRAFT") {
    if (!isPreview) notFound();
    const tokenValid = sp.pt ? verifyPreviewToken(activation.id, sp.pt) : false;
    if (!tokenValid) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.adminUserId) notFound();
    }
  }

  const brandStyle: CSSProperties = activation.primaryColor?.match(/^#[0-9a-fA-F]{6}$/)
    ? ({
        "--primary": activation.primaryColor,
        "--primary-foreground": "#ffffff",
      } as CSSProperties)
    : {};

  if (activation.status === "SCHEDULED") {
    const { label, time } = formatLondonDateTime(activation.startsAt);
    return (
      <main
        className="mx-auto min-h-screen w-full max-w-sm px-5 pt-5 pb-8"
        style={brandStyle}
      >
        <div className="mb-5 text-sm font-semibold tracking-tight">
          MrQ <span className="text-ink-3 font-normal">Activation</span>
        </div>
        <div className="border-border rounded-md border p-4">
          <p className="text-primary mb-1 text-xs font-bold tracking-widest break-words uppercase">
            OPENS · {label}
          </p>
          <h1 className="mb-2 text-xl leading-snug font-bold">
            Doors aren&apos;t open yet.
          </h1>
          <p className="text-ink-3 text-sm">Pop back at {time} when doors open.</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-sm px-5 pt-5 pb-8"
      style={brandStyle}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight">
          MrQ <span className="text-ink-3 font-normal">Activation</span>
        </div>
        {sp.booth && <span className="text-ink-3 text-xs">Booth #{sp.booth}</span>}
      </div>
      {activation.heroImageUrl && (
        <div className="relative mb-4 aspect-[2/1] w-full overflow-hidden rounded-md">
          <Image
            src={activation.heroImageUrl}
            alt={activation.heroImageAlt ?? ""}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <h1 className="mb-3 text-2xl leading-tight font-bold break-words">
        {activation.name}
      </h1>
      {activation.content && <MarketingCopy doc={activation.content} />}
      <p className="text-ink-3 mb-4 text-sm">
        Pop your email in to enter. We&apos;ll send a code.
      </p>
      <RegistrationForm
        activationId={activation.id}
        activationSlug={activation.slug}
        boothCode={sp.booth ?? null}
        utmSource={sp.utm_source ?? null}
        utmMedium={sp.utm_medium ?? null}
        utmCampaign={sp.utm_campaign ?? null}
        consentNotice={activation.consentNotice}
        consentVersion={activation.consentVersion}
        consentItems={activation.consentItems}
        mrqContactConsentEnabled={activation.mrqContactConsentEnabled}
        ctaText={activation.ctaText ?? null}
      />
      <hr className="border-border my-4" />
      <TermsAccordion content={activation.termsContent} />
    </main>
  );
}

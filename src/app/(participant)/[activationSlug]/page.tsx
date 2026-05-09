import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { verifyPreviewToken } from "@/lib/preview/token";
import { RegistrationForm } from "@/components/participant/RegistrationForm";
import { NotifyMeForm } from "@/components/participant/NotifyMeForm";
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
          consentNotice: true,
          consentVersion: true,
          consentItems: true,
          mrqContactConsentEnabled: true,
          ctaText: true,
          heroImageUrl: true,
          heroImageAlt: true,
          startsAt: true,
          termsContent: true,
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 }
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

  if (activation.status === "SCHEDULED") {
    const { label, time } = formatLondonDateTime(activation.startsAt);
    return (
      <main className="mx-auto w-full max-w-sm px-5 pt-5 pb-8 min-h-screen">
        <div className="text-sm font-semibold tracking-tight mb-5">
          MrQ <span className="font-normal text-ink-3">live</span>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-xs font-bold tracking-widest uppercase text-primary mb-1 break-words">
            OPENS · {label}
          </p>
          <h1 className="text-xl font-bold leading-snug mb-2">
            Doors aren&apos;t open yet.
          </h1>
          <p className="text-sm text-ink-3 mb-3">
            Pop back at {time} — or drop your email and we&apos;ll text you the
            moment it opens.
          </p>
          <NotifyMeForm />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-5 pt-5 pb-8 min-h-screen">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold tracking-tight">
          MrQ <span className="font-normal text-ink-3">live</span>
        </div>
        {sp.booth && (
          <span className="text-xs text-ink-3">Booth #{sp.booth}</span>
        )}
      </div>
      {activation.heroImageUrl && (
        <div className="relative mb-4 w-full overflow-hidden rounded-md aspect-[2/1]">
          <Image
            src={activation.heroImageUrl}
            alt={activation.heroImageAlt ?? ""}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <h1 className="text-2xl font-bold leading-tight mb-2 break-words">{activation.name}</h1>
      <p className="text-sm text-ink-3 mb-4">
        Pop your email in. We&apos;ll send a code.
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
      <hr className="my-4 border-border" />
      <TermsAccordion content={activation.termsContent} />
    </main>
  );
}

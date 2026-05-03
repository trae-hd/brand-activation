import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { RegistrationForm } from "@/components/participant/RegistrationForm";
import { renderTiptap } from "@/lib/tiptap/render";
import React from "react";

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
          primaryColor: true,
          heroImageUrl: true,
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 }
  )();

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ activationSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { activationSlug } = await params;
  const sp = await searchParams;
  const activation = await getActivation(activationSlug);
  if (!activation) notFound();

  if (activation.status === "ENDED") redirect(`/${activationSlug}/ended`);
  if (activation.status === "DRAFT") notFound();
  if (activation.status === "SCHEDULED") {
    return <NotYetOpenState activation={activation} />;
  }

  return (
    <main
      style={
        activation.primaryColor
          ? ({ ["--color-primary" as never]: activation.primaryColor } as React.CSSProperties)
          : undefined
      }
      className="mx-auto max-w-md p-4"
    >
      {activation.heroImageUrl && (
        <img src={activation.heroImageUrl} alt="" className="rounded-md mb-4 w-full" />
      )}
      <article className="prose">{renderTiptap(activation.content)}</article>
      <RegistrationForm
        activationId={activation.id}
        activationSlug={activation.slug}
        boothCode={sp.booth ?? null}
        utmSource={sp.utm_source ?? null}
        utmMedium={sp.utm_medium ?? null}
        utmCampaign={sp.utm_campaign ?? null}
        consentNotice={activation.consentNotice}
        consentVersion={activation.consentVersion}
      />
    </main>
  );
}

function NotYetOpenState({
  activation,
}: {
  activation: { name: string };
}) {
  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">{activation.name}</h1>
      <p className="mt-4 text-muted-foreground">This activation isn&apos;t open yet. Come back soon.</p>
    </main>
  );
}

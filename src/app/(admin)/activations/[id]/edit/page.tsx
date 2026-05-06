import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { ActivationForm } from "@/components/admin/ActivationForm";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { env } from "@/lib/env";

interface EditActivationPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditActivationPage({ params }: EditActivationPageProps) {
  const session = await requireRole("ANY");
  const { id } = await params;

  const activation = await prisma.activation.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      reviewStatus: true,
      startsAt: true,
      endsAt: true,
      content: true,
      consentNotice: true,
      consentVersion: true,
      termsContent: true,
      consentItems: true,
      ctaText: true,
      primaryColor: true,
      heroImageUrl: true,
      heroImageAlt: true,
      submittedAt: true,
      approvedAt: true,
      reviewNotes: true,
      createdById: true,
      timezone: true,
      entryCodePrefix: true,
      // Success page fields
      successHeading: true,
      successSubheading: true,
      successContent: true,
      successCtaLabel: true,
      successCtaUrl: true,
      successShowEntryCode: true,
      successShowResend: true,
      successSponsorName: true,
      successSponsorLogoUrl: true,
      successSponsorLogoAlt: true,
      successSponsorHeadline: true,
      successSponsorBody: true,
      successSponsorCtaLabel: true,
      successSponsorCtaUrl: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      mrqContactConsentEnabled: true,
      booths: {
        select: { id: true, code: true, label: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!activation) notFound();

  return (
    <AdminShell>
      {activation.status === "LIVE" && (
        <div className="mb-4 flex items-center gap-2.5 rounded-md border border-green-500/30 bg-green-500/5 px-4 py-2.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <p className="text-sm text-green-800 dark:text-green-300 flex-1">
            This activation is live.
          </p>
          <Link
            href={`/dashboard/${id}`}
            className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400 underline underline-offset-2"
          >
            View dashboard <DynamicIcon name="ArrowRight" className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      <Suspense fallback={<div />}>
        <ActivationForm
          mode="edit"
          userRole={session.user.role}
          currentUserId={session.user.adminUserId ?? undefined}
          initialData={activation}
          participantBaseUrl={env.PUBLIC_BASE_URL}
        />
      </Suspense>
    </AdminShell>
  );
}

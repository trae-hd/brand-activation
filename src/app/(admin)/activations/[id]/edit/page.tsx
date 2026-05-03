import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { prisma } from "@/lib/db/prisma";
import { ActivationForm } from "@/components/admin/ActivationForm";

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
      startsAt: true,
      endsAt: true,
      content: true,
      consentNotice: true,
      consentVersion: true,
      primaryColor: true,
      heroImageUrl: true,
      legalApproved: true,
      booths: {
        select: { id: true, code: true, label: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!activation) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <ActivationForm mode="edit" userRole={session.user.role} initialData={activation} />
    </main>
  );
}

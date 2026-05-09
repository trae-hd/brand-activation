import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ExpiredResendForm } from "@/components/participant/ExpiredResendForm";

export default async function ExpiredPage({
  params,
  searchParams,
}: {
  params: Promise<{ activationSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { activationSlug } = await params;
  const sp = await searchParams;

  const activation = await prisma.activation.findUnique({
    where: { slug: activationSlug },
    select: { id: true, slug: true, consentVersion: true },
  });
  if (!activation) notFound();

  return (
    <main className="mx-auto w-full max-w-sm px-5 pt-5 pb-8 min-h-screen">
      <div className="mb-5 text-sm font-semibold tracking-tight">
        MrQ <span className="font-normal text-ink-3">live</span>
      </div>
      <div className="space-y-4 rounded-md border border-warn/40 bg-warn/5 p-4">
        <div>
          <h1 className="mb-1 text-xl font-bold text-warn">Code expired</h1>
          <p className="text-sm text-ink-3">
            10 minutes is short — sorry. Want a new one?
          </p>
        </div>
        <ExpiredResendForm
          activationId={activation.id}
          activationSlug={activation.slug}
          consentVersion={activation.consentVersion}
          defaultEmail={sp.email ?? ""}
        />
        <p className="text-sm">
          Or{" "}
          <a href={`/${activationSlug}`} className="underline">
            change email
          </a>{" "}
          — typo? happens.
        </p>
      </div>
    </main>
  );
}

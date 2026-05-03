export default async function EndedPage({
  params,
}: {
  params: Promise<{ activationSlug: string }>;
}) {
  const { activationSlug } = await params;
  void activationSlug;

  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">This activation has ended</h1>
      <p className="mt-4 text-muted-foreground">
        Thank you for your interest. This event has now closed.
      </p>
    </main>
  );
}

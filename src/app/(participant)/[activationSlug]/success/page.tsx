export default async function SuccessPage({
  params,
}: {
  params: Promise<{ activationSlug: string }>;
}) {
  void (await params);

  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re registered!</h1>
      <p className="mt-4 text-muted-foreground">
        Your registration has been confirmed. See you at the event.
      </p>
    </main>
  );
}

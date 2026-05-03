export default async function ExpiredPage({
  params,
}: {
  params: Promise<{ activationSlug: string }>;
}) {
  const { activationSlug } = await params;

  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">Code expired</h1>
      <p className="mt-4 text-muted-foreground">
        Your verification code has expired or too many incorrect attempts were made.
      </p>
      <a
        href={`/${activationSlug}`}
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </a>
    </main>
  );
}

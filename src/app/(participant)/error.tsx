"use client";
import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ParticipantError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[participant error]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-4 text-muted-foreground">
        We couldn&apos;t load this page. Please try refreshing.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </button>
    </main>
  );
}

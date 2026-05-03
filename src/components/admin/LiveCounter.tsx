"use client";
import { trpcReact } from "@/lib/trpc/react";

interface Props {
  activationId: string;
}

export function LiveCounter({ activationId }: Props) {
  const { data } = trpcReact.registration.liveCount.useQuery(
    { activationId },
    { refetchInterval: 10_000 }
  );

  return (
    <div className="flex gap-6">
      <div className="rounded-md border p-4 text-center min-w-24">
        <p className="text-3xl font-bold tabular-nums">{data?.verified ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">Verified</p>
      </div>
      <div className="rounded-md border p-4 text-center min-w-24">
        <p className="text-3xl font-bold tabular-nums">{data?.pending ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">Pending</p>
      </div>
    </div>
  );
}

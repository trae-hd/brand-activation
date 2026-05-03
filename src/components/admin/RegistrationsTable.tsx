"use client";
import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";

interface Props {
  activationId: string;
}

export function RegistrationsTable({ activationId }: Props) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<(string | undefined)[]>([undefined]);
  const page = history.length - 1;

  const { data, isLoading } = trpcReact.registration.list.useQuery(
    { activationId, cursor, take: 50 },
    { placeholderData: keepPreviousData }
  );

  function nextPage() {
    if (!data?.nextCursor) return;
    setHistory((h) => [...h, data.nextCursor ?? undefined]);
    setCursor(data.nextCursor ?? undefined);
  }

  function prevPage() {
    if (page === 0) return;
    const prev = history[page - 1];
    setHistory((h) => h.slice(0, -1));
    setCursor(prev);
  }

  if (isLoading) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        No verified registrations yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Registered</th>
              <th className="px-3 py-2 font-medium">Verified</th>
              <th className="px-3 py-2 font-medium">Booth</th>
              <th className="px-3 py-2 font-medium">UTM source</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(r.registeredAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.verifiedAt
                    ? new Date(r.verifiedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{r.boothCode ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.utmSource ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Page {page + 1}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={prevPage}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.nextCursor}
            onClick={nextPage}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

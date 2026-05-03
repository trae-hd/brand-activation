"use client";
import { useState, useTransition } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DsarClient() {
  const [email, setEmail] = useState("");
  const [requestRef, setRequestRef] = useState("");
  const [submitted, setSubmitted] = useState<{ email: string; requestRef: string } | null>(null);
  const [, startTransition] = useTransition();

  const preview = trpcReact.compliance.dsar.preview.useQuery(
    { email: submitted?.email ?? "" },
    { enabled: !!submitted }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !requestRef) return;
    startTransition(() => {
      setSubmitted({ email: email.toLowerCase(), requestRef });
    });
  }

  const exportUrl = submitted
    ? `/api/admin/dsar/export?email=${encodeURIComponent(submitted.email)}&requestRef=${encodeURIComponent(submitted.requestRef)}`
    : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          Enter the participant email and your request reference (ticket ID). The downloaded CSV
          is delivered to the data subject via a Compliance-approved channel.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Participant email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="participant@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="requestRef">Request reference</Label>
          <Input
            id="requestRef"
            required
            value={requestRef}
            onChange={(e) => setRequestRef(e.target.value)}
            placeholder="DSAR-2024-001"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {submitted && (
        <div className="rounded-md border p-4 space-y-3">
          {preview.isLoading && (
            <p className="text-sm text-muted-foreground">Searching…</p>
          )}
          {preview.data && preview.data.rowCount === 0 && (
            <p className="text-sm text-muted-foreground">
              No registrations found for <strong>{submitted.email}</strong>.
            </p>
          )}
          {preview.data && preview.data.rowCount > 0 && (
            <>
              <p className="text-sm">
                Found <strong>{preview.data.rowCount}</strong> registration
                {preview.data.rowCount !== 1 ? "s" : ""} across{" "}
                <strong>{preview.data.activationNames.join(", ")}</strong>.
              </p>
              <Button asChild variant="outline" size="sm">
                <a href={exportUrl!} download>
                  Download DSAR CSV
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Downloading records the fulfilment in the audit log. Deliver the CSV via your
                Compliance-approved channel — do not email it directly.
              </p>
            </>
          )}
          {preview.error && (
            <p className="text-sm text-destructive">Error: {preview.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

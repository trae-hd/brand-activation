"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DsarClient() {
  const [email, setEmail] = useState("");
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const preview = trpcReact.compliance.dsar.preview.useQuery(
    { email: lookedUp ?? "" },
    { enabled: !!lookedUp }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLookedUp(email.toLowerCase().trim());
    setDownloadError(null);
  }

  async function handleDownload() {
    if (!lookedUp || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/admin/dsar/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lookedUp, requestRef: `DSAR-${Date.now()}` }),
      });
      if (!res.ok) {
        setDownloadError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsar-${lookedUp.replace(/[^a-z0-9]/gi, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Network error. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Look up a participant by email to see what data exists for them and
        download their DSAR export. Deliver the export via your Compliance-approved
        channel — do not email it directly.
      </p>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex items-end gap-3 max-w-lg">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="dsar-email">Participant email</Label>
          <Input
            id="dsar-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="participant@example.com"
            autoComplete="off"
          />
        </div>
        <Button type="submit">Look up</Button>
      </form>

      {/* Results card */}
      {lookedUp && (
        <div className="rounded-md border p-5 space-y-4 max-w-lg">
          {preview.isLoading && (
            <p className="text-sm text-muted-foreground">Searching…</p>
          )}

          {preview.error && (
            <p className="text-sm text-destructive">Error: {preview.error.message}</p>
          )}

          {preview.data && preview.data.rowCount === 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">No records found</p>
              <p className="text-xs text-muted-foreground">
                No registrations for{" "}
                <span className="font-mono">{lookedUp}</span>.
              </p>
            </div>
          )}

          {preview.data && preview.data.rowCount > 0 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Data on file</p>
                <p className="text-xs text-muted-foreground font-mono">{lookedUp}</p>
              </div>

              <ul className="space-y-1 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Registrations</span>
                  <span className="tabular-nums font-medium">{preview.data.rowCount}</span>
                </li>
                <li className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Activations</span>
                  <span className="text-right text-xs">
                    {preview.data.activationNames.join(", ")}
                  </span>
                </li>
              </ul>

              <div className="pt-1 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isDownloading}
                >
                  {isDownloading ? "Preparing…" : "Download CSV"}
                </Button>
                {downloadError && (
                  <p className="text-xs text-destructive">{downloadError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Downloading records the fulfilment in the audit log.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

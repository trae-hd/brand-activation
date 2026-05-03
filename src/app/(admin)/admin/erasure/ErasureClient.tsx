"use client";
import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "search" | "confirm" | "done";

const REQUIRED_PHRASE = "ERASE PARTICIPANT DATA";

export function ErasureClient() {
  const [step, setStep] = useState<Step>("search");
  const [email, setEmail] = useState("");
  const [requestRef, setRequestRef] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ rowCount: number; requestRef: string } | null>(null);

  const preview = trpcReact.compliance.erasure.preview.useQuery(
    { email },
    { enabled: step === "confirm" && !!email }
  );

  const fulfil = trpcReact.compliance.erasure.fulfil.useMutation({
    onSuccess(data) {
      setResult({ rowCount: data.rowCount, requestRef });
      setStep("done");
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !requestRef) return;
    setStep("confirm");
  }

  function handleFulfil(e: React.FormEvent) {
    e.preventDefault();
    if (typedPhrase !== REQUIRED_PHRASE || !reason) return;
    fulfil.mutate({
      email,
      requestRef,
      typedPhrase: REQUIRED_PHRASE,
      reason,
    });
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 space-y-2">
        <p className="font-semibold">Erasure complete</p>
        <p className="text-sm">
          <strong>{result.rowCount}</strong> registration
          {result.rowCount !== 1 ? "s" : ""} erased. Reference:{" "}
          <span className="font-mono">{result.requestRef}</span>.
        </p>
        <p className="text-xs text-muted-foreground">
          The audit log entry has been written. This action is irreversible.
        </p>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-6">
        <div className="rounded-md border p-4 space-y-2">
          {preview.isLoading && (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          )}
          {preview.data && (
            <>
              <p className="text-sm font-medium">
                This will permanently erase{" "}
                <strong>{preview.data.rowCount}</strong> registration
                {preview.data.rowCount !== 1 ? "s" : ""} for{" "}
                <span className="font-mono">{email}</span>.
              </p>
              {preview.data.activationNames.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Activations: {preview.data.activationNames.join(", ")}
                </p>
              )}
            </>
          )}
          {preview.data?.rowCount === 0 && (
            <p className="text-sm text-muted-foreground">
              No registrations found for this email. Proceeding will write an audit row with
              rowCount = 0.
            </p>
          )}
        </div>

        <form onSubmit={handleFulfil} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="reason">Reason for erasure</Label>
            <Input
              id="reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Data subject requested erasure per Art. 17 GDPR"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="typedPhrase">
              Type <span className="font-mono font-semibold">{REQUIRED_PHRASE}</span> to confirm
            </Label>
            <Input
              id="typedPhrase"
              required
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              placeholder={REQUIRED_PHRASE}
              className={
                typedPhrase.length > 0 && typedPhrase !== REQUIRED_PHRASE
                  ? "border-destructive"
                  : ""
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="destructive"
              disabled={typedPhrase !== REQUIRED_PHRASE || !reason || fulfil.isPending}
            >
              {fulfil.isPending ? "Erasing…" : "Confirm erasure"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep("search");
                setTypedPhrase("");
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
          {fulfil.error && (
            <p className="text-sm text-destructive">{fulfil.error.message}</p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        ADMIN only. Permanently deletes all registrations for a participant. This is
        irreversible. Audit log entries referencing the participant by hash are retained
        per §14.3 (GDPR Art. 17(3)(e)).
      </p>
      <form onSubmit={handleSearch} className="space-y-4">
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
            placeholder="ERASURE-2024-001"
          />
        </div>
        <Button type="submit" variant="destructive">
          Preview erasure
        </Button>
      </form>
    </div>
  );
}

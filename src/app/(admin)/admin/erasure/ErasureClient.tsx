"use client";

import { useState } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERASURE_REQUIRED_PHRASE } from "@/lib/compliance/constants";

type Step = "search" | "confirm" | "done";

const REQUIRED_PHRASE = ERASURE_REQUIRED_PHRASE;

export function ErasureClient() {
  const [step, setStep] = useState<Step>("search");
  const [email, setEmail] = useState("");
  const [requestRef, setRequestRef] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ rowCount: number } | null>(null);

  const preview = trpcReact.compliance.erasure.preview.useQuery(
    { email },
    { enabled: step === "confirm" && !!email }
  );

  const fulfil = trpcReact.compliance.erasure.fulfil.useMutation({
    onSuccess(data) {
      setResult({ rowCount: data.rowCount });
      setStep("done");
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !requestRef) return;
    setStep("confirm");
  }

  function handleFulfil() {
    if (typedPhrase !== REQUIRED_PHRASE || !reason.trim()) return;
    fulfil.mutate({ email, requestRef, typedPhrase: REQUIRED_PHRASE, reason });
  }

  function handleCancel() {
    setStep("search");
    setTypedPhrase("");
    setReason("");
    fulfil.reset();
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-md border border-[--crit]/30 bg-[--crit]/5 p-6 space-y-2">
        <p className="font-semibold">Erasure complete</p>
        <p className="text-sm">
          <strong>{result.rowCount}</strong> registration
          {result.rowCount !== 1 ? "s" : ""} erased. Reference:{" "}
          <span className="font-mono">{requestRef}</span>.
        </p>
        <p className="text-xs text-muted-foreground">
          The audit log entry has been written. This action is irreversible.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setStep("search");
            setEmail("");
            setRequestRef("");
            setResult(null);
          }}
        >
          New request
        </Button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="rounded-md border p-6 space-y-4 max-w-lg">
        {/* DESTRUCTIVE label */}
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--crit)" }}
        >
          Destructive
        </p>

        {/* Heading + email */}
        <div>
          <h2 className="text-xl font-semibold">
            Erase {preview.data?.rowCount ?? "…"} record
            {(preview.data?.rowCount ?? 0) !== 1 ? "s" : ""}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Email ·{" "}
            <span className="font-mono text-foreground">{email}</span>
          </p>
          {preview.data?.activationNames && preview.data.activationNames.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Activations: {preview.data.activationNames.join(", ")}
            </p>
          )}
        </div>

        <hr className="border-border" />

        {/* Consequences list */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            This will:
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>· delete the registration row</li>
            <li>· add the email's HMAC hash to <strong className="text-foreground">suppression</strong></li>
            <li>· write an erasure entry to audit (visible)</li>
            <li>· remove from any future CSV export</li>
          </ul>
        </div>

        <hr className="border-border" />

        {/* Reason + phrase inputs */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (required)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="User requested · ticket #XXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="typedPhrase">
              Type{" "}
              <code className="font-mono font-semibold">{REQUIRED_PHRASE}</code>{" "}
              to confirm
            </Label>
            <Input
              id="typedPhrase"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              placeholder={REQUIRED_PHRASE}
              autoComplete="off"
              className={
                typedPhrase.length > 0 && typedPhrase !== REQUIRED_PHRASE
                  ? "border-destructive"
                  : ""
              }
            />
          </div>

          {fulfil.error && (
            <p className="text-sm text-destructive" role="alert">
              {fulfil.error.message}
            </p>
          )}

          {/* Button row */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={fulfil.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleFulfil}
              disabled={
                typedPhrase !== REQUIRED_PHRASE ||
                !reason.trim() ||
                fulfil.isPending
              }
              style={{ backgroundColor: "var(--crit)", color: "#fff" }}
              className="border-0"
            >
              {fulfil.isPending ? "Erasing…" : "Erase"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Permanently deletes all registrations for a participant. This is irreversible.
        Audit log entries referencing the participant by hash are retained per §14.3
        (GDPR Art. 17(3)(e)).
      </p>

      <form onSubmit={handleSearch} className="space-y-4 max-w-lg">
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <Label htmlFor="requestRef">Request reference</Label>
          <Input
            id="requestRef"
            required
            value={requestRef}
            onChange={(e) => setRequestRef(e.target.value)}
            placeholder="ERASURE-2025-001"
          />
        </div>
        <Button type="submit" variant="destructive">
          Preview erasure
        </Button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationStatus } from "@prisma/client";
import type { StatusTransitionDialogProps } from "@/types/activation";
import {
  PHRASE_GATES,
  ALLOWED_TRANSITIONS,
  TRANSITION_LABELS,
} from "@/lib/activation/transitions";

type PendingAction =
  | { type: "status"; to: ActivationStatus }
  | { type: "submit_review" };

const SUBMITTABLE_REVIEW_STATES = ["DRAFT", "DRAFT_EDITED", "CHANGES_REQUESTED"] as const;

function liveCtaLabel(startsAt: Date): string {
  const ms = startsAt.getTime() - Date.now();
  if (ms <= 0) return "Go LIVE now";
  const m = Math.ceil(ms / 60_000);
  return `Go LIVE in ${m}m`;
}

function countFilledParagraphs(doc: unknown): number {
  if (!doc || typeof doc !== "object") return 0;
  const { content } = doc as { content?: unknown[] };
  if (!Array.isArray(content)) return 0;
  return content.filter((node) => {
    if (!node || typeof node !== "object") return false;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== "paragraph" || !Array.isArray(n.content) || n.content.length === 0) return false;
    return n.content.some((child) => {
      const c = child as { type?: string; text?: string };
      return c.type === "text" && typeof c.text === "string" && c.text.trim().length > 0;
    });
  }).length;
}

function PreflightRow({
  pass,
  blocking,
  label,
  sub,
}: {
  pass: boolean;
  blocking: boolean;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">
        {!blocking ? (
          <DynamicIcon name="AlertCircle" className="h-4 w-4 text-amber-500" />
        ) : pass ? (
          <DynamicIcon name="CheckCircle2" className="h-4 w-4 text-[--ok]" />
        ) : (
          <DynamicIcon name="XCircle" className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-tight">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function StatusTransitionDialog({
  open,
  onOpenChange,
  activationId,
  currentStatus,
  reviewStatus,
  startsAt,
  endsAt,
  slug,
  content,
  consentNotice,
  consentItems,
  boothCount,
  isCreator,
  onSuccess,
  onReviewStatusChange,
}: StatusTransitionDialogProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTo = pendingAction?.type === "status" ? pendingAction.to : null;
  const availableTargets = ALLOWED_TRANSITIONS[currentStatus];
  const transitionKey = selectedTo ? `${currentStatus}→${selectedTo}` : null;
  const requiredPhrase = transitionKey ? (PHRASE_GATES[transitionKey] ?? null) : null;
  // Capture `now` once at mount via the useState initializer (which `react-
  // hooks/purity` explicitly permits for non-deterministic setup) instead
  // of reading `Date.now()` directly during render. Matches the existing
  // behaviour: this dialog is transient, the gating is human-scale
  // (5-minute windows around activation start/end), and a tiny drift
  // between renders has no operational impact. If you ever need this to
  // tick live as time passes, add a useEffect + setInterval to bump state.
  const [now] = useState(() => Date.now());

  const isReviewApproved = reviewStatus === "APPROVED";
  const canSubmitForReview =
    isCreator &&
    (SUBMITTABLE_REVIEW_STATES as readonly string[]).includes(reviewStatus);

  function isTransitionAllowed(to: ActivationStatus): boolean {
    if (`${currentStatus}→${to}` === "DRAFT→SCHEDULED" && !isReviewApproved) return false;
    return true;
  }

  function isTimeGated(to: ActivationStatus): boolean {
    if (currentStatus === "SCHEDULED" && to === "LIVE") {
      return now < startsAt.getTime() - 5 * 60 * 1000;
    }
    if (currentStatus === "LIVE" && to === "ENDED") {
      return now < endsAt.getTime();
    }
    return false;
  }

  const phraseMatches = requiredPhrase ? phrase === requiredPhrase : true;
  const reasonOk = requiredPhrase ? reason.trim().length > 0 : true;
  const timeGated = selectedTo ? isTimeGated(selectedTo) : false;
  const isGoingLive = currentStatus === "SCHEDULED" && selectedTo === "LIVE";

  const contentOk = countFilledParagraphs(content) >= 1;
  const hasConsentItems = Array.isArray(consentItems) && consentItems.length > 0;
  const consentOk = hasConsentItems || countFilledParagraphs(consentNotice) >= 1;
  // Booths are optional — activations can run with a single non-booth QR.
  // The row below is kept as an informational confidence signal (configured
  // count, or "single QR mode" when zero), but it does not gate going LIVE.
  const hasBooths = boothCount >= 1;
  const preflightOk = isReviewApproved && contentOk && consentOk;
  const slugOk = slugInput === slug;

  const canConfirm =
    pendingAction !== null &&
    !isLoading &&
    (pendingAction.type === "submit_review"
      ? true
      : isTransitionAllowed(pendingAction.to) &&
        phraseMatches &&
        reasonOk &&
        (!isGoingLive || (preflightOk && slugOk)));

  function handleClose() {
    setPendingAction(null);
    setPhrase("");
    setReason("");
    setSlugInput("");
    setError(null);
    onOpenChange(false);
  }

  function selectAction(action: PendingAction) {
    setPendingAction(action);
    setPhrase("");
    setReason("");
    setSlugInput("");
    setError(null);
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    setError(null);
    setIsLoading(true);
    try {
      if (pendingAction.type === "submit_review") {
        await trpc.activation.submitForReview.mutate({ activationId });
        handleClose();
        onReviewStatusChange?.("SUBMITTED");
      } else {
        await trpc.activation.transitionStatus.mutate({
          activationId,
          to: pendingAction.to,
          phrase: requiredPhrase ? phrase : undefined,
          reason: requiredPhrase ? reason : undefined,
          force: timeGated ? true : undefined,
        });
        handleClose();
        onSuccess(pendingAction.to);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Action failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  const ctaLabel =
    pendingAction?.type === "submit_review"
      ? "Submit for review"
      : isGoingLive
      ? liveCtaLabel(startsAt)
      : "Confirm";

  const reviewStatusLabel: Record<string, string> = {
    DRAFT: "Not yet submitted",
    DRAFT_EDITED: "Edited since approval — re-review needed",
    CHANGES_REQUESTED: "Changes were requested",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change activation status</DialogTitle>
          <DialogDescription>
            Current status: <strong>{currentStatus}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* ── Review actions ─────────────────────────────────────── */}
          {canSubmitForReview && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Review
              </p>
              <button
                type="button"
                onClick={() => selectAction({ type: "submit_review" })}
                className={[
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left",
                  pendingAction?.type === "submit_review"
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/50",
                ].join(" ")}
              >
                <span>Submit for review</span>
                <span className="text-xs text-muted-foreground">
                  {reviewStatusLabel[reviewStatus] ?? ""}
                </span>
              </button>
            </div>
          )}

          {/* ── Status transitions ─────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            {canSubmitForReview && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {availableTargets.map((to) => {
                const key = `${currentStatus}→${to}`;
                const allowed = isTransitionAllowed(to);
                const gated = isTimeGated(to);
                const label = TRANSITION_LABELS[key] ?? `→ ${to}`;
                const disableReason =
                  key === "DRAFT→SCHEDULED" && !isReviewApproved
                    ? reviewStatus === "SUBMITTED"
                      ? "Awaiting approval"
                      : "Submit for review first"
                    : null;

                return (
                  <button
                    key={to}
                    type="button"
                    disabled={!allowed}
                    onClick={() => selectAction({ type: "status", to })}
                    className={[
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left",
                      pendingAction?.type === "status" && pendingAction.to === to
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted/50",
                      !allowed && "cursor-not-allowed opacity-50",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span>{label}</span>
                    <span className="flex items-center gap-1.5">
                      {gated && <span className="text-xs text-amber-600">early — will force</span>}
                      {disableReason && (
                        <span className="text-xs text-destructive">{disableReason}</span>
                      )}
                      {PHRASE_GATES[key] && (
                        <span className="text-xs text-muted-foreground">requires phrase</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Preflight checklist — SCHEDULED→LIVE only ─────────── */}
          {isGoingLive && selectedTo === "LIVE" && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pre-flight checks
              </p>
              <div className="flex flex-col gap-2">
                <PreflightRow
                  pass={isReviewApproved}
                  blocking
                  label="Peer review approved"
                  sub={
                    isReviewApproved
                      ? "Approved by a second admin"
                      : reviewStatus === "SUBMITTED"
                      ? "Under review — awaiting approval"
                      : "Submit for peer review to proceed"
                  }
                />
                <PreflightRow
                  pass={contentOk}
                  blocking
                  label="Marketing copy"
                  sub={
                    contentOk
                      ? "At least one paragraph"
                      : "Add at least one paragraph in the Content tab"
                  }
                />
                <PreflightRow
                  pass={consentOk}
                  blocking
                  label="Consent"
                  sub={
                    consentOk
                      ? hasConsentItems
                        ? `${(consentItems as unknown[]).length} consent item${(consentItems as unknown[]).length !== 1 ? "s" : ""}`
                        : "Consent notice added"
                      : "Add at least one consent item or consent notice"
                  }
                />
                <PreflightRow
                  pass={hasBooths}
                  blocking={false}
                  label="Booths"
                  sub={
                    hasBooths
                      ? `${boothCount} booth${boothCount !== 1 ? "s" : ""} configured`
                      : "Single QR mode — no booths configured (optional)"
                  }
                />
              </div>
            </div>
          )}

          {/* ── Slug confirmation — SCHEDULED→LIVE only ───────────── */}
          {isGoingLive && selectedTo === "LIVE" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="slugConfirm">
                Type <code className="font-mono font-semibold">{slug}</code> to confirm
              </Label>
              <Input
                id="slugConfirm"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                placeholder={slug}
                autoComplete="off"
                className={slugInput && !slugOk ? "border-destructive" : ""}
              />
            </div>
          )}

          {/* ── Phrase gate inputs ─────────────────────────────────── */}
          {selectedTo && requiredPhrase && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phrase">
                  Type <code className="font-mono font-semibold">{requiredPhrase}</code> to confirm
                </Label>
                <Input
                  id="phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={requiredPhrase}
                  autoComplete="off"
                  className={phrase && !phraseMatches ? "border-destructive" : ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reason">Reason (required)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe why this transition is necessary…"
                  maxLength={500}
                  rows={3}
                />
                <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
              </div>
            </>
          )}

          {error && (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {isLoading ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Confirming…
              </>
            ) : (
              ctaLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

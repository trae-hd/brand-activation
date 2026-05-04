"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationReviewStatus, ActivationStatus } from "@prisma/client";
import type { ConsentItem } from "@/types/activation";
import { SectionLabel } from "./form-section";
import { ActivationReviewDiff } from "./ActivationReviewDiff";

export interface ReviewStateUpdate {
  reviewStatus: ActivationReviewStatus;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  reviewNotes?: string | null;
}

interface Props {
  mode: "create" | "edit";
  isAdmin: boolean;
  isCreator: boolean;
  activationId: string;
  reviewStatus: ActivationReviewStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  reviewNotes: string | null;
  currentStatus: ActivationStatus;
  consentVersion: string;
  // Current form state — passed to the diff viewer
  name: string;
  slug: string;
  heroImageUrl: string;
  content: unknown;
  consentNotice: unknown;
  consentItems: ConsentItem[];
  ctaText: string;
  termsContent: unknown;
  primaryColor: string;
  onReviewChange: (updates: ReviewStateUpdate) => void;
  onOpenTransitionDialog: () => void;
}

const STATUS_LABELS: Record<ActivationReviewStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted for review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DRAFT_EDITED: "Previously approved — re-review needed",
};

const STATUS_COLOURS: Record<ActivationReviewStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  APPROVED: "bg-green-500/10 text-green-700 dark:text-green-400",
  CHANGES_REQUESTED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  DRAFT_EDITED: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export function ActivationFormReview({
  mode,
  isAdmin,
  isCreator,
  activationId,
  reviewStatus,
  submittedAt,
  approvedAt,
  reviewNotes,
  currentStatus,
  consentVersion,
  name,
  slug,
  heroImageUrl,
  content,
  consentNotice,
  consentItems,
  ctaText,
  termsContent,
  primaryColor,
  onReviewChange,
  onOpenTransitionDialog,
}: Props) {
  const [notes, setNotes] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedConsentDiff, setAcknowledgedConsentDiff] = useState(false);

  // Fetch last approved snapshot — only relevant for the reviewer panel (non-creator SUBMITTED).
  const snapshotQuery = trpcReact.activation.getLastApprovedSnapshot.useQuery(
    { activationId },
    { enabled: mode === "edit" && !isCreator && reviewStatus === "SUBMITTED" },
  );

  if (mode !== "edit") return null;

  const fmt = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d)
      : null;

  const snapshot = snapshotQuery.data?.snapshot ?? null;
  const consentVersionApproved = snapshotQuery.data?.consentVersionApproved ?? null;
  const hasConsentDiff =
    !!consentVersionApproved && consentVersionApproved !== consentVersion;
  const approveDisabled =
    isBusy || (hasConsentDiff && !acknowledgedConsentDiff);

  async function handleSubmit() {
    setError(null);
    setIsBusy(true);
    try {
      await trpc.activation.submitForReview.mutate({ activationId });
      onReviewChange({ reviewStatus: "SUBMITTED", submittedAt: new Date() });
      setNotes("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit for review.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleApprove() {
    setError(null);
    setIsBusy(true);
    try {
      await trpc.activation.approveReview.mutate({
        activationId,
        notes: notes.trim() || undefined,
        acknowledgedConsentDiff: hasConsentDiff ? acknowledgedConsentDiff : true,
      });
      onReviewChange({ reviewStatus: "APPROVED", approvedAt: new Date(), reviewNotes: notes.trim() || null });
      setNotes("");
      setAcknowledgedConsentDiff(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRequestChanges() {
    if (!notes.trim()) {
      setError("Notes are required when requesting changes.");
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      await trpc.activation.requestChanges.mutate({ activationId, notes: notes.trim() });
      onReviewChange({ reviewStatus: "CHANGES_REQUESTED", reviewNotes: notes.trim() });
      setNotes("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request changes.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Peer review</SectionLabel>

      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[reviewStatus]}`}>
          {STATUS_LABELS[reviewStatus]}
        </span>
        {reviewStatus === "APPROVED" && approvedAt && (
          <span className="text-muted-foreground text-xs">Approved {fmt(approvedAt)}</span>
        )}
        {reviewStatus === "SUBMITTED" && submittedAt && (
          <span className="text-muted-foreground text-xs">Submitted {fmt(submittedAt)}</span>
        )}
      </div>

      {/* DRAFT_EDITED warning for creator */}
      {isCreator && reviewStatus === "DRAFT_EDITED" && (
        <div className="flex items-start gap-2.5 rounded-md border border-orange-500/30 bg-orange-500/5 px-4 py-3">
          <DynamicIcon name="AlertTriangle" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <p className="text-sm text-orange-800 dark:text-orange-300">
            You&apos;ve edited this activation after it was approved. Submit for re-review before it can be scheduled.
          </p>
        </div>
      )}

      {/* Reviewer notes (changes requested) */}
      {reviewStatus === "CHANGES_REQUESTED" && reviewNotes && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Changes requested</p>
          <p className="text-muted-foreground mt-1 text-xs">{reviewNotes}</p>
        </div>
      )}

      {/* Creator: submit / resubmit */}
      {isCreator && ["DRAFT", "DRAFT_EDITED", "CHANGES_REQUESTED"].includes(reviewStatus) && (
        <Button type="button" onClick={handleSubmit} disabled={isBusy} className="w-fit">
          {isBusy ? (
            <><DynamicIcon name="Loader2" className="animate-spin" />Submitting…</>
          ) : reviewStatus === "CHANGES_REQUESTED" ? (
            "Resubmit for review"
          ) : reviewStatus === "DRAFT_EDITED" ? (
            "Submit for re-review"
          ) : (
            "Submit for review"
          )}
        </Button>
      )}

      {/* Creator: awaiting review */}
      {isCreator && reviewStatus === "SUBMITTED" && (
        <p className="text-muted-foreground text-sm">Awaiting review by another user.</p>
      )}

      {/* Non-creator: review panel */}
      {!isCreator && reviewStatus === "SUBMITTED" && (
        <div className="flex flex-col gap-4 rounded-md border bg-muted/10 px-4 py-4">
          {/* Side-by-side diff — only when a prior approval snapshot exists */}
          {snapshot && consentVersionApproved && (
            <ActivationReviewDiff
              snapshot={snapshot}
              consentVersionApproved={consentVersionApproved}
              name={name}
              slug={slug}
              heroImageUrl={heroImageUrl}
              content={content}
              consentNotice={consentNotice}
              consentItems={consentItems}
              ctaText={ctaText}
              termsContent={termsContent}
              primaryColor={primaryColor}
              currentConsentVersion={consentVersion}
              acknowledgedConsentDiff={acknowledgedConsentDiff}
              onAcknowledgedChange={setAcknowledgedConsentDiff}
            />
          )}

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add review notes (required if requesting changes, optional if approving)…"
            rows={2}
            maxLength={500}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleApprove}
              disabled={approveDisabled}
              className="w-fit"
              title={approveDisabled && hasConsentDiff && !acknowledgedConsentDiff
                ? "Acknowledge the consent changes above before approving"
                : undefined}
            >
              {isBusy ? <><DynamicIcon name="Loader2" className="animate-spin" />Approving…</> : "Approve"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRequestChanges}
              disabled={isBusy}
              className="w-fit"
            >
              Request changes
            </Button>
          </div>
        </div>
      )}

      {/* Ready to schedule / go live nudge */}
      {reviewStatus === "APPROVED" && (currentStatus === "DRAFT" || currentStatus === "SCHEDULED") && (
        <div className="flex items-center gap-2.5 rounded-md border bg-muted/20 px-4 py-2.5">
          <DynamicIcon name="ArrowRight" className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm">
            {currentStatus === "DRAFT" ? (
              <>
                Ready to schedule — use{" "}
                <button
                  type="button"
                  onClick={onOpenTransitionDialog}
                  className="font-medium underline underline-offset-2"
                >
                  Change status
                </button>{" "}
                above to move forward.
              </>
            ) : (
              <>
                Scheduled — use{" "}
                <button
                  type="button"
                  onClick={onOpenTransitionDialog}
                  className="font-medium underline underline-offset-2"
                >
                  Change status
                </button>{" "}
                above to go LIVE.
              </>
            )}
          </p>
        </div>
      )}

      {error && (
        <p className="text-destructive text-xs" role="alert">{error}</p>
      )}
    </div>
  );
}

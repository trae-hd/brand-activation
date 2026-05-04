import type { ActivationStatus, ActivationReviewStatus } from "@prisma/client";

export function reviewStatusBadge(
  reviewStatus: ActivationReviewStatus
): { label: string; className: string } | null {
  switch (reviewStatus) {
    case "SUBMITTED":
      return {
        label: "Under review",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "APPROVED":
      return {
        label: "Approved",
        className: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
      };
    case "CHANGES_REQUESTED":
      return {
        label: "Changes requested",
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "DRAFT_EDITED":
      return {
        label: "Re-review needed",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "DRAFT":
    default:
      return null;
  }
}

export function statusBadgeClass(status: ActivationStatus): string {
  switch (status) {
    case "LIVE":
      return "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400";
    case "SCHEDULED":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "ENDED":
      return "border-border bg-muted/60 text-muted-foreground";
    case "DRAFT":
    default:
      return "border-border bg-transparent text-muted-foreground";
  }
}

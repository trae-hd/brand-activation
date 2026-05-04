"use client";

import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ActivationReviewStatus, ActivationStatus } from "@prisma/client";

interface Props {
  mode: "create" | "edit";
  isSaving: boolean;
  saveError: string | null;
  reviewStatus: ActivationReviewStatus;
  currentStatus: ActivationStatus;
  name: string;
  onSave: () => void;
  onCancel: () => void;
}

export function ActivationFormSaveBar({
  mode,
  isSaving,
  saveError,
  reviewStatus,
  currentStatus,
  name,
  onSave,
  onCancel,
}: Props) {
  const hint = (() => {
    if (mode === "create") return "Fill in the details above, then save.";
    if (reviewStatus === "APPROVED" && currentStatus === "DRAFT") return "Approved · use Change status to schedule";
    return `Editing · ${name || "untitled"}`;
  })();

  return (
    <div className="sticky bottom-0 z-10 -mx-6 border-t bg-background px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {saveError ? (
          <p className="text-destructive text-sm" role="alert">
            {saveError}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">{hint}</p>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <DynamicIcon name="Loader2" className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

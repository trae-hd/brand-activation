"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { PickWinnersDialog } from "./PickWinnersDialog";
import type { ActivationStatus, AdminRole } from "@prisma/client";

interface Props {
  activationId: string;
  activationStatus: ActivationStatus;
  userRole: AdminRole;
}

/**
 * "Pick winners" button on the activation dashboard.
 *
 * Visibility:
 *   - Hidden for MEMBER role (the dialog's draw mutation is ADMIN-only;
 *     showing the button to MEMBERs would be misleading)
 *   - Hidden when activation status is DRAFT or SCHEDULED — picking winners
 *     on an activation that hasn't launched is meaningless
 *   - Visible only when role === ADMIN AND status ∈ {LIVE, ENDED}
 *
 * The dialog component owns its own state machine (compose / drawing /
 * result); this button just toggles its open prop.
 */
export function PickWinnersButton({
  activationId,
  activationStatus,
  userRole,
}: Props) {
  const [open, setOpen] = useState(false);

  if (userRole !== "ADMIN") return null;
  if (activationStatus !== "LIVE" && activationStatus !== "ENDED") return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <DynamicIcon name="Trophy" className="h-3.5 w-3.5" />
        Pick winners
      </Button>
      <PickWinnersDialog
        open={open}
        onOpenChange={setOpen}
        activationId={activationId}
      />
    </>
  );
}

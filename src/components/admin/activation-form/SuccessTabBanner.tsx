"use client";

import { useState } from "react";
import { DynamicIcon } from "@/components/ui/DynamicIcon";

const DISMISSED_KEY_PREFIX = "mrq:successTabBannerDismissed:";

interface Props {
  activationId: string | undefined;
  mode: "create" | "edit";
}

export function SuccessTabBanner({ activationId, mode }: Props) {
  // Read sessionStorage in a lazy initializer so visibility is correct on the
  // first render. SSR-safe via the `typeof window` guard; React 19 prefers
  // this over a same-render setState-in-effect.
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (mode !== "create" || !activationId) return false;
    return !sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${activationId}`);
  });

  if (!visible) return null;

  function dismiss() {
    if (activationId) {
      sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${activationId}`, "1");
    }
    setVisible(false);
  }

  return (
    <div className="flex items-start gap-3 rounded-md border bg-blue-500/5 border-blue-500/20 px-4 py-3">
      <DynamicIcon name="Sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          Now design the page punters see after they verify. Their email and entry code are
          inserted automatically — you control everything else.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <DynamicIcon name="X" className="h-4 w-4" />
      </button>
    </div>
  );
}

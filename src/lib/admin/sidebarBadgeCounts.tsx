"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { BadgeCountKey } from "@/types/navigation-type";

interface BadgeCountContextValue {
  counts: Record<BadgeCountKey, number>;
  setCounts: (counts: Partial<Record<BadgeCountKey, number>>) => void;
}

const DEFAULT: BadgeCountContextValue = {
  counts: { pendingReview: 0, liveCount: 0 },
  setCounts: () => {},
};

export const BadgeCountContext = createContext<BadgeCountContextValue>(DEFAULT);

export function useBadgeCounts(): Record<BadgeCountKey, number> {
  return useContext(BadgeCountContext).counts;
}

export function BadgeCountProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<BadgeCountKey, number>>({
    pendingReview: 0,
    liveCount: 0,
  });

  const merge = useCallback((next: Partial<Record<BadgeCountKey, number>>) => {
    setCounts((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo(() => ({ counts, setCounts: merge }), [counts, merge]);

  return (
    <BadgeCountContext.Provider value={value}>
      {children}
    </BadgeCountContext.Provider>
  );
}

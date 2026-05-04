"use client";

import { useEffect, useContext, type ReactNode } from "react";
import { trpcReact } from "@/lib/trpc/react";
import { BadgeCountContext, BadgeCountProvider } from "@/lib/admin/sidebarBadgeCounts";
import type { AdminRole } from "@prisma/client";

function Fetcher({ userRole: _userRole }: { userRole: AdminRole }) {
  const { setCounts } = useContext(BadgeCountContext);

  const { data: pendingReview } = trpcReact.activation.countPendingReviewForMe.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const { data: liveCount } = trpcReact.activation.countLive.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const next: Partial<Record<"pendingReview" | "liveCount", number>> = {};
    if (pendingReview !== undefined) next.pendingReview = pendingReview;
    if (liveCount !== undefined) next.liveCount = liveCount;
    if (Object.keys(next).length > 0) setCounts(next);
  }, [pendingReview, liveCount, setCounts]);

  return null;
}

export function SidebarBadgeFetcher({ children, userRole }: { children: ReactNode; userRole: AdminRole }) {
  return (
    <BadgeCountProvider>
      <Fetcher userRole={userRole} />
      {children}
    </BadgeCountProvider>
  );
}

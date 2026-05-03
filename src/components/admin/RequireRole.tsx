"use client";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import type { AdminRole } from "@prisma/client";

/** Hides children from non-matching roles. NOT a security boundary — the tRPC procedure is. */
export function RequireRole({ role, children }: { role: AdminRole; children: ReactNode }) {
  const { data: session } = useSession();
  if (session?.user?.role !== role) return null;
  return <>{children}</>;
}

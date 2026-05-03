import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MrQ Live",
  description: "MrQ Live Activation",
};

// Phase 1 shell. Participant chrome (offline handling, mobile layout) added in Phase 5.
export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

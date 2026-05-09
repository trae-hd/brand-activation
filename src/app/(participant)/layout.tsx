import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MrQ Live",
  description: "MrQ Live Activation",
};

// Phase 1 shell. Participant chrome (offline handling, mobile layout) added in Phase 5.
//
// `overflow-x-hidden` is a defensive guard: every participant <main> is
// `mx-auto max-w-sm` and meant to fit any phone width. If a single rogue
// child (long unbroken activation name, a URL pasted into terms or success
// copy, a wide image, etc.) ever exceeds the viewport, this clips the
// horizontal scroll rather than letting the whole page slide right.
export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return <div className="overflow-x-hidden">{children}</div>;
}

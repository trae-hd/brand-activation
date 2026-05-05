import type { Metadata } from "next";
import { ParticipantGate } from "../_components/ParticipantGate";

export const metadata: Metadata = {
  title: "MrQ Live",
  robots: { index: false, follow: false },
};

// Internal target for the participant-host root rewrite. The proxy rewrites
// `live.hqmops.com/` → `/welcome`, so the URL bar still shows `/`.
// Direct visits to `/welcome` are harmless — they show the same gate.
export default function ParticipantRootPage() {
  return <ParticipantGate variant="root" />;
}

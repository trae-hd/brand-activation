import { ParticipantGate } from "../_components/ParticipantGate";

// Renders when [activationSlug]/page.tsx (or its children) call `notFound()` —
// i.e. when a participant arrives at a slug that doesn't exist or isn't visible.
export default function ActivationNotFound() {
  return <ParticipantGate variant="not-found" />;
}

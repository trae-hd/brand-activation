import type { ActivationStatus } from "@prisma/client";

// Per §9.5 transition matrix — single source of truth for client and server.
export const PHRASE_GATES: Partial<Record<string, string>> = {
  "SCHEDULED→DRAFT": "EDIT LOCKED ACTIVATION",
  "LIVE→SCHEDULED": "ROLLBACK ENDED",
  "ENDED→LIVE": "ROLLBACK ENDED",
  "ENDED→SCHEDULED": "ROLLBACK ENDED",
};

export const ALLOWED_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["LIVE", "DRAFT"],
  LIVE: ["ENDED", "SCHEDULED"],
  ENDED: ["LIVE", "SCHEDULED"],
};

export const TRANSITION_LABELS: Record<string, string> = {
  "DRAFT→SCHEDULED": "Schedule activation",
  "SCHEDULED→LIVE": "Go LIVE",
  "LIVE→ENDED": "End activation",
  "SCHEDULED→DRAFT": "Revert to draft",
  "LIVE→SCHEDULED": "Roll back to scheduled",
  "ENDED→LIVE": "Roll back to LIVE",
  "ENDED→SCHEDULED": "Roll back to scheduled",
};

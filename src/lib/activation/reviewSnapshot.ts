import type { Prisma } from "@prisma/client";
import { AUDITED_CONTENT_FIELDS } from "./auditedFields";

export function buildReviewSnapshot(activation: Record<string, unknown>): Prisma.InputJsonValue {
  const snapshot: Record<string, unknown> = {};
  for (const field of AUDITED_CONTENT_FIELDS) {
    snapshot[field] = activation[field] ?? null;
  }
  return snapshot as Prisma.InputJsonValue;
}

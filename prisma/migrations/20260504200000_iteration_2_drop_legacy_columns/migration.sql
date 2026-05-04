-- Phase 6: Drop legacy legalApproved* columns from Activation.
-- These columns were kept through Phases 1-5 for the expand→migrate→contract rollout.
-- Application code has read/written reviewStatus since Phase 2; these columns are now dead.

ALTER TABLE "Activation"
  DROP COLUMN IF EXISTS "legalApproved",
  DROP COLUMN IF EXISTS "legalApprovedAt",
  DROP COLUMN IF EXISTS "legalApprovedById",
  DROP COLUMN IF EXISTS "legalApprovalNotes";

-- The FK constraint referencing AdminUser is implicitly dropped with the column.
-- Prisma's relation "LegalApprover" is removed from the schema in this same phase.

-- CreateEnum
CREATE TYPE "ActivationReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'DRAFT_EDITED');

-- AlterTable
ALTER TABLE "Activation" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" "ActivationReviewStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "successContent" JSONB,
ADD COLUMN     "successCtaLabel" TEXT,
ADD COLUMN     "successCtaUrl" TEXT,
ADD COLUMN     "successHeading" TEXT,
ADD COLUMN     "successHeroImageUrl" TEXT,
ADD COLUMN     "successShowEntryCode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "successShowResend" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "successSponsorContent" JSONB,
ADD COLUMN     "successSubheading" TEXT;

-- CreateIndex
CREATE INDEX "Activation_reviewStatus_createdById_idx" ON "Activation"("reviewStatus", "createdById");

-- AddForeignKey
ALTER TABLE "Activation" ADD CONSTRAINT "Activation_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activation" ADD CONSTRAINT "Activation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: set reviewStatus = APPROVED for legitimately-approved activations (non-self-approved).
-- Uses legalApprovedById (not the newly-NULL approvedById) to distinguish the two cases.
UPDATE "Activation"
   SET "reviewStatus"  = 'APPROVED',
       "approvedAt"    = "legalApprovedAt",
       "approvedById"  = "legalApprovedById",
       "reviewNotes"   = "legalApprovalNotes"
 WHERE "legalApproved" = true
   AND "legalApprovedById" IS NOT NULL
   AND "legalApprovedById" <> "createdById";

-- Backfill: audit-log any rows where the creator self-approved under V5 before demoting them.
INSERT INTO "AuditLog" (id, category, action, "actorId", "targetType", "targetId", metadata, "createdAt")
SELECT
  gen_random_uuid()::text,
  'ADMIN',
  'activation.review.backfill.self_approved_demoted',
  "createdById",
  'Activation',
  id,
  jsonb_build_object(
    'reason', 'V5 allowed self-approval; Iteration 2 enforces two-pair-eyes',
    'previousLegalApprovedAt', "legalApprovedAt",
    'previousLegalApprovedById', "legalApprovedById"
  ),
  NOW()
FROM "Activation"
WHERE "legalApproved" = true
  AND "legalApprovedById" = "createdById";

-- Backfill: demote self-approved rows to DRAFT and clear approvedById so the CHECK
-- constraint below is not violated (approvedById must be NULL or differ from createdById).
UPDATE "Activation"
   SET "reviewStatus" = 'DRAFT',
       "approvedById" = NULL,
       "approvedAt"   = NULL
 WHERE "legalApproved" = true
   AND "legalApprovedById" = "createdById";

-- AddConstraint: defence-in-depth guard against self-approval at the DB layer.
-- The tRPC mutation throws FORBIDDEN first; this catches raw SQL / future microservices.
-- Must run after the backfill above to avoid constraint violations on existing data.
ALTER TABLE "Activation"
  ADD CONSTRAINT activation_no_self_approval
  CHECK ("approvedById" IS NULL OR "approvedById" <> "createdById");

-- Replace freeform successHeroImageUrl / successSponsorContent with structured sponsor block fields.

ALTER TABLE "Activation"
  DROP COLUMN IF EXISTS "successHeroImageUrl",
  DROP COLUMN IF EXISTS "successSponsorContent",
  ADD COLUMN "successSponsorLogoUrl"  TEXT,
  ADD COLUMN "successSponsorHeadline" TEXT,
  ADD COLUMN "successSponsorBody"     TEXT,
  ADD COLUMN "successSponsorCtaLabel" TEXT,
  ADD COLUMN "successSponsorCtaUrl"   TEXT;

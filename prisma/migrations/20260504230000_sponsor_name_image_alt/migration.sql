-- Add sponsor name (rendered in "Brought to you by [name]" divider),
-- and alt text for the registration hero image and the sponsor logo.

ALTER TABLE "Activation"
  ADD COLUMN "successSponsorName"   TEXT,
  ADD COLUMN "heroImageAlt"         TEXT,
  ADD COLUMN "successSponsorLogoAlt" TEXT;

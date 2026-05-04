-- Add consentItems JSON array and ctaText string to Activation
ALTER TABLE "Activation" ADD COLUMN "consentItems" JSONB;
ALTER TABLE "Activation" ADD COLUMN "ctaText" TEXT;

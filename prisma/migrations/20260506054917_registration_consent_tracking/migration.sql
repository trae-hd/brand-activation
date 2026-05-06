-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "consentItemsAccepted" JSONB,
ADD COLUMN     "mrqContactConsent" BOOLEAN NOT NULL DEFAULT false;

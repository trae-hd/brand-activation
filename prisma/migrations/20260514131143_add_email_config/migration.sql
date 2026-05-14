-- AlterTable
ALTER TABLE "Activation" ADD COLUMN     "emailBodyCopy" TEXT,
ADD COLUMN     "emailFooter" TEXT,
ADD COLUMN     "emailHeading" TEXT,
ADD COLUMN     "emailShowEndDate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailShowEntryCode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailShowTerms" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "MrqAccountStatus" AS ENUM ('UNKNOWN', 'ACTIVE', 'INACTIVE', 'NOT_FOUND');

ALTER TABLE "Registration"
  ADD COLUMN "mrqAccountStatus" "MrqAccountStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "mrqLastLoginAt"   TIMESTAMP(3),
  ADD COLUMN "mrqEnrichedAt"    TIMESTAMP(3);

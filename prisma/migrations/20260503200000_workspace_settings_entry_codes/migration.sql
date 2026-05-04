-- CreateTable: WorkspaceSettings (singleton — one row, fixed id = 'workspace')
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'workspace',
    "workspaceName" TEXT NOT NULL DEFAULT 'MrQ Live',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "otpTtlMin" INTEGER NOT NULL DEFAULT 10,
    "geofence" TEXT,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 180,
    "require2fa" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutHours" INTEGER NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmailSuppression
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: EmailSuppression unique emailHash
CREATE UNIQUE INDEX "EmailSuppression_emailHash_key" ON "EmailSuppression"("emailHash");

-- AlterTable: Activation — add timezone and entryCodePrefix
ALTER TABLE "Activation" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/London';
ALTER TABLE "Activation" ADD COLUMN "entryCodePrefix" TEXT;

-- AlterTable: Registration — add entryCode
ALTER TABLE "Registration" ADD COLUMN "entryCode" TEXT;

-- CreateIndex: Registration entryCode unique per activation (NULLs are excluded from uniqueness in Postgres)
CREATE UNIQUE INDEX "Registration_activationId_entryCode_key" ON "Registration"("activationId", "entryCode");

-- AddForeignKey: WorkspaceSettings → AdminUser
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

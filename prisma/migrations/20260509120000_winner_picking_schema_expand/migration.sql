-- ─────────────────────────────────────────────────────────────────────────────
-- Winner Picking — Phase 1: Schema, extension, types
--
-- Purely additive. Adds pgcrypto extension, two enums, three tables,
-- one column on Registration, FK relationships, indexes, unique constraints.
-- No data transformation. No drops. No alters on existing rows.
--
-- Spec: src/resource/MRQ_LIVE_ACTIVATION_WINNER_PICKING_PROMPT.md
-- ─────────────────────────────────────────────────────────────────────────────

-- pgcrypto provides the digest() function used by Phase 2's deterministic
-- shuffle (ORDER BY encode(digest(seed||':'||drawId||':'||id, 'sha256'), 'hex')).
-- Idempotent: safe to run on databases that already have it.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('WINNER', 'RESERVE');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('SELECTED', 'DISQUALIFIED', 'NOTIFIED', 'DECLINED', 'CONFIRMED');

-- AlterTable: add `excluded` flag to Registration. Defaults to false so all
-- existing rows are eligible for future winner draws unless an admin flips
-- the flag manually.
ALTER TABLE "Registration" ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WinnerDraw — one row per draw event.
CREATE TABLE "WinnerDraw" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "drawnById" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eligibilityCutoffAt" TIMESTAMP(3) NOT NULL,
    "winnerCount" INTEGER NOT NULL,
    "reserveCount" INTEGER NOT NULL,
    "mrqAccountOnly" BOOLEAN NOT NULL DEFAULT false,
    "eligiblePoolSize" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1:sha256-postgres-orderby',
    "notes" TEXT,

    CONSTRAINT "WinnerDraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WinnerDrawSelection — one row per (draw, registration) selection.
-- registrationId is nullable so participant erasure can null it (onDelete: SetNull
-- on the FK) without breaking the audit trail.
CREATE TABLE "WinnerDrawSelection" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "registrationId" TEXT,
    "activationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "SelectionType" NOT NULL,
    "status" "SelectionStatus" NOT NULL DEFAULT 'SELECTED',
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifiedById" TEXT,
    "disqualifiedReason" TEXT,
    "promotedFromReserveAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "notifiedById" TEXT,
    "notificationNotes" TEXT,
    "notesUpdatedAt" TIMESTAMP(3),
    "notesUpdatedById" TEXT,

    CONSTRAINT "WinnerDrawSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WinnerDrawPoolEntry — snapshot of the eligible pool IDs at draw time.
-- Composite primary key (drawId, position) means each draw has a 1..N positional
-- snapshot. registrationId nullable for the same erasure reason as Selection.
CREATE TABLE "WinnerDrawPoolEntry" (
    "drawId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "registrationId" TEXT,

    CONSTRAINT "WinnerDrawPoolEntry_pkey" PRIMARY KEY ("drawId","position")
);

-- CreateIndex: WinnerDraw lookups by activation, ordered by drawn time
CREATE INDEX "WinnerDraw_activationId_drawnAt_idx" ON "WinnerDraw"("activationId", "drawnAt");

-- CreateIndex: WinnerDrawSelection — one selection per (draw, registration)
CREATE UNIQUE INDEX "WinnerDrawSelection_drawId_registrationId_key" ON "WinnerDrawSelection"("drawId", "registrationId");

-- CreateIndex: WinnerDrawSelection — one selection per registration ACROSS ALL DRAWS for an activation
-- (this is the load-bearing constraint that prevents redrawing already-selected/disqualified people)
CREATE UNIQUE INDEX "WinnerDrawSelection_activationId_registrationId_key" ON "WinnerDrawSelection"("activationId", "registrationId");

-- CreateIndex: faster lookup of winners-vs-reserves within a draw
CREATE INDEX "WinnerDrawSelection_drawId_type_idx" ON "WinnerDrawSelection"("drawId", "type");

-- CreateIndex: faster ordered iteration of selections within a draw
CREATE INDEX "WinnerDrawSelection_drawId_position_idx" ON "WinnerDrawSelection"("drawId", "position");

-- AddForeignKey: WinnerDraw → Activation (Restrict — never auto-delete a draw when an activation goes; archive instead)
ALTER TABLE "WinnerDraw" ADD CONSTRAINT "WinnerDraw_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "Activation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WinnerDraw → AdminUser (Restrict — never auto-delete a draw when an admin user goes; the audit ID stays)
ALTER TABLE "WinnerDraw" ADD CONSTRAINT "WinnerDraw_drawnById_fkey" FOREIGN KEY ("drawnById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → WinnerDraw (Cascade — deleting a draw cleans up its selections and pool entries)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "WinnerDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → Registration (SetNull — participant erasure preserves the audit row)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → Activation (Cascade — denormalised for the cross-draw uniqueness constraint;
-- if an activation is hard-deleted, its selections go too. Activations are normally archived, not deleted.)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "Activation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → AdminUser (disqualifiedBy — SetNull, audit metadata loses the link if the admin is gone but the action remains recorded)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_disqualifiedById_fkey" FOREIGN KEY ("disqualifiedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → AdminUser (notifiedBy — SetNull)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_notifiedById_fkey" FOREIGN KEY ("notifiedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawSelection → AdminUser (notesUpdatedBy — SetNull)
ALTER TABLE "WinnerDrawSelection" ADD CONSTRAINT "WinnerDrawSelection_notesUpdatedById_fkey" FOREIGN KEY ("notesUpdatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawPoolEntry → WinnerDraw (Cascade)
ALTER TABLE "WinnerDrawPoolEntry" ADD CONSTRAINT "WinnerDrawPoolEntry_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "WinnerDraw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WinnerDrawPoolEntry → Registration (SetNull — preserve the position even when the participant is erased)
ALTER TABLE "WinnerDrawPoolEntry" ADD CONSTRAINT "WinnerDrawPoolEntry_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

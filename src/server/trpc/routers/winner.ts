import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";

import { router } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/**
 * Compose the eligibility WHERE clause for the registration pool.
 *
 * Used by `previewEligiblePool` (count) and the SQL shuffle in `pickWinners`.
 * Five floors apply unconditionally; the MrQ-account filter is optional.
 *
 * Spec: §1.2 of MRQ_LIVE_ACTIVATION_WINNER_PICKING_PROMPT.md
 *
 * INVARIANT-001 (see src/resource/INVARIANTS.md): this filter and the raw
 * SQL `WHERE` clauses inside `pickWinners` (pool-snapshot INSERT + shuffle
 * SELECT, both in this file) must stay equivalent. If you change one, change
 * all three. The doc explains why they're duplicated and what breaks on drift.
 */
function eligibilityWhere({
  activationId,
  cutoff,
  mrqAccountOnly,
}: {
  activationId: string;
  cutoff: Date;
  mrqAccountOnly: boolean;
}): Prisma.RegistrationWhereInput {
  return {
    activationId,
    status: "VERIFIED",
    mrqContactConsent: true,
    excluded: false,
    verifiedAt: { lte: cutoff },
    ...(mrqAccountOnly ? { mrqAccountStatus: "ACTIVE" as const } : {}),
    // Exclude any registration already on a draw for this activation —
    // including disqualified ones (compliance: prevents redrawing until a
    // preferred outcome).
    NOT: {
      winnerSelections: {
        some: { activationId },
      },
    },
  };
}

/** Resolve the eligibility cutoff. ENDED activations default to endsAt; LIVE to now. */
function resolveCutoff(
  activation: { status: string; endsAt: Date },
  override: Date | undefined,
): Date {
  if (override) return override;
  if (activation.status === "ENDED") return activation.endsAt;
  return new Date();
}

/**
 * Shape of one row returned by the deterministic Postgres-side shuffle.
 * `pos` is 1-based; positions 1..winnerCount become WINNERs, the rest RESERVEs.
 */
interface ShuffledRow {
  id: string;
  pos: number | bigint;
}

export const winnerRouter = router({
  /**
   * Live preview of the eligible pool size — used by the Pick Winners modal
   * before the user commits. ADMIN + MEMBER (read-only).
   */
  previewEligiblePool: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        mrqAccountOnly: z.boolean().default(false),
        eligibilityCutoffAt: z.coerce.date().optional(),
      }),
    )
    .query(
      async ({
        input,
      }): Promise<{ eligiblePoolSize: number; eligibilityCutoffAt: Date }> => {
        const activation = await prisma.activation.findUnique({
          where: { id: input.activationId },
          select: { id: true, status: true, endsAt: true },
        });
        if (!activation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activation not found.",
          });
        }
        const cutoff = resolveCutoff(activation, input.eligibilityCutoffAt);
        const eligiblePoolSize = await prisma.registration.count({
          where: eligibilityWhere({
            activationId: input.activationId,
            cutoff,
            mrqAccountOnly: input.mrqAccountOnly,
          }),
        });
        return { eligiblePoolSize, eligibilityCutoffAt: cutoff };
      },
    ),

  /**
   * List all draws (with selections) for an activation — used by the
   * Winners section in Phase 5. ADMIN + MEMBER. Most recent first.
   *
   * The selection rows include the joined `registration` so the UI can
   * render emails (revealable) + entry codes inline. The `registration`
   * field is null for selections whose participant has been erased; the
   * UI should render those as "[erased]" or similar, with the position
   * preserved.
   */
  listForActivation: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .query(async ({ input }) => {
      return prisma.winnerDraw.findMany({
        where: { activationId: input.activationId },
        orderBy: { drawnAt: "desc" },
        include: {
          drawnBy: { select: { id: true, name: true, email: true } },
          selections: {
            orderBy: { position: "asc" },
            include: {
              registration: {
                select: {
                  id: true,
                  email: true,
                  emailHash: true,
                  entryCode: true,
                  mrqAccountStatus: true,
                },
              },
              disqualifiedBy: { select: { id: true, name: true, email: true } },
              notifiedBy: { select: { id: true, name: true, email: true } },
              notesUpdatedBy: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    }),

  /**
   * Create a new winner draw. ADMIN-only.
   *
   * Algorithm (§1.3):
   *   1. Generate a 32-byte cryptographic seed
   *   2. Compute eligible pool size — reject if winnerCount + reserveCount > pool
   *   3. In a transaction:
   *      a. Insert the WinnerDraw row
   *      b. Snapshot the eligible pool to WinnerDrawPoolEntry (positional, by id ASC)
   *      c. Run the deterministic shuffle (sha256 over seed:drawId:registrationId)
   *      d. Insert the resulting selections (winners 1..N, reserves N+1..N+M)
   *      e. Write the audit log row
   *   4. Return the drawId + a small summary (seed is NEVER returned to client)
   *
   * The cross-draw exclusion (`@@unique([activationId, registrationId])` on
   * Selection plus the explicit `NOT IN (SELECT ...)` clause in the shuffle)
   * means a registration can only appear in ONE draw on a given activation.
   * Disqualification does not free that slot for re-selection.
   */
  pickWinners: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        winnerCount: z.number().int().min(1).max(1000),
        reserveCount: z.number().int().min(0).max(1000),
        mrqAccountOnly: z.boolean().default(false),
        eligibilityCutoffAt: z.coerce.date().optional(),
        // Phrase gate — must be the literal "DRAW" to confirm the action.
        phrase: z.literal("DRAW"),
      }),
    )
    .mutation(
      async ({
        input,
        ctx,
      }): Promise<{
        drawId: string;
        winnerCount: number;
        reserveCount: number;
        eligiblePoolSize: number;
        drawnAt: Date;
      }> => {
        const actorId = ctx.adminUser.id;

        // ── Activation existence + status gate ────────────────────────
        const activation = await prisma.activation.findUnique({
          where: { id: input.activationId },
          select: { id: true, status: true, endsAt: true },
        });
        if (!activation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Activation not found.",
          });
        }
        if (activation.status !== "LIVE" && activation.status !== "ENDED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Winner picking is only available on LIVE or ENDED activations.",
          });
        }

        // ── Slot count validation ─────────────────────────────────────
        const totalSlots = input.winnerCount + input.reserveCount;
        if (totalSlots <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Must request at least one winner.",
          });
        }

        // ── Resolve cutoff + pool size ────────────────────────────────
        const cutoff = resolveCutoff(activation, input.eligibilityCutoffAt);
        const eligiblePoolSize = await prisma.registration.count({
          where: eligibilityWhere({
            activationId: input.activationId,
            cutoff,
            mrqAccountOnly: input.mrqAccountOnly,
          }),
        });

        if (totalSlots > eligiblePoolSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot pick ${totalSlots} (${input.winnerCount} winners + ${input.reserveCount} reserves) from a pool of ${eligiblePoolSize}.`,
          });
        }

        // ── Generate seed (32 bytes hex). Stored on the row, never returned to client.
        const seed = randomBytes(32).toString("hex");

        // ── Conditional MrQ-account SQL fragment ──────────────────────
        const mrqClause = input.mrqAccountOnly
          ? Prisma.sql`AND r."mrqAccountStatus" = 'ACTIVE'`
          : Prisma.empty;

        // ── Transaction: draw row → pool snapshot → shuffle → selections → audit
        const drawId = await prisma.$transaction(async (tx) => {
          // 1. Create the WinnerDraw row.
          const draw = await tx.winnerDraw.create({
            data: {
              activationId: input.activationId,
              drawnById: actorId,
              eligibilityCutoffAt: cutoff,
              winnerCount: input.winnerCount,
              reserveCount: input.reserveCount,
              mrqAccountOnly: input.mrqAccountOnly,
              eligiblePoolSize,
              seed,
            },
            select: { id: true },
          });

          // 2. Snapshot the eligible pool's IDs (ordered by id ASC), positional.
          // Composite PK on (drawId, position) — no `id` column, no cuid issue.
          await tx.$executeRaw`
            INSERT INTO "WinnerDrawPoolEntry" ("drawId", "position", "registrationId")
            SELECT
              ${draw.id},
              row_number() OVER (ORDER BY r.id ASC),
              r.id
            FROM "Registration" r
            WHERE r."activationId" = ${input.activationId}
              AND r."status" = 'VERIFIED'
              AND r."mrqContactConsent" = TRUE
              AND r."excluded" = FALSE
              AND r."verifiedAt" <= ${cutoff}
              ${mrqClause}
              AND r.id NOT IN (
                SELECT s."registrationId"
                FROM "WinnerDrawSelection" s
                WHERE s."activationId" = ${input.activationId}
                  AND s."registrationId" IS NOT NULL
              )
          `;

          // 3. Run the deterministic shuffle and capture the ordered IDs.
          //    Two-step approach: SELECT the winners-and-reserves in order
          //    via Postgres, then createMany to insert with Prisma-generated
          //    cuids. Keeps the shuffle server-side (no JS-memory load) but
          //    uses standard Prisma ID generation (no custom SQL ID handling).
          const shuffled = await tx.$queryRaw<ShuffledRow[]>`
            SELECT
              r.id,
              row_number() OVER (
                ORDER BY encode(digest(${seed} || ':' || ${draw.id} || ':' || r.id::text, 'sha256'), 'hex')
              ) AS pos
            FROM "Registration" r
            WHERE r."activationId" = ${input.activationId}
              AND r."status" = 'VERIFIED'
              AND r."mrqContactConsent" = TRUE
              AND r."excluded" = FALSE
              AND r."verifiedAt" <= ${cutoff}
              ${mrqClause}
              AND r.id NOT IN (
                SELECT s."registrationId"
                FROM "WinnerDrawSelection" s
                WHERE s."activationId" = ${input.activationId}
                  AND s."registrationId" IS NOT NULL
              )
            ORDER BY encode(digest(${seed} || ':' || ${draw.id} || ':' || r.id::text, 'sha256'), 'hex')
            LIMIT ${totalSlots}
          `;

          // 4. Insert the selections via createMany (Prisma generates the cuid ids).
          await tx.winnerDrawSelection.createMany({
            data: shuffled.map((row) => {
              const position = Number(row.pos);
              return {
                drawId: draw.id,
                registrationId: row.id,
                activationId: input.activationId,
                position,
                type: position <= input.winnerCount ? "WINNER" : "RESERVE",
                // status defaults to SELECTED via the schema default
              };
            }),
          });

          // 5. Audit log — single row capturing the action + parameters.
          //    Seed is NOT in metadata — it's on the WinnerDraw row itself,
          //    queryable by anyone with audit-trail access via a join.
          await writeAuditLog({
            category: "ADMIN",
            action: "winner.draw.created",
            actorId,
            targetType: "WinnerDraw",
            targetId: draw.id,
            metadata: {
              activationId: input.activationId,
              winnerCount: input.winnerCount,
              reserveCount: input.reserveCount,
              mrqAccountOnly: input.mrqAccountOnly,
              eligiblePoolSize,
              eligibilityCutoffAt: cutoff.toISOString(),
            },
            tx,
          });

          return draw.id;
        });

        // Don't return the seed — it's server-side audit material only.
        return {
          drawId,
          winnerCount: input.winnerCount,
          reserveCount: input.reserveCount,
          eligiblePoolSize,
          drawnAt: new Date(),
        };
      },
    ),
});

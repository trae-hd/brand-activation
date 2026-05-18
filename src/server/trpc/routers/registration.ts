import { z } from "zod";
import { router } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type {
  RegistrationStatus,
  MrqAccountStatus,
  SelectionType,
} from "@prisma/client";

interface RegistrationRow {
  id: string;
  email: string;
  emailHash: string;
  status: RegistrationStatus;
  registeredAt: Date;
  verifiedAt: Date | null;
  boothCode: string | null;
  entryCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  ipHash: string;
  mrqAccountStatus: MrqAccountStatus;
  mrqRegisteredAt: Date | null;
  mrqLastLoginAt: Date | null;
  mrqEnrichedAt: Date | null;
  mrqContactConsent: boolean;
  consentItemsAccepted: unknown;
  /** Admin-set flag excluding this registration from future winner draws.
   *  Surfaces as a 🚫 indicator on the registrations table per §1.6.D. */
  excluded: boolean;
  /** Admin-set flag marking this row as a test entry. Test rows are filtered
   *  out of CSV exports, the winner-picker pool, and all dashboard counters. */
  isTest: boolean;
  /** Most recent non-disqualified winner-draw selection for this registration
   *  (across all draws on this activation), or null if none. Surfaces as a
   *  trophy/star indicator per §1.6.D. The Selection model's @@unique
   *  constraint on (activationId, registrationId) means there is at most one
   *  such row, so "most recent" is unambiguous. */
  winnerSelections: {
    type: SelectionType;
    position: number;
    drawId: string;
  }[];
}

const StatusFilterSchema = z
  .enum(["ALL", "VERIFIED", "PENDING", "EXPIRED"])
  .default("ALL");

export const registrationRouter = router({
  liveCount: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .query(async ({ input }): Promise<{ verified: number; pending: number }> => {
      const [verified, pending] = await Promise.all([
        prisma.registration.count({
          where: { activationId: input.activationId, status: "VERIFIED", isTest: false },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, status: "PENDING", isTest: false },
        }),
      ]);
      return { verified, pending };
    }),

  dashboardStats: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .query(async ({ input }) => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);
      const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60_000);

      const [
        verified,
        pending,
        scans,
        recentVerified,
        verifyTimes,
        recentVerifications,
        boothBreakdown,
        utmSourceBreakdown,
        testCount,
      ] = await Promise.all([
        prisma.registration.count({
          where: { activationId: input.activationId, status: "VERIFIED", isTest: false },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, status: "PENDING", isTest: false },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, boothCode: { not: null }, isTest: false },
        }),
        prisma.registration.count({
          where: {
            activationId: input.activationId,
            status: "VERIFIED",
            isTest: false,
            verifiedAt: { gte: fiveMinutesAgo },
          },
        }),
        prisma.registration.findMany({
          where: {
            activationId: input.activationId,
            status: "VERIFIED",
            isTest: false,
            verifiedAt: { not: null },
          },
          select: { registeredAt: true, verifiedAt: true },
          take: 200,
          orderBy: { verifiedAt: "desc" },
        }),
        prisma.registration.findMany({
          where: {
            activationId: input.activationId,
            status: "VERIFIED",
            isTest: false,
            verifiedAt: { gte: sixtyMinutesAgo },
          },
          select: { verifiedAt: true },
          orderBy: { verifiedAt: "asc" },
        }),
        prisma.registration.groupBy({
          by: ["boothCode"],
          where: { activationId: input.activationId, boothCode: { not: null }, isTest: false },
          _count: { _all: true },
        }),
        prisma.registration.groupBy({
          by: ["utmSource"],
          where: { activationId: input.activationId, status: "VERIFIED", isTest: false },
          _count: { _all: true },
          orderBy: { _count: { utmSource: "desc" } },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, isTest: true },
        }),
      ]);

      const avgVerifySeconds =
        verifyTimes.length > 0
          ? Math.round(
              verifyTimes.reduce(
                (sum, r) => sum + (r.verifiedAt!.getTime() - r.registeredAt.getTime()) / 1000,
                0
              ) / verifyTimes.length
            )
          : null;

      const dropOffPct =
        scans > 0 ? Math.round(((scans - verified) / scans) * 100) : null;

      const sparkline = Array.from({ length: 60 }, (_, i) => ({
        label: new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/London",
          hour12: false,
        }).format(new Date(now.getTime() - (59 - i) * 60_000)),
        count: 0,
      }));
      for (const r of recentVerifications) {
        if (!r.verifiedAt) continue;
        const minsAgo = Math.floor((now.getTime() - r.verifiedAt.getTime()) / 60_000);
        const idx = 59 - minsAgo;
        if (idx >= 0 && idx < 60) sparkline[idx].count++;
      }

      const booths = boothBreakdown
        .filter((b): b is typeof b & { boothCode: string } => b.boothCode !== null)
        .map((b) => ({ code: b.boothCode, count: b._count._all }))
        .sort((a, b) => b.count - a.count);

      const utmBreakdown = utmSourceBreakdown
        .map((r) => ({ source: r.utmSource, count: r._count._all }))
        .sort((a, b) => b.count - a.count);

      return {
        verified,
        pending,
        scans,
        recentVerified,
        avgVerifySeconds,
        dropOffPct,
        boothCount: booths.length,
        sparkline,
        booths,
        utmBreakdown,
        // Count of rows flagged as test by an admin. All other counters in
        // this payload exclude them; we surface the total so the dashboard
        // can disclose that exclusion to viewers.
        testCount,
      };
    }),

  list: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        status: StatusFilterSchema,
        mrqContactConsent: z.boolean().optional(),
        /** When `true`, return only admin-flagged test rows. When omitted,
         *  the filter is off — both real and test rows are returned. There
         *  is no `false` case in v1: hiding tests entirely is the job of the
         *  dashboard / CSV / winner-picker, not the table. */
        isTest: z.boolean().optional(),
        // Substring match against the entryCode column. Client passes whatever
        // the user typed (typically the suffix after the activation prefix —
        // the prefix is rendered as a non-editable affix in the search input);
        // server matches anywhere in the full code so both "ABC123" and
        // "WC-ABC123" find WC-ABC123.
        entryCodeQuery: z.string().max(64).optional(),
      })
    )
    .query(
      async ({
        input,
      }): Promise<{
        items: RegistrationRow[];
        total: number;
        /** Subset of `total` that are admin-flagged test rows. Surfaced so
         *  the table header can split the count ("108 · 2 tests") and stay
         *  consistent with the dashboard / CSV / winner-picker, all of
         *  which exclude tests. */
        testCount: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }> => {
        const statusWhere =
          input.status === "ALL" ? {} : { status: input.status as RegistrationStatus };
        const consentWhere =
          input.mrqContactConsent !== undefined
            ? { mrqContactConsent: input.mrqContactConsent }
            : {};
        const entryCodeWhere =
          input.entryCodeQuery && input.entryCodeQuery.trim().length > 0
            ? { entryCode: { contains: input.entryCodeQuery.trim(), mode: "insensitive" as const } }
            : {};
        const testWhere = input.isTest === true ? { isTest: true } : {};

        const where = {
          activationId: input.activationId,
          ...statusWhere,
          ...consentWhere,
          ...entryCodeWhere,
          ...testWhere,
        };

        const [rows, total, testCount] = await Promise.all([
          prisma.registration.findMany({
            where,
            orderBy: { registeredAt: "desc" },
            take: input.pageSize,
            skip: (input.page - 1) * input.pageSize,
            select: {
              id: true,
              email: true,
              emailHash: true,
              status: true,
              registeredAt: true,
              verifiedAt: true,
              boothCode: true,
              entryCode: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              ipHash: true,
              mrqAccountStatus: true,
              mrqRegisteredAt: true,
              mrqLastLoginAt: true,
              mrqEnrichedAt: true,
              mrqContactConsent: true,
              consentItemsAccepted: true,
              excluded: true,
              isTest: true,
              // Most recent non-disqualified winner selection for this row.
              // The @@unique([activationId, registrationId]) constraint means
              // at most one such row exists per activation; we still take(1)
              // defensively in case future schema changes loosen that
              // constraint. Used to render the 🏆 trophy indicator on the
              // registrations table.
              winnerSelections: {
                where: { status: { not: "DISQUALIFIED" } },
                select: {
                  type: true,
                  position: true,
                  drawId: true,
                },
                take: 1,
              },
            },
          }),
          prisma.registration.count({ where }),
          // Count of test rows within the *currently-filtered* set, so the
          // header reflects what the user is actually looking at (e.g.
          // "Verified · 87 · 2 tests" when the Verified pill is active).
          prisma.registration.count({ where: { ...where, isTest: true } }),
        ]);

        return {
          items: rows,
          total,
          testCount,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
        };
      }
    ),

  enrich: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ enriched: number }> => {
      const actorId = ctx.session.user.adminUserId ?? null;

      const verified = await prisma.registration.findMany({
        where: { activationId: input.activationId, status: "VERIFIED" },
        select: { id: true },
      });

      // TODO: replace with real MRQ account API call (hash email → lookup → update status + mrqLastLoginAt).
      // Until then, only stamp mrqEnrichedAt so the UI reflects the check was requested.
      await prisma.registration.updateMany({
        where: { activationId: input.activationId, status: "VERIFIED" },
        data: { mrqEnrichedAt: new Date() },
      });

      await writeAuditLog({
        category: "ADMIN",
        action: "registration.mrq_enrich_requested",
        actorId,
        targetType: "Activation",
        targetId: input.activationId,
        metadata: { count: verified.length, note: "stub — no external API call made" },
      });

      return { enriched: verified.length };
    }),

  revealEmail: memberProcedure
    .input(z.object({ registrationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId ?? null;
      await writeAuditLog({
        category: "ADMIN",
        action: "EMAIL_REVEAL",
        actorId,
        targetType: "Registration",
        targetId: input.registrationId,
        metadata: { reason: "admin-reveal" },
      });
      return { ok: true as const };
    }),

  toggleTest: adminProcedure
    .input(
      z.object({
        registrationId: z.string().min(1),
        isTest: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId ?? null;
      const updated = await prisma.registration.update({
        where: { id: input.registrationId },
        data: { isTest: input.isTest },
        select: { id: true, activationId: true, emailHash: true, isTest: true },
      });
      await writeAuditLog({
        category: "ADMIN",
        action: input.isTest ? "registration.test_flagged" : "registration.test_unflagged",
        actorId,
        targetType: "Registration",
        targetId: updated.id,
        metadata: { activationId: updated.activationId, emailHash: updated.emailHash },
      });
      return { id: updated.id, isTest: updated.isTest };
    }),

  revealAllEmails: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId ?? null;
      // Single batch audit entry rather than one row per registration —
      // mass-reveal is a coarser action than per-row reveal and the audit
      // record reflects that. The activationId target lets reviewers see
      // exactly which dataset was unmasked, in one row.
      const count = await prisma.registration.count({
        where: { activationId: input.activationId },
      });
      await writeAuditLog({
        category: "ADMIN",
        action: "EMAIL_REVEAL_BULK",
        actorId,
        targetType: "Activation",
        targetId: input.activationId,
        metadata: { reason: "admin-reveal-all", count },
      });
      return { ok: true as const, count };
    }),
});

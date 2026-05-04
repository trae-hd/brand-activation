import { z } from "zod";
import { router } from "../init";
import { memberProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type { RegistrationStatus, MrqAccountStatus } from "@prisma/client";

interface RegistrationRow {
  id: string;
  email: string;
  emailHash: string;
  status: RegistrationStatus;
  registeredAt: Date;
  verifiedAt: Date | null;
  boothCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  ipHash: string;
  mrqAccountStatus: MrqAccountStatus;
  mrqRegisteredAt: Date | null;
  mrqLastLoginAt: Date | null;
  mrqEnrichedAt: Date | null;
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
          where: { activationId: input.activationId, status: "VERIFIED" },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, status: "PENDING" },
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
      ] = await Promise.all([
        prisma.registration.count({
          where: { activationId: input.activationId, status: "VERIFIED" },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, status: "PENDING" },
        }),
        prisma.registration.count({
          where: { activationId: input.activationId, boothCode: { not: null } },
        }),
        prisma.registration.count({
          where: {
            activationId: input.activationId,
            status: "VERIFIED",
            verifiedAt: { gte: fiveMinutesAgo },
          },
        }),
        prisma.registration.findMany({
          where: {
            activationId: input.activationId,
            status: "VERIFIED",
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
            verifiedAt: { gte: sixtyMinutesAgo },
          },
          select: { verifiedAt: true },
          orderBy: { verifiedAt: "asc" },
        }),
        prisma.registration.groupBy({
          by: ["boothCode"],
          where: { activationId: input.activationId, boothCode: { not: null } },
          _count: { _all: true },
        }),
        prisma.registration.groupBy({
          by: ["utmSource"],
          where: { activationId: input.activationId, status: "VERIFIED" },
          _count: { _all: true },
          orderBy: { _count: { utmSource: "desc" } },
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
      };
    }),

  list: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        cursor: z.string().optional(),
        take: z.number().min(1).max(100).default(50),
        status: StatusFilterSchema,
      })
    )
    .query(
      async ({
        input,
      }): Promise<{ items: RegistrationRow[]; nextCursor: string | null; total: number }> => {
        const statusWhere =
          input.status === "ALL" ? {} : { status: input.status as RegistrationStatus };

        const [rows, total] = await Promise.all([
          prisma.registration.findMany({
            where: { activationId: input.activationId, ...statusWhere },
            orderBy: { registeredAt: "desc" },
            take: input.take + 1,
            ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
            select: {
              id: true,
              email: true,
              emailHash: true,
              status: true,
              registeredAt: true,
              verifiedAt: true,
              boothCode: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              ipHash: true,
              mrqAccountStatus: true,
              mrqRegisteredAt: true,
              mrqLastLoginAt: true,
              mrqEnrichedAt: true,
            },
          }),
          prisma.registration.count({
            where: { activationId: input.activationId, ...statusWhere },
          }),
        ]);

        let nextCursor: string | null = null;
        if (rows.length > input.take) {
          const extra = rows.pop();
          nextCursor = extra!.id;
        }

        return { items: rows, nextCursor, total };
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

      // Stamp mrqEnrichedAt so the UI reflects the check was requested.
      // TODO: replace with real MRQ account API call (hash email → lookup → update status + mrqLastLoginAt).
      await prisma.registration.updateMany({
        where: { activationId: input.activationId, status: "VERIFIED" },
        data: { mrqEnrichedAt: new Date() },
      });

      await writeAuditLog({
        category: "ADMIN",
        action: "registration.mrq_enrich",
        actorId,
        targetType: "Activation",
        targetId: input.activationId,
        metadata: { count: verified.length },
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
});

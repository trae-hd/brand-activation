import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../init";
import { adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { renderBoothQrPng } from "@/lib/qr/render";

const BoothCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Z0-9-]+$/, "Booth code must be uppercase letters, numbers, or hyphens.");

export const boothRouter = router({
  list: adminProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .query(async ({ input }) => {
      return prisma.booth.findMany({
        where: { activationId: input.activationId },
        select: { id: true, code: true, label: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
    }),

  add: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        code: BoothCodeSchema,
        label: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }

      try {
        const booth = await prisma.booth.create({
          data: {
            activationId: input.activationId,
            code: input.code,
            label: input.label,
          },
          select: { id: true },
        });

        await writeAuditLog({
          category: "ADMIN",
          action: "booth.added",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          metadata: { boothId: booth.id, code: input.code, label: input.label },
        });

        return { id: booth.id };
      } catch (err) {
        // Prisma P2002: unique constraint violation on (activationId, code).
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A booth with code "${input.code}" already exists for this activation.`,
          });
        }
        throw err;
      }
    }),

  rename: adminProcedure
    .input(
      z.object({
        boothId: z.string().min(1),
        label: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId!;

      const booth = await prisma.booth.findUnique({
        where: { id: input.boothId },
        select: { id: true, activationId: true, code: true },
      });
      if (!booth) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booth not found." });
      }

      await prisma.booth.update({
        where: { id: input.boothId },
        data: { label: input.label },
      });

      await writeAuditLog({
        category: "ADMIN",
        action: "booth.renamed",
        actorId,
        targetType: "Activation",
        targetId: booth.activationId,
        metadata: { boothId: input.boothId, code: booth.code, newLabel: input.label },
      });

      return { ok: true as const };
    }),

  remove: adminProcedure
    .input(z.object({ boothId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const actorId = ctx.session.user.adminUserId!;

      const booth = await prisma.booth.findUnique({
        where: { id: input.boothId },
        select: { id: true, activationId: true, code: true, label: true },
      });
      if (!booth) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booth not found." });
      }

      await prisma.booth.delete({ where: { id: input.boothId } });

      await writeAuditLog({
        category: "ADMIN",
        action: "booth.removed",
        actorId,
        targetType: "Activation",
        targetId: booth.activationId,
        metadata: { boothId: input.boothId, code: booth.code, label: booth.label },
      });

      return { ok: true as const };
    }),

  getQrPng: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        boothCode: z.string().min(1),
      })
    )
    .query(async ({ input }): Promise<{ filename: string; base64: string }> => {
      const booth = await prisma.booth.findUnique({
        where: {
          activationId_code: {
            activationId: input.activationId,
            code: input.boothCode,
          },
        },
        select: {
          code: true,
          activation: { select: { slug: true } },
        },
      });
      if (!booth) throw new TRPCError({ code: "NOT_FOUND" });

      const png = await renderBoothQrPng({
        activationSlug: booth.activation.slug,
        boothCode: booth.code,
      });

      return {
        filename: `${booth.activation.slug}-${booth.code}.png`,
        base64: png.toString("base64"),
      };
    }),
});

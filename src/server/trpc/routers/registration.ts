import { z } from "zod";
import { router } from "../init";
import { memberProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";

interface RegistrationRow {
  id: string;
  email: string;
  registeredAt: Date;
  verifiedAt: Date | null;
  boothCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

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

  list: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        cursor: z.string().optional(),
        take: z.number().min(1).max(100).default(50),
      })
    )
    .query(
      async ({
        input,
      }): Promise<{ items: RegistrationRow[]; nextCursor: string | null }> => {
        const rows = await prisma.registration.findMany({
          where: { activationId: input.activationId, status: "VERIFIED" },
          orderBy: { registeredAt: "desc" },
          take: input.take + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          select: {
            id: true,
            email: true,
            registeredAt: true,
            verifiedAt: true,
            boothCode: true,
            utmSource: true,
            utmMedium: true,
            utmCampaign: true,
          },
        });

        let nextCursor: string | null = null;
        if (rows.length > input.take) {
          const extra = rows.pop();
          nextCursor = extra!.id;
        }

        return { items: rows, nextCursor };
      }
    ),
});

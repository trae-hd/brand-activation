import { z } from "zod";
import { router } from "../init";
import { memberProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import type { AuditCategory } from "@prisma/client";

interface AuditRow {
  id: string;
  category: AuditCategory;
  action: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export const auditRouter = router({
  list: memberProcedure
    .input(
      z.object({
        category: z.enum(["ADMIN", "SECURITY"]).optional(),
        actorId: z.string().optional(),
        targetType: z.string().optional(),
        cursor: z.string().optional(),
        take: z.number().min(1).max(100).default(50),
      })
    )
    .query(
      async ({
        input,
      }): Promise<{ items: AuditRow[]; nextCursor: string | null }> => {
        const rows = await prisma.auditLog.findMany({
          where: {
            ...(input.category ? { category: input.category } : {}),
            ...(input.actorId ? { actorId: input.actorId } : {}),
            ...(input.targetType ? { targetType: input.targetType } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: input.take + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          select: {
            id: true,
            category: true,
            action: true,
            actorId: true,
            targetType: true,
            targetId: true,
            metadata: true,
            createdAt: true,
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

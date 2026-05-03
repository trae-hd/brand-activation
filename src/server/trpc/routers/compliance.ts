import { z } from "zod";
import { router } from "../init";
import { adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { hmac } from "@/lib/crypto/hmac";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const emailSchema = z.string().email().transform((s) => s.toLowerCase());

export const complianceRouter = router({
  dsar: router({
    /** Returns the count and activation names for a given email — read-only preview. */
    preview: adminProcedure
      .input(z.object({ email: emailSchema }))
      .query(async ({ input }) => {
        const rows = await prisma.registration.findMany({
          where: { email: input.email },
          select: { activation: { select: { name: true } } },
        });
        return {
          rowCount: rows.length,
          activationNames: [...new Set(rows.map((r) => r.activation.name))],
        };
      }),
  }),

  erasure: router({
    /** Returns count + activation names — read-only, no side effects. */
    preview: adminProcedure
      .input(z.object({ email: emailSchema }))
      .query(async ({ input }) => {
        const rows = await prisma.registration.findMany({
          where: { email: input.email },
          select: { activation: { select: { name: true } } },
        });
        return {
          rowCount: rows.length,
          activationNames: [...new Set(rows.map((r) => r.activation.name))],
        };
      }),

    /**
     * Fulfil a right-to-erasure request. Typed phrase is validated server-side
     * so dropping the client check cannot bypass the guard. Runs inside a
     * transaction: audit row is written FIRST so a post-deletion audit query
     * proves the action even if the deletion metadata is the only surviving
     * evidence (§14.3).
     */
    fulfil: adminProcedure
      .input(
        z.object({
          email: emailSchema,
          requestRef: z.string().min(1),
          typedPhrase: z.literal("ERASE PARTICIPANT DATA"),
          reason: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const actorId = ctx.session.user.adminUserId!;
        const emailHash = hmac.email(input.email);

        const { rowCount } = await prisma.$transaction(async (tx) => {
          const count = await tx.registration.count({
            where: { email: input.email },
          });

          await writeAuditLog({
            category: "SECURITY",
            action: "erasure.fulfilled",
            actorId,
            metadata: {
              emailHash,
              requestRef: input.requestRef,
              reason: input.reason,
              rowCount: count,
              ...(count === 0 ? { note: "no_rows_matched" } : {}),
            },
            tx,
          });

          await tx.registration.deleteMany({ where: { email: input.email } });

          return { rowCount: count };
        });

        return { rowCount };
      }),
  }),
});

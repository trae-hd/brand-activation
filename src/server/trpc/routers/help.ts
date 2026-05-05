import { z } from "zod";
import { router } from "../init";
import { memberProcedure } from "../procedures";
import { createLinearIssue } from "@/lib/linear/client";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const PRIORITY_MAP = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
} as const satisfies Record<string, 1 | 2 | 3 | 4>;

export const helpRouter = router({
  submitRequest: memberProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(5000),
        priority: z.enum(["urgent", "high", "medium", "low"]),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true; issueUrl: string | null }> => {
      const actorId = ctx.session.user.adminUserId!;
      const actorEmail = ctx.session.user.email ?? "unknown";
      const actorName = ctx.session.user.name ?? actorEmail;

      const teamId = env.LINEAR_TEAM_ID;
      let issueUrl: string | null = null;

      if (env.LINEAR_API_KEY && teamId) {
        const description = [
          input.description,
          "",
          "---",
          `**Submitted by:** ${actorName} (${actorEmail})`,
          `**Priority:** ${input.priority}`,
          `**Source:** MrQ Live admin panel`,
        ].join("\n");

        const result = await createLinearIssue(env.LINEAR_API_KEY, {
          title: `Activation Help Request - ${input.title}`,
          description,
          teamId,
          priority: PRIORITY_MAP[input.priority],
        });
        if (result.ok) issueUrl = result.issueUrl;
      }

      await writeAuditLog({
        category: "ADMIN",
        action: "help.request.submitted",
        actorId,
        metadata: { title: input.title, priority: input.priority, issueUrl },
      });

      return { ok: true, issueUrl };
    }),
});

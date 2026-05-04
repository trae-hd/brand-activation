import { z } from "zod";
import { router } from "../init";
import { memberProcedure } from "../procedures";
import { createLinearIssue } from "@/lib/linear/client";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const FEEDBACK_TYPES = ["Bug", "Idea", "Pain", "Praise"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

function linearPriority(severity: number): 0 | 1 | 2 | 3 | 4 {
  if (severity >= 5) return 1; // urgent
  if (severity >= 4) return 2; // high
  if (severity >= 3) return 3; // medium
  return 4;                    // low
}

function buildDescription(
  type: FeedbackType,
  body: string,
  severity: number,
  actorEmail: string,
  attachContext: boolean
): string {
  const lines: string[] = [
    `**Type:** ${type}`,
    `**Severity:** ${severity} / 5`,
    "",
    body,
  ];
  if (attachContext) {
    lines.push("", `---`, `**Submitted by:** ${actorEmail}`, `**Source:** MrQ Live admin panel`);
  }
  return lines.join("\n");
}

export const feedbackRouter = router({
  submit: memberProcedure
    .input(
      z.object({
        type: z.enum(FEEDBACK_TYPES),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
        severity: z.number().int().min(1).max(5),
        attachContext: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true; issueUrl: string | null }> => {
      const actorId = ctx.session.user.adminUserId!;
      const actorEmail = ctx.session.user.email ?? "unknown";

      let issueUrl: string | null = null;

      if (env.LINEAR_API_KEY && env.LINEAR_TEAM_ID) {
        const title = `[MrQ Live · ${input.type}] ${input.subject}`;
        const description = buildDescription(
          input.type,
          input.body,
          input.severity,
          input.attachContext ? actorEmail : "anonymous",
          input.attachContext
        );
        const result = await createLinearIssue(env.LINEAR_API_KEY, {
          title,
          description,
          teamId: env.LINEAR_TEAM_ID,
          priority: linearPriority(input.severity),
        });
        if (result.ok) {
          issueUrl = result.issueUrl;
        }
      }

      await writeAuditLog({
        category: "ADMIN",
        action: "feedback.submitted",
        actorId,
        metadata: {
          type: input.type,
          severity: input.severity,
          issueUrl,
        },
      });

      return { ok: true, issueUrl };
    }),
});

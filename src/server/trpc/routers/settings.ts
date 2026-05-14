import { z } from "zod";
import { router } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { ALL_TIMEZONES } from "@/lib/i18n/timezones";

const VALID_TIMEZONES = new Set(ALL_TIMEZONES.map((t) => t.value));

const UpdateSettingsSchema = z.object({
  workspaceName: z.string().min(1).max(100),
  timezone: z.string().refine((v) => VALID_TIMEZONES.has(v), { message: "Invalid timezone." }),
  otpTtlMin: z.number().int().min(1).max(60),
  geofence: z.string().max(200).nullable(),
  dataRetentionDays: z.number().int().min(30).max(3650),
  require2fa: z.boolean(),
  sessionTimeoutHours: z.number().int().min(1).max(168),
});

export type WorkspaceSettingsOutput = {
  workspaceName: string;
  timezone: string;
  otpTtlMin: number;
  geofence: string | null;
  dataRetentionDays: number;
  require2fa: boolean;
  sessionTimeoutHours: number;
  updatedAt: Date | null;
};

const DEFAULTS: WorkspaceSettingsOutput = {
  workspaceName: "MrQ Activation",
  timezone: "Europe/London",
  otpTtlMin: 10,
  geofence: null,
  dataRetentionDays: 180,
  require2fa: false,
  sessionTimeoutHours: 8,
  updatedAt: null,
};

export const settingsRouter = router({
  get: memberProcedure.query(async (): Promise<WorkspaceSettingsOutput> => {
    const row = await prisma.workspaceSettings.findUnique({
      where: { id: "workspace" },
      select: {
        workspaceName: true,
        timezone: true,
        otpTtlMin: true,
        geofence: true,
        dataRetentionDays: true,
        require2fa: true,
        sessionTimeoutHours: true,
        updatedAt: true,
      },
    });
    return row ?? DEFAULTS;
  }),

  update: adminProcedure
    .input(UpdateSettingsSchema)
    .mutation(async ({ input, ctx }): Promise<WorkspaceSettingsOutput> => {
      const actorId = ctx.session.user.adminUserId!;
      const updated = await prisma.workspaceSettings.upsert({
        where: { id: "workspace" },
        create: { id: "workspace", ...input, updatedById: actorId },
        update: { ...input, updatedById: actorId },
        select: {
          workspaceName: true,
          timezone: true,
          otpTtlMin: true,
          geofence: true,
          dataRetentionDays: true,
          require2fa: true,
          sessionTimeoutHours: true,
          updatedAt: true,
        },
      });
      await writeAuditLog({
        category: "ADMIN",
        action: "settings.updated",
        actorId,
        targetType: "WorkspaceSettings",
        targetId: "workspace",
        metadata: input,
      });
      return updated;
    }),
});

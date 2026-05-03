import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { validateAgainstAllowlist } from "@/lib/tiptap/validate";
import { consentVersionOf } from "@/lib/tiptap/consentVersion";
import { CONTENT_ALLOWLIST, CONSENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import { Prisma } from "@prisma/client";
import type { ActivationStatus } from "@prisma/client";

const RESERVED_SLUGS = new Set([
  "auth", "api", "admin", "activations", "dashboard", "_next", "health",
]);

// Transitions that require a typed confirmation phrase + reason.
const PHRASE_GATES: Partial<Record<string, string>> = {
  "SCHEDULED→DRAFT": "EDIT LOCKED ACTIVATION",
  "LIVE→SCHEDULED": "ROLLBACK ENDED",
  "ENDED→LIVE": "ROLLBACK ENDED",
  "ENDED→SCHEDULED": "ROLLBACK ENDED",
};

// Valid forward and backward transitions per §9.5.
const ALLOWED_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["LIVE", "DRAFT"],
  LIVE: ["ENDED", "SCHEDULED"],
  ENDED: ["LIVE", "SCHEDULED"],
};

const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens.")
  .refine((s) => !RESERVED_SLUGS.has(s), { message: "That slug is reserved." });

const TiptapDocSchema = z.record(z.unknown());

const ActivationWriteSchema = z.object({
  name: z.string().min(1).max(200),
  slug: SlugSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  content: TiptapDocSchema,
  consentNotice: TiptapDocSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  heroImageUrl: z.string().url().optional().nullable(),
});

interface ActivationListItem {
  id: string;
  name: string;
  slug: string;
  status: ActivationStatus;
  startsAt: Date;
  endsAt: Date;
  legalApproved: boolean;
  createdAt: Date;
  _count: { registrations: number };
}

interface ActivationDetail extends ActivationListItem {
  content: unknown;
  consentNotice: unknown;
  consentVersion: string;
  primaryColor: string | null;
  heroImageUrl: string | null;
  legalApprovedAt: Date | null;
  legalApprovedById: string | null;
  legalApprovalNotes: string | null;
  createdById: string;
  updatedAt: Date;
  booths: { id: string; code: string; label: string }[];
}

function assertTiptapValid(doc: unknown, allowlist: typeof CONTENT_ALLOWLIST | typeof CONSENT_ALLOWLIST, field: string) {
  const result = validateAgainstAllowlist(doc, allowlist);
  if (!result.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${field} contains a disallowed element: ${result.reason}`,
    });
  }
}

export const activationRouter = router({
  list: memberProcedure.query(async (): Promise<ActivationListItem[]> => {
    return prisma.activation.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        startsAt: true,
        endsAt: true,
        legalApproved: true,
        createdAt: true,
        _count: { select: { registrations: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: memberProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<ActivationDetail> => {
      const activation = await prisma.activation.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          startsAt: true,
          endsAt: true,
          content: true,
          consentNotice: true,
          consentVersion: true,
          primaryColor: true,
          heroImageUrl: true,
          legalApproved: true,
          legalApprovedAt: true,
          legalApprovedById: true,
          legalApprovalNotes: true,
          createdAt: true,
          createdById: true,
          updatedAt: true,
          _count: { select: { registrations: true } },
          booths: {
            select: { id: true, code: true, label: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }
      // In development, re-validate on read to catch allowlist drift.
      if (process.env.NODE_ENV === "development") {
        validateAgainstAllowlist(activation.content, CONTENT_ALLOWLIST);
        validateAgainstAllowlist(activation.consentNotice, CONSENT_ALLOWLIST);
      }
      return activation;
    }),

  create: adminProcedure
    .input(ActivationWriteSchema)
    .mutation(async ({ input, ctx }): Promise<{ id: string }> => {
      assertTiptapValid(input.content, CONTENT_ALLOWLIST, "content");
      assertTiptapValid(input.consentNotice, CONSENT_ALLOWLIST, "consentNotice");

      const consentVersion = consentVersionOf(input.consentNotice);
      const actorId = ctx.session.user.adminUserId!;

      const existing = await prisma.activation.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An activation with that slug already exists." });
      }

      const activation = await prisma.activation.create({
        data: {
          name: input.name,
          slug: input.slug,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          content: input.content as Prisma.InputJsonValue,
          consentNotice: input.consentNotice as Prisma.InputJsonValue,
          consentVersion,
          primaryColor: input.primaryColor ?? null,
          heroImageUrl: input.heroImageUrl ?? null,
          createdById: actorId,
        },
        select: { id: true },
      });

      await writeAuditLog({
        category: "ADMIN",
        action: "activation.created",
        actorId,
        targetType: "Activation",
        targetId: activation.id,
        metadata: { name: input.name, slug: input.slug },
      });

      return { id: activation.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        data: ActivationWriteSchema,
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ id: string }> => {
      assertTiptapValid(input.data.content, CONTENT_ALLOWLIST, "content");
      assertTiptapValid(input.data.consentNotice, CONSENT_ALLOWLIST, "consentNotice");

      const actorId = ctx.session.user.adminUserId!;

      const existing = await prisma.activation.findUnique({
        where: { id: input.id },
        select: { id: true, consentVersion: true, slug: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }

      // Check slug uniqueness if it changed.
      if (input.data.slug !== existing.slug) {
        const slugTaken = await prisma.activation.findUnique({
          where: { slug: input.data.slug },
          select: { id: true },
        });
        if (slugTaken) {
          throw new TRPCError({ code: "CONFLICT", message: "An activation with that slug already exists." });
        }
      }

      const newConsentVersion = consentVersionOf(input.data.consentNotice);
      const consentChanged = newConsentVersion !== existing.consentVersion;

      const updated = await prisma.activation.update({
        where: { id: input.id },
        data: {
          name: input.data.name,
          slug: input.data.slug,
          startsAt: input.data.startsAt,
          endsAt: input.data.endsAt,
          content: input.data.content as Prisma.InputJsonValue,
          consentNotice: input.data.consentNotice as Prisma.InputJsonValue,
          consentVersion: newConsentVersion,
          primaryColor: input.data.primaryColor ?? null,
          heroImageUrl: input.data.heroImageUrl ?? null,
          // Clear legalApproved when consent notice changes.
          ...(consentChanged
            ? { legalApproved: false, legalApprovedAt: null, legalApprovedById: null, legalApprovalNotes: null }
            : {}),
        },
        select: { id: true },
      });

      await writeAuditLog({
        category: "ADMIN",
        action: "activation.updated",
        actorId,
        targetType: "Activation",
        targetId: input.id,
        metadata: { name: input.data.name, slug: input.data.slug, consentChanged },
      });

      return { id: updated.id };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.id },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }
      if (activation.status === "LIVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a LIVE activation." });
      }

      await prisma.activation.delete({ where: { id: input.id } });

      await writeAuditLog({
        category: "ADMIN",
        action: "activation.deleted",
        actorId,
        targetType: "Activation",
        targetId: input.id,
        metadata: { name: activation.name, slug: activation.slug },
      });

      return { ok: true };
    }),

  transitionStatus: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        to: z.enum(["DRAFT", "SCHEDULED", "LIVE", "ENDED"]),
        phrase: z.string().optional(),
        reason: z.string().max(500).optional(),
        // ADMIN may force time-gated transitions (SCHEDULED→LIVE, LIVE→ENDED).
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true, status: true, startsAt: true, endsAt: true, legalApproved: true },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }

      const from = activation.status;
      const to = input.to;

      if (!ALLOWED_TRANSITIONS[from].includes(to)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from ${from} to ${to}.`,
        });
      }

      // DRAFT → SCHEDULED requires legal approval.
      if (from === "DRAFT" && to === "SCHEDULED" && !activation.legalApproved) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Legal approval required before this activation can be scheduled.",
        });
      }

      // SCHEDULED → LIVE: must be within 5 minutes of startsAt, unless forced.
      if (from === "SCHEDULED" && to === "LIVE" && !input.force) {
        const threshold = activation.startsAt.getTime() - 5 * 60 * 1000;
        if (Date.now() < threshold) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too early to go LIVE. Activation starts at ${activation.startsAt.toISOString()}.`,
          });
        }
      }

      // LIVE → ENDED: must be at or past endsAt, unless forced.
      if (from === "LIVE" && to === "ENDED" && !input.force) {
        if (Date.now() < activation.endsAt.getTime()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too early to end. Activation ends at ${activation.endsAt.toISOString()}.`,
          });
        }
      }

      // Phrase-gated transitions.
      const transitionKey = `${from}→${to}`;
      const requiredPhrase = PHRASE_GATES[transitionKey];
      if (requiredPhrase) {
        if (input.phrase !== requiredPhrase) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Type "${requiredPhrase}" to confirm this action.`,
          });
        }
        if (!input.reason?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A reason is required for this transition.",
          });
        }
      }

      // Atomic: status update and audit row commit together.
      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: { status: to },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: `activation.status.${from.toLowerCase()}.${to.toLowerCase()}`,
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          metadata: { from, to, reason: input.reason ?? null },
          tx,
        });
      });

      return { ok: true };
    }),

  setLegalApproved: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        approved: z.boolean(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }

      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: {
            legalApproved: input.approved,
            legalApprovedAt: input.approved ? new Date() : null,
            legalApprovedById: input.approved ? actorId : null,
            legalApprovalNotes: input.notes ?? null,
          },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: input.approved ? "activation.legal.approved" : "activation.legal.revoked",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          metadata: { notes: input.notes ?? null },
          tx,
        });
      });

      return { ok: true };
    }),
});

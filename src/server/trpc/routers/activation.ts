import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { revalidateTag } from "next/cache";
import { router } from "../init";
import { memberProcedure, adminProcedure } from "../procedures";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { validateAgainstAllowlist } from "@/lib/tiptap/validate";
import { consentVersionOf } from "@/lib/tiptap/consentVersion";
import { CONTENT_ALLOWLIST, CONSENT_ALLOWLIST } from "@/lib/tiptap/allowlists";
import type { ActivationStatus, ActivationReviewStatus } from "@prisma/client";
import { PHRASE_GATES, ALLOWED_TRANSITIONS } from "@/lib/activation/transitions";
import { AUDITED_CONTENT_FIELDS } from "@/lib/activation/auditedFields";
import { buildReviewSnapshot } from "@/lib/activation/reviewSnapshot";
import { fetchLastApprovedConsentVersion } from "@/lib/activation/lastApprovedConsentVersion";
import { renderQrPng } from "@/lib/qr/render";
import { getActivationUrl } from "@/lib/url/activationUrl";

const RESERVED_SLUGS = new Set([
  "auth", "api", "admin", "activations", "dashboard", "_next", "health",
]);

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
  heroImageUrl: z.string().optional().nullable(),
  heroImageAlt: z.string().max(500).optional().nullable(),
  timezone: z.string().min(1).max(64).optional().default("Europe/London"),
  entryCodePrefix: z
    .string()
    .regex(/^[A-Z0-9]{2,10}$/, "Prefix must be 2–10 uppercase letters/digits.")
    .optional()
    .nullable(),
  termsContent: TiptapDocSchema.optional().nullable(),
  consentItems: z
    .array(
      z.object({
        text: z.string().max(500),
        // Default true so callers (and stored JSON) without an explicit
        // required flag preserve the original "all-required" behaviour.
        required: z.boolean().default(true),
      }),
    )
    .optional()
    .nullable(),
  ctaText: z.string().max(100).optional().nullable(),
  // Success page fields
  successHeading: z.string().max(200).optional().nullable(),
  successSubheading: z.string().max(500).optional().nullable(),
  successContent: TiptapDocSchema.optional().nullable(),
  successCtaLabel: z.string().max(100).optional().nullable(),
  successCtaUrl: z.string().url().optional().nullable(),
  successShowEntryCode: z.boolean().optional().default(true),
  successShowResend: z.boolean().optional().default(true),
  successShowCta: z.boolean().optional().default(true),
  // Sponsor block
  successSponsorName: z.string().max(200).optional().nullable(),
  successSponsorLogoUrl: z.string().optional().nullable(),
  successSponsorLogoAlt: z.string().max(500).optional().nullable(),
  successSponsorHeadline: z.string().max(200).optional().nullable(),
  successSponsorBody: z.string().max(90).optional().nullable(),
  successSponsorCtaLabel: z.string().max(100).optional().nullable(),
  successSponsorCtaUrl: z.string().url().optional().nullable(),
  successSponsorTermsContent: z.unknown().optional().nullable(),
  // UTM defaults
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  mrqContactConsentEnabled: z.boolean().optional().default(true),
  // Verification email fields
  emailSubject: z.string().max(200).optional().nullable(),
  emailPreheader: z.string().max(200).optional().nullable(),
  emailHeading: z.string().max(200).optional().nullable(),
  emailBodyContent: z.unknown().optional().nullable(),
  emailBodyCopy: z.string().max(500).optional().nullable(),
  emailShowEntryCode: z.boolean().optional().default(true),
  emailShowEndDate: z.boolean().optional().default(true),
  emailTermsContent: z.unknown().optional().nullable(),
  emailFooter: z.string().max(200).optional().nullable(),
});

interface ActivationListItem {
  id: string;
  name: string;
  slug: string;
  status: ActivationStatus;
  reviewStatus: ActivationReviewStatus;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  createdById: string;
  _count: { registrations: number };
}

interface ActivationDetail extends ActivationListItem {
  content: unknown;
  consentNotice: unknown;
  consentVersion: string;
  consentItems: unknown;
  ctaText: string | null;
  primaryColor: string | null;
  heroImageUrl: string | null;
  submittedAt: Date | null;
  submittedById: string | null;
  approvedAt: Date | null;
  approvedById: string | null;
  reviewNotes: string | null;
  updatedAt: Date;
  booths: { id: string; code: string; label: string }[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  mrqContactConsentEnabled: boolean;
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

function detectChangedAuditedFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const field of AUDITED_CONTENT_FIELDS) {
    if (!(field in incoming)) continue;
    const a = existing[field] ?? null;
    const b = incoming[field] ?? null;
    if (a instanceof Date && b instanceof Date) {
      if (a.getTime() !== b.getTime()) changed.push(field);
      continue;
    }
    if (a === null && b === null) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(field);
  }
  return changed;
}

export const activationRouter = router({
  list: memberProcedure.query(async (): Promise<ActivationListItem[]> => {
    return prisma.activation.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        reviewStatus: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        createdById: true,
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
          reviewStatus: true,
          startsAt: true,
          endsAt: true,
          content: true,
          consentNotice: true,
          consentVersion: true,
          consentItems: true,
          ctaText: true,
          primaryColor: true,
          heroImageUrl: true,
          submittedAt: true,
          submittedById: true,
          approvedAt: true,
          approvedById: true,
          reviewNotes: true,
          createdAt: true,
          createdById: true,
          updatedAt: true,
          _count: { select: { registrations: true } },
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          mrqContactConsentEnabled: true,
          booths: {
            select: { id: true, code: true, label: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!activation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
      }
      if (process.env.NODE_ENV === "development") {
        validateAgainstAllowlist(activation.content, CONTENT_ALLOWLIST);
        validateAgainstAllowlist(activation.consentNotice, CONSENT_ALLOWLIST);
      }
      return activation;
    }),

  create: memberProcedure
    .input(ActivationWriteSchema)
    .mutation(async ({ input, ctx }): Promise<{ id: string }> => {
      assertTiptapValid(input.content, CONTENT_ALLOWLIST, "content");
      assertTiptapValid(input.consentNotice, CONSENT_ALLOWLIST, "consentNotice");

      const consentVersion =
        Array.isArray(input.consentItems) && input.consentItems.length > 0
          ? consentVersionOf(input.consentItems)
          : consentVersionOf(input.consentNotice);
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
          heroImageAlt: input.heroImageAlt ?? null,
          timezone: input.timezone ?? "Europe/London",
          entryCodePrefix: input.entryCodePrefix ?? null,
          termsContent: input.termsContent != null
            ? (input.termsContent as Prisma.InputJsonValue)
            : Prisma.DbNull,
          consentItems: input.consentItems != null
            ? (input.consentItems as Prisma.InputJsonValue)
            : Prisma.DbNull,
          ctaText: input.ctaText ?? null,
          createdById: actorId,
          // Success page fields
          successHeading: input.successHeading ?? null,
          successSubheading: input.successSubheading ?? null,
          successContent: input.successContent != null
            ? (input.successContent as Prisma.InputJsonValue)
            : Prisma.DbNull,
          successCtaLabel: input.successCtaLabel ?? null,
          successCtaUrl: input.successCtaUrl ?? null,
          successShowEntryCode: input.successShowEntryCode ?? true,
          successShowResend: input.successShowResend ?? true,
          successShowCta: input.successShowCta ?? true,
          // Sponsor block
          successSponsorName: input.successSponsorName ?? null,
          successSponsorLogoUrl: input.successSponsorLogoUrl ?? null,
          successSponsorLogoAlt: input.successSponsorLogoAlt ?? null,
          successSponsorHeadline: input.successSponsorHeadline ?? null,
          successSponsorBody: input.successSponsorBody ?? null,
          successSponsorCtaLabel: input.successSponsorCtaLabel ?? null,
          successSponsorCtaUrl: input.successSponsorCtaUrl ?? null,
          successSponsorTermsContent: input.successSponsorTermsContent ?? Prisma.JsonNull,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          mrqContactConsentEnabled: input.mrqContactConsentEnabled ?? true,
          // Verification email fields
          emailSubject: input.emailSubject ?? null,
          emailPreheader: input.emailPreheader ?? null,
          emailHeading: input.emailHeading ?? null,
          emailBodyContent: input.emailBodyContent ?? Prisma.JsonNull,
          emailBodyCopy: input.emailBodyCopy ?? null,
          emailShowEntryCode: input.emailShowEntryCode ?? true,
          emailShowEndDate: input.emailShowEndDate ?? true,
          emailTermsContent: input.emailTermsContent ?? Prisma.JsonNull,
          emailFooter: input.emailFooter ?? null,
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

  update: memberProcedure
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

      const result = await prisma.$transaction(async (tx) => {
        // Read inside the transaction to avoid lost-update races on reviewStatus.
        const existing = await tx.activation.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            slug: true,
            consentVersion: true,
            reviewStatus: true,
            name: true,
            startsAt: true,
            endsAt: true,
            content: true,
            consentNotice: true,
            consentItems: true,
            termsContent: true,
            ctaText: true,
            heroImageUrl: true,
            heroImageAlt: true,
            primaryColor: true,
            successHeading: true,
            successSubheading: true,
            successContent: true,
            successCtaLabel: true,
            successCtaUrl: true,
            successShowEntryCode: true,
            successShowResend: true,
            successShowCta: true,
            successSponsorName: true,
            successSponsorLogoUrl: true,
            successSponsorLogoAlt: true,
            successSponsorHeadline: true,
            successSponsorBody: true,
            successSponsorCtaLabel: true,
            successSponsorCtaUrl: true,
            successSponsorTermsContent: true,
            emailSubject: true,
            emailPreheader: true,
            emailHeading: true,
            emailBodyContent: true,
            emailBodyCopy: true,
            emailShowEntryCode: true,
            emailShowEndDate: true,
            emailTermsContent: true,
            emailFooter: true,
          },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Activation not found." });
        }

        if (input.data.slug !== existing.slug) {
          const slugTaken = await tx.activation.findUnique({
            where: { slug: input.data.slug },
            select: { id: true },
          });
          if (slugTaken) {
            throw new TRPCError({ code: "CONFLICT", message: "An activation with that slug already exists." });
          }
        }

        const newConsentVersion =
          Array.isArray(input.data.consentItems) && input.data.consentItems.length > 0
            ? consentVersionOf(input.data.consentItems)
            : consentVersionOf(input.data.consentNotice);

        // Soft invalidation: detect which audited fields changed.
        const changedFields = detectChangedAuditedFields(
          existing as Record<string, unknown>,
          input.data as unknown as Record<string, unknown>,
        );

        let reviewStatus: ActivationReviewStatus = existing.reviewStatus;
        let reviewAuditAction: string | null = null;
        let clearSubmission = false;

        if (existing.reviewStatus === "APPROVED" && changedFields.length > 0) {
          reviewStatus = "DRAFT_EDITED";
          reviewAuditAction = "activation.review.invalidated_by_edit";
        } else if (existing.reviewStatus === "SUBMITTED" && changedFields.length > 0) {
          reviewStatus = "DRAFT";
          clearSubmission = true;
          reviewAuditAction = "activation.review.submission_retracted_by_edit";
        } else if (existing.reviewStatus === "CHANGES_REQUESTED") {
          reviewStatus = "DRAFT";
          clearSubmission = true;
          reviewAuditAction = "activation.review.changes_addressed";
        }

        const updated = await tx.activation.update({
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
            heroImageAlt: input.data.heroImageAlt ?? null,
            timezone: input.data.timezone ?? "Europe/London",
            entryCodePrefix: input.data.entryCodePrefix ?? null,
            termsContent: input.data.termsContent != null
              ? (input.data.termsContent as Prisma.InputJsonValue)
              : Prisma.DbNull,
            consentItems: input.data.consentItems != null
              ? (input.data.consentItems as Prisma.InputJsonValue)
              : Prisma.DbNull,
            ctaText: input.data.ctaText ?? null,
            reviewStatus,
            ...(clearSubmission ? { submittedAt: null, submittedById: null } : {}),
            // Success page fields
            successHeading: input.data.successHeading ?? null,
            successSubheading: input.data.successSubheading ?? null,
            successContent: input.data.successContent != null
              ? (input.data.successContent as Prisma.InputJsonValue)
              : Prisma.DbNull,
            successCtaLabel: input.data.successCtaLabel ?? null,
            successCtaUrl: input.data.successCtaUrl ?? null,
            successShowEntryCode: input.data.successShowEntryCode ?? true,
            successShowResend: input.data.successShowResend ?? true,
            successShowCta: input.data.successShowCta ?? true,
            // Sponsor block
            successSponsorName: input.data.successSponsorName ?? null,
            successSponsorLogoUrl: input.data.successSponsorLogoUrl ?? null,
            successSponsorLogoAlt: input.data.successSponsorLogoAlt ?? null,
            successSponsorHeadline: input.data.successSponsorHeadline ?? null,
            successSponsorBody: input.data.successSponsorBody ?? null,
            successSponsorCtaLabel: input.data.successSponsorCtaLabel ?? null,
            successSponsorCtaUrl: input.data.successSponsorCtaUrl ?? null,
            successSponsorTermsContent: input.data.successSponsorTermsContent ?? Prisma.JsonNull,
            utmSource: input.data.utmSource ?? null,
            utmMedium: input.data.utmMedium ?? null,
            utmCampaign: input.data.utmCampaign ?? null,
            mrqContactConsentEnabled: input.data.mrqContactConsentEnabled ?? true,
            // Verification email fields
            emailSubject: input.data.emailSubject ?? null,
            emailPreheader: input.data.emailPreheader ?? null,
            emailHeading: input.data.emailHeading ?? null,
            emailBodyContent: input.data.emailBodyContent ?? Prisma.JsonNull,
            emailBodyCopy: input.data.emailBodyCopy ?? null,
            emailShowEntryCode: input.data.emailShowEntryCode ?? true,
            emailShowEndDate: input.data.emailShowEndDate ?? true,
            emailTermsContent: input.data.emailTermsContent ?? Prisma.JsonNull,
            emailFooter: input.data.emailFooter ?? null,
          },
          select: { id: true },
        });

        await writeAuditLog({
          category: "ADMIN",
          action: "activation.updated",
          actorId,
          targetType: "Activation",
          targetId: input.id,
          metadata: { name: input.data.name, slug: input.data.slug },
          tx,
        });

        if (reviewAuditAction) {
          await writeAuditLog({
            category: "ADMIN",
            action: reviewAuditAction,
            actorId,
            targetType: "Activation",
            targetId: input.id,
            metadata:
              reviewAuditAction === "activation.review.invalidated_by_edit"
                ? { changedFields }
                : undefined,
            tx,
          });
        }

        return { id: updated.id, slug: input.data.slug };
      });

      // Invalidate the participant-facing cache so landing and success pages reflect edits immediately.
      // Wrapped in try/catch because revalidateTag requires the Next.js request context and will throw in test environments.
      try {
        revalidateTag(`activation:${result.slug}`, { expire: 0 });
      } catch {
        // no-op outside Next.js request context
      }

      return { id: result.id };
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

  transitionStatus: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        to: z.enum(["DRAFT", "SCHEDULED", "LIVE", "ENDED"]),
        phrase: z.string().optional(),
        reason: z.string().max(500).optional(),
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true, status: true, startsAt: true, endsAt: true, reviewStatus: true },
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

      // DRAFT → SCHEDULED requires peer review approval.
      if (from === "DRAFT" && to === "SCHEDULED" && activation.reviewStatus !== "APPROVED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Peer review approval required before this activation can be scheduled.",
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

  // ── Two-pair-eyes review mutations ───────────────────────────────────────────

  submitForReview: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true, reviewStatus: true, createdById: true },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });

      if (actorId !== activation.createdById) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can submit for review." });
      }
      if (!["DRAFT", "DRAFT_EDITED", "CHANGES_REQUESTED"].includes(activation.reviewStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit from state ${activation.reviewStatus}.`,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: {
            reviewStatus: "SUBMITTED",
            submittedAt: new Date(),
            submittedById: actorId,
          },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.review.submitted",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          tx,
        });
      });

      return { ok: true };
    }),

  approveReview: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        notes: z.string().max(500).optional(),
        acknowledgedConsentDiff: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: {
          id: true,
          reviewStatus: true,
          createdById: true,
          consentVersion: true,
          name: true,
          slug: true,
          startsAt: true,
          endsAt: true,
          content: true,
          consentNotice: true,
          consentItems: true,
          termsContent: true,
          ctaText: true,
          heroImageUrl: true,
          heroImageAlt: true,
          primaryColor: true,
          successHeading: true,
          successSubheading: true,
          successContent: true,
          successCtaLabel: true,
          successCtaUrl: true,
          successShowEntryCode: true,
          successShowResend: true,
          successShowCta: true,
          successSponsorName: true,
          successSponsorLogoUrl: true,
          successSponsorLogoAlt: true,
          successSponsorHeadline: true,
          successSponsorBody: true,
          successSponsorCtaLabel: true,
          successSponsorCtaUrl: true,
          successSponsorTermsContent: true,
        },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });

      if (actorId === activation.createdById) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve your own activation." });
      }
      if (activation.reviewStatus !== "SUBMITTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve from state ${activation.reviewStatus}.`,
        });
      }

      const lastApprovedConsentVersion = await fetchLastApprovedConsentVersion(input.activationId);
      if (
        lastApprovedConsentVersion &&
        lastApprovedConsentVersion !== activation.consentVersion &&
        !input.acknowledgedConsentDiff
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Acknowledge the consent notice changes before approving.",
        });
      }

      const snapshot = buildReviewSnapshot(activation as unknown as Record<string, unknown>);

      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: {
            reviewStatus: "APPROVED",
            approvedAt: new Date(),
            approvedById: actorId,
            reviewNotes: input.notes ?? null,
          },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.review.approved",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          metadata: {
            notes: input.notes ?? null,
            consentVersionApproved: activation.consentVersion,
            snapshot,
          },
          tx,
        });
      });

      return { ok: true };
    }),

  requestChanges: memberProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        notes: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;

      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true, reviewStatus: true, createdById: true },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });

      if (actorId === activation.createdById) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot review your own activation." });
      }
      if (activation.reviewStatus !== "SUBMITTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot request changes from state ${activation.reviewStatus}.`,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: {
            reviewStatus: "CHANGES_REQUESTED",
            reviewNotes: input.notes,
          },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.review.changes_requested",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          metadata: { notes: input.notes },
          tx,
        });
      });

      return { ok: true };
    }),

  archive: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });
      const archivedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: { archivedAt, endsAt: archivedAt },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.archived",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          tx,
        });
      });
      return { ok: true };
    }),

  unarchive: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }): Promise<{ ok: true }> => {
      const actorId = ctx.session.user.adminUserId!;
      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { id: true },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.$transaction(async (tx) => {
        await tx.activation.update({
          where: { id: input.activationId },
          data: { archivedAt: null },
        });
        await writeAuditLog({
          category: "ADMIN",
          action: "activation.unarchived",
          actorId,
          targetType: "Activation",
          targetId: input.activationId,
          tx,
        });
      });
      return { ok: true };
    }),

  countPendingReviewForMe: memberProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.adminUserId!;
    return prisma.activation.count({
      where: {
        reviewStatus: "SUBMITTED",
        createdById: { not: userId },
      },
    });
  }),

  getLastApprovedSnapshot: memberProcedure
    .input(z.object({ activationId: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await prisma.auditLog.findFirst({
        where: {
          action: "activation.review.approved",
          targetType: "Activation",
          targetId: input.activationId,
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
      });
      if (!row?.metadata) return { snapshot: null, consentVersionApproved: null };
      const meta = row.metadata as Record<string, unknown>;
      return {
        snapshot: (meta.snapshot ?? null) as Record<string, unknown> | null,
        consentVersionApproved: typeof meta.consentVersionApproved === "string"
          ? meta.consentVersionApproved : null,
      };
    }),

  countLive: memberProcedure.query(async () => {
    return prisma.activation.count({ where: { status: "LIVE", archivedAt: null } });
  }),

  getCampaignQrPng: adminProcedure
    .input(
      z.object({
        activationId: z.string().min(1),
        utmSource: z.string().max(100).optional(),
        utmMedium: z.string().max(100).optional(),
        utmCampaign: z.string().max(100).optional(),
      }),
    )
    .query(async ({ input }): Promise<{ filename: string; base64: string }> => {
      const activation = await prisma.activation.findUnique({
        where: { id: input.activationId },
        select: { slug: true },
      });
      if (!activation) throw new TRPCError({ code: "NOT_FOUND" });

      const url = getActivationUrl(activation.slug, {
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      });
      const png = await renderQrPng(url);

      const parts = [activation.slug];
      if (input.utmSource) parts.push(input.utmSource);
      if (input.utmMedium) parts.push(input.utmMedium);
      if (input.utmCampaign) parts.push(input.utmCampaign);
      const filename = `${parts.join("__")}.png`;

      return { filename, base64: png.toString("base64") };
    }),
});

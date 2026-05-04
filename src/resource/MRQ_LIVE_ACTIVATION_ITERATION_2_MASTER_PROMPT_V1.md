# MrQ Live Activation Platform — Iteration 2 Master Prompt (v1)

> **Purpose.** This document is the constitution for **Iteration 2** of the MrQ Live Activation Platform. Iteration 1 (V5) shipped a working system: participant flow, admin console, activation builder, dashboard, OTP verification, audit log. This iteration revises five surfaces uncovered by post-launch review: a customisable success page, a true two-pair-eyes review process replacing "legal approval", QR codes wired to UTM-aware URLs, dashboard discoverability, and a methodology nav item. Hand this document to any capable AI coding assistant and it will produce the changes without requiring clarification. Read every section before writing a single line of code.
>
> **Relationship to V5.** This document **inherits** `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` in full. Every rule, schema field, folder structure, library pin, env var, anti-pattern, and gotcha in V5 still applies. This document records only the **deltas** — what changes, what is added, what is removed. Where V5 and this document overlap or contradict, **this document wins**. V5 remains the reference for everything not contradicted here.
>
> **Framework.** Same as V5 — Next.js 16 (App Router), `proxy.ts` middleware, async request APIs, Tailwind v4, NextAuth v4, Prisma, ioredis, Tiptap v2.
>
> **Build proceeds in six phases (§11).** Each phase has a pre-flight checklist, a scoped implementation list, a verification checklist, an effort estimate, and an explicit checkpoint gate. **Stop at every checkpoint. Do not proceed without human approval.** Phase N+1 begins only on receipt of `Iteration 2 Phase [N] approved — begin Iteration 2 Phase [N+1]`. The closing phrase for Phase 6 is `Iteration 2 Phase 6 approved — Iteration 2 complete`.
>
> **Migration posture.** This iteration touches `Activation`, the most-used model in the system, with **production data already in place**. Schema changes follow the expand → migrate → contract pattern: Phase 1 adds new columns and backfills, Phases 2–5 cut over to the new columns, Phase 6 drops legacy columns. No phase is destructive in isolation.

---

## 1. System Instructions & Behavioural Rules

All V5 §1 rules apply unmodified. The rules below are **additions** specific to Iteration 2. Internalise both lists.

- **Authority order.** Iteration 2 master prompt > V5 master prompt > V3 source spec > training-data intuition. When this document and V5 disagree, this document wins. When V5 and V3 disagree, V5 wins. When unsure, re-read; do not pick a default.
- **The word "legal" is removed from the codebase.** "Legal approval" was a misnomer — it was always a peer-review gate, not a legal-team gate. Replacements: `legalApproved` → `reviewStatus`, `legalApprovedAt` → `approvedAt`, `legalApprovedById` → `approvedById`, `legalApprovalNotes` → `reviewNotes`. Component file `ActivationFormLegal.tsx` is renamed `ActivationFormReview.tsx`. Audit actions `activation.legal.approved`/`.revoked` are renamed `activation.review.approved`/`.revoked`. Pre-existing audit log rows with `activation.legal.*` actions are **not rewritten** — they remain a historical record of the old terminology. New rows use the new names.
- **Two-pair-eyes is enforced at three layers (defence in depth).** (1) UI hides the approve button from the creator. (2) tRPC mutation `activation.approveReview` throws `FORBIDDEN` if `actorId === createdById`. (3) Postgres CHECK constraint `activation_no_self_approval` rejects rows where `approvedById = createdById`. All three are required; none are sufficient on their own. Deleting any one layer is a regression.
- **Soft invalidation is the default for content edits on approved activations.** When any audited content field on an `APPROVED` activation is edited, `reviewStatus` transitions to `DRAFT_EDITED` (not back to `DRAFT`). The previously-approved version remains queryable via the audit log; the diff view in Phase 3 reads from there. Hard-clearing approval on every edit is the V5 behaviour and is removed by this iteration.
- **URL holds view-state, React state holds form values.** Tab selection (`?tab=registration|success`) and preview mode (`?preview=registration|success`) live in the URL via `useSearchParams` + `router.replace` (no full navigation). Form values (Tiptap docs, hero URLs, consent items, etc.) live in lifted parent `useState` so they survive tab switches. Form values **never** touch the URL — they would leak to logs/analytics, hit URL-length caps, and re-render on every keystroke. Navigation away with unsaved changes triggers a `beforeunload` warning.
- **Form state stays on `useState` — react-hook-form is not introduced this iteration.** The existing `ActivationForm.tsx` is `useState`-based and will remain so. Lifting state to the parent solves the "don't lose unsaved changes when switching tabs" concern without a framework swap. RHF migration is a separate ticket if desired later.
- **Success-page schema mirrors registration-page convention.** Tiptap documents (`successContent`, `successSponsorContent`) live in their own JSON columns alongside `content`/`consentNotice`/`termsContent`. Display scalars (`successHeading`, `successHeroImageUrl`, `successCtaLabel`, etc.) stay flat alongside `heroImageUrl`/`primaryColor`/`ctaText`. **Do not** introduce a single `successConfig` JSONB. Either a future refactor unifies both pages under `pageConfig` JSONB columns (one for registration, one for success), or both stay flat-with-JSON-trees. Mixing patterns is the worst option.
- **`getActivationUrl(activation, options)` is the single source of truth for participant URLs.** Any code that constructs a participant-facing URL (UTM builder, booth QR generator, campaign QR generator, dashboard breakdown links) calls this utility. Manual string concatenation of slugs + UTM params is a §10 anti-pattern.
- **QR bulk export is server-side streaming.** Railway is the deployment target (V5 §2.5). The bulk-export endpoint streams a ZIP via `archiver` with constant memory. Do **not** buffer the full ZIP in memory; do **not** generate QRs in the browser with jszip. The streaming pattern lives in `lib/qr/zipStream.ts`; new endpoints reuse it.
- **Methodology lives at `app/(admin)/methodology/page.tsx` as TSX.** MDX is not introduced this iteration. The `Section`/`SubSection`/`Steps`/`Callout`/`Formula` primitives are copied from the Reports Manager methodology page (referenced in §8.2). MDX migration is a future ticket gated on a second methodology-style document existing.
- **Sidebar review-pending badge filters to "reviewable by current user".** The count is `WHERE reviewStatus = 'SUBMITTED' AND createdById <> $currentUserId AND active = true`. Showing the creator their own pending submission is a UX bug (creates a false-positive nudge to review one's own work).
- **No new env vars in Iteration 2.** All work uses existing V5 env vars (`PUBLIC_BASE_URL`, `DATABASE_URL`, etc.). If a phase appears to require a new env var, surface a single-concern question first — defaults can be hard-coded as constants.
- **No new top-level directories.** All Iteration 2 code lands in V5's existing folder structure (§3.2 of V5). New files within existing directories are fine; new directories require justification.

---

## 2. Project Context (Iteration 2 Delta)

### 2.1 What changed since V5

V5 shipped successfully. Five concerns were uncovered in post-launch review that warranted an iteration rather than incremental tickets:

1. **Registration success page is hardcoded.** [src/app/(participant)/[activationSlug]/success/page.tsx](../app/(participant)/[activationSlug]/success/page.tsx) renders a 177-line static React component with no DB-backed copy or images. Creators can fully customise the landing page but cannot touch what the participant sees after verification. This is the largest product gap.
2. **"Legal approval" allows self-approval.** [activation.ts:412-453 `setLegalApproved`](../server/trpc/routers/activation.ts) accepts any ADMIN caller, including the creator. This violates segregation of duties. The naming is also a misnomer — there is no legal-team workflow involved; it has always been peer review.
3. **QR code button is dead.** [ActivationFormBooths.tsx:84-86](../components/admin/activation-form/ActivationFormBooths.tsx) renders a `QR ↓` button with no `onClick`. The `BoothQrButton` component exists ([BoothQrButton.tsx](../components/shared/BoothQrButton.tsx)) but is not wired in. QR URLs encode only `?booth=CODE` — UTM params from the builder ([ActivationFormUtm.tsx](../components/admin/activation-form/ActivationFormUtm.tsx)) are never baked into a QR.
4. **Dashboard is hidden.** [src/app/(admin)/dashboard/[activationId]/page.tsx](../app/(admin)/dashboard/[activationId]/page.tsx) exists and works (KPIs, sparkline, per-booth bars, registrations table) but is reachable only by clicking the activation name in the list. Sidebar nav has no Dashboard entry.
5. **No methodology page.** Reports Manager (the EOS dashboard tool) has a comprehensive methodology page at [methodology/page.tsx](../../../../../../hq-workspace/frontend_poc/hq-monorepo-poc/apps/reports-manager/app/(pages)/linear-command-centre/methodology/page.tsx) that explains every metric, workflow, and primitive. The activation tool has nothing equivalent.

### 2.2 In Scope (Iteration 2)

- **Two-pair-eyes peer review.** State machine `DRAFT → SUBMITTED → APPROVED` (with `CHANGES_REQUESTED` and `DRAFT_EDITED` side states), DB constraint, tRPC mutations, audit trail, role-aware UI, side-by-side diff preview, sidebar badge.
- **Customisable registration success page.** New schema fields, tab-based form refactor, lifted parent state, URL view-state convention, preview pane mode toggle, server-rendered success page mirroring the landing-page caching pattern.
- **QR codes wired to UTM-aware URLs.** `getActivationUrl` utility, booth QR button fix, campaign QR generator, server-side bulk ZIP export via `archiver` streaming, optional `ActivationCampaignLink` model for tracked campaigns.
- **Dashboard discoverability.** Per-row "Dashboard →" link in the activations table, "View live dashboard →" banner on the edit page once `LIVE`, sidebar "Live activations" submenu, UTM stacked bar in the dashboard, CSV export button on the dashboard header.
- **Methodology page.** New route at `/methodology`, TSX-based using primitives copied from Reports Manager, sidebar nav entry under a new `Help` group, content covering 12 sections (overview, creation flow, both pages, booths/QR, UTM, peer review, lifecycle, going live, dashboard, retention/DSAR, glossary).
- **Backfill and cutover migrations.** Phase 1 expands the schema and backfills production rows. Phase 6 drops the legacy `legalApproved*` columns and removes V5 references.

### 2.3 Out of Scope (Iteration 2)

- AES-GCM email encryption at rest (still deferred — V5 §14.0).
- BullMQ, separate worker process, Redis as a queue.
- A third role beyond ADMIN/MEMBER. The peer-review check is "any admin who is not the creator", not a dedicated REVIEWER role.
- Inline text diff for plain-text fields (e.g., character-level highlighting). v1 ships side-by-side preview only; inline diff is a v2 polish item.
- MDX migration of any documentation. Methodology ships as TSX.
- React Hook Form migration of `ActivationForm`. Lifted `useState` is the chosen pattern.
- A `pageConfig` JSONB unification of registration + success page schemas. Each page mirrors the existing convention (Tiptap docs in JSON cols, scalars flat).
- Notifications (Slack ping, email-on-submission) when an activation is submitted for review. Audit log + sidebar badge are sufficient signal.
- Mobile-first admin layout.
- A/B testing for success-page variants.
- Webhook events on review state transitions.

### 2.4 Architectural Posture (Iteration 2 Delta)

- **Same Next.js / Railway / tRPC / Prisma posture as V5.** No new services, no new top-level architectural pieces.
- **Streaming responses introduced.** The bulk QR ZIP export uses Node streams piped through `archiver`. This is the first streaming response in the codebase. Pattern centralised in `lib/qr/zipStream.ts`.
- **DB-level integrity constraints introduced.** Postgres CHECK constraint enforces `approvedById <> createdById`. This is the first business-rule constraint at the DB layer (other constraints are FK / unique / not-null only).
- **URL view-state pattern introduced.** Tab + preview-mode selection live in `useSearchParams`. This is the first use of URL-as-state in the admin console. Pattern documented in §5.3.

---

## 3. Database Schema Changes

### 3.1 Activation model deltas

The full schema after Iteration 2 Phase 1 (additions in `// ── ADDED ──` blocks; removals in `// ── REMOVED IN PHASE 6 ──` blocks):

```prisma
enum ActivationStatus {
  DRAFT
  SCHEDULED
  LIVE
  ENDED
}

// ── ADDED ──
enum ActivationReviewStatus {
  DRAFT             // creator is editing; never submitted
  SUBMITTED         // submitted, awaiting peer review
  APPROVED          // peer-approved; ready to schedule/go live
  CHANGES_REQUESTED // peer rejected with notes; back to creator
  DRAFT_EDITED      // was APPROVED; creator has since edited content
}
// ── END ADDED ──

model Activation {
  id        String           @id @default(cuid())
  slug      String           @unique
  name      String
  status    ActivationStatus @default(DRAFT)

  startsAt DateTime
  endsAt   DateTime

  timezone        String  @default("Europe/London")
  entryCodePrefix String?

  // Registration page (V5 fields, unchanged)
  content        Json
  consentNotice  Json
  consentVersion String
  termsContent   Json?
  consentItems   Json?
  ctaText        String?
  primaryColor   String?
  heroImageUrl   String?

  // ── ADDED — Success page fields (mirror registration-page convention) ──
  successHeading        String?  // e.g. "You're on the list."
  successSubheading     String?  // optional small paragraph above content
  successContent        Json?    // Tiptap doc — marketing copy block
  successSponsorContent Json?    // Tiptap doc — sponsor / promo block
  successCtaLabel       String?  // overrides "Open my email"
  successCtaUrl         String?  // optional external CTA URL (sponsor)
  successHeroImageUrl   String?
  successShowEntryCode  Boolean  @default(true)
  successShowResend     Boolean  @default(true)
  // ── END ADDED ──

  // ── ADDED — Peer review fields ──
  reviewStatus    ActivationReviewStatus @default(DRAFT)
  submittedAt     DateTime?
  submittedBy     AdminUser? @relation("ReviewSubmitter", fields: [submittedById], references: [id])
  submittedById   String?
  approvedAt      DateTime?
  approvedBy      AdminUser? @relation("ReviewApprover", fields: [approvedById], references: [id])
  approvedById    String?
  reviewNotes     String?    // last reviewer's notes (approval or rejection)
  // ── END ADDED ──

  // ── REMOVED IN PHASE 6 (kept in Phases 1–5 for backfill / rollback) ──
  legalApproved      Boolean   @default(false)
  legalApprovedAt    DateTime?
  legalApprovedBy    AdminUser? @relation("LegalApprover", fields: [legalApprovedById], references: [id])
  legalApprovedById  String?
  legalApprovalNotes String?
  // ── END REMOVED IN PHASE 6 ──

  createdAt   DateTime  @default(now())
  createdBy   AdminUser @relation("ActivationCreator", fields: [createdById], references: [id])
  createdById String
  updatedAt   DateTime  @updatedAt

  registrations Registration[]
  booths        Booth[]

  @@index([status, startsAt])
  @@index([slug])
  @@index([reviewStatus, createdById])  // ── ADDED — supports sidebar badge query ──
}

model AdminUser {
  // ...V5 fields unchanged...

  // ── ADDED — relation back-references for new review fields ──
  activationsReviewSubmitted Activation[] @relation("ReviewSubmitter")
  activationsReviewApproved  Activation[] @relation("ReviewApprover")
  // ── END ADDED ──

  // ── REMOVED IN PHASE 6 ──
  activationsLegalApproved Activation[] @relation("LegalApprover")
  // ── END REMOVED IN PHASE 6 ──

  // ...rest unchanged...
}
```

### 3.2 DB-level CHECK constraint

Added in the same Phase 1 migration as the new columns. Implemented as raw SQL in the Prisma migration (Prisma does not generate CHECK constraints declaratively):

```sql
ALTER TABLE "Activation"
  ADD CONSTRAINT activation_no_self_approval
  CHECK ("approvedById" IS NULL OR "approvedById" <> "createdById");
```

This is the load-bearing safety net. The tRPC mutation throws `FORBIDDEN` first; the constraint catches anything that bypasses tRPC (raw SQL, future microservice, future bug). Both layers are required.

### 3.3 Backfill plan (Phase 1, inside the migration)

Production data exists with `legalApproved=true` rows. The Phase 1 migration includes inline backfill SQL, run as part of the same transaction as the column additions:

```sql
-- Backfill reviewStatus from legalApproved
UPDATE "Activation"
   SET "reviewStatus"  = 'APPROVED',
       "approvedAt"    = "legalApprovedAt",
       "approvedById"  = "legalApprovedById",
       "reviewNotes"   = "legalApprovalNotes"
 WHERE "legalApproved" = true
   AND "approvedById" IS DISTINCT FROM "createdById";

-- Edge case: existing rows where the creator approved their own activation under V5.
-- The CHECK constraint added below would reject these. Demote them to DRAFT and log.
INSERT INTO "AuditLog" (id, category, action, "actorId", "targetType", "targetId", metadata, "createdAt")
SELECT
  gen_random_uuid()::text,
  'ADMIN',
  'activation.review.backfill.self_approved_demoted',
  "createdById",
  'Activation',
  id,
  jsonb_build_object(
    'reason', 'V5 allowed self-approval; Iteration 2 enforces two-pair-eyes',
    'previousLegalApprovedAt', "legalApprovedAt",
    'previousLegalApprovedById', "legalApprovedById"
  ),
  NOW()
FROM "Activation"
WHERE "legalApproved" = true
  AND "legalApprovedById" = "createdById";

UPDATE "Activation"
   SET "reviewStatus" = 'DRAFT'
 WHERE "legalApproved" = true
   AND "legalApprovedById" = "createdById";
```

After backfill, the `legalApproved` column remains populated but is no longer read by application code. Phases 2–5 read/write `reviewStatus`. Phase 6 drops the legacy columns.

### 3.4 Cutover plan (Phase 6 migration)

After all application code reads/writes `reviewStatus` for ≥ one production deployment cycle:

```sql
ALTER TABLE "Activation"
  DROP COLUMN "legalApproved",
  DROP COLUMN "legalApprovedAt",
  DROP COLUMN "legalApprovedById",
  DROP COLUMN "legalApprovalNotes";
```

The corresponding Prisma schema removal lands in the same migration. AdminUser's `activationsLegalApproved` relation is removed.

### 3.5 Index strategy

The new `@@index([reviewStatus, createdById])` supports the sidebar badge query (`WHERE reviewStatus = 'SUBMITTED' AND createdById <> $currentUserId`). Phase 1 verification includes `EXPLAIN ANALYZE` on this query against a seeded dataset to confirm the index is used.

---

## 4. Two-Pair-Eyes Review System

### 4.1 State machine

```
                ┌──────────────────────────────────────────┐
                │                                          │
                ▼                                          │
DRAFT ──submitForReview──> SUBMITTED ──approveReview──> APPROVED
  ▲                              │                          │
  │                              │                          │
  │                              └──requestChanges──> CHANGES_REQUESTED ──(creator edits)──> DRAFT
  │                                                                                               │
  │                                                                                               │
  └───────────────────────(creator edits APPROVED activation)──> DRAFT_EDITED                    │
                                                                       │                          │
                                                                       └──submitForReview─────────┘
```

Transitions:
- `DRAFT → SUBMITTED` via `activation.submitForReview`. Creator-only. Sets `submittedAt`, `submittedById`. Audit: `activation.review.submitted`.
- `SUBMITTED → APPROVED` via `activation.approveReview`. Non-creator ADMIN only. Sets `approvedAt`, `approvedById`, `reviewNotes` (optional). Audit: `activation.review.approved`.
- `SUBMITTED → CHANGES_REQUESTED` via `activation.requestChanges`. Non-creator ADMIN only. Requires `reviewNotes` (mandatory). Audit: `activation.review.changes_requested`.
- `CHANGES_REQUESTED → DRAFT` automatic on next save by creator. Clears `submittedAt`, `submittedById`. Audit: `activation.review.changes_addressed`.
- `APPROVED → DRAFT_EDITED` automatic on save when any audited content field changes. Approval metadata (`approvedAt`, `approvedById`, `reviewNotes`) is **preserved** so the diff view can render the approved version. Audit: `activation.review.invalidated_by_edit`.
- `DRAFT_EDITED → SUBMITTED` via `activation.submitForReview`. Same as `DRAFT → SUBMITTED`.

The transition gate in V5 `transitionStatus` (`DRAFT → SCHEDULED` requires `legalApproved`) is replaced by `reviewStatus === 'APPROVED'`. Activations in `DRAFT_EDITED` cannot be scheduled — the prior approval is no longer current.

### 4.2 tRPC mutations

All three mutations live in [src/server/trpc/routers/activation.ts](../server/trpc/routers/activation.ts) and replace V5's `setLegalApproved`. All require `adminProcedure`. All write to `AuditLog` via `writeAuditLog` inside the same `prisma.$transaction` as the row update.

```ts
// activation.ts (Iteration 2 additions; setLegalApproved removed)

submitForReview: adminProcedure
  .input(z.object({ activationId: z.string().min(1) }))
  .mutation(async ({ input, ctx }) => {
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
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot submit from state ${activation.reviewStatus}.` });
    }
    // Transactional update + audit (pattern matches V5 §9.5.1)
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
    return { ok: true as const };
  }),

approveReview: adminProcedure
  .input(z.object({
    activationId: z.string().min(1),
    notes: z.string().max(500).optional(),
    acknowledgedConsentDiff: z.boolean(),  // see §4.5
  }))
  .mutation(async ({ input, ctx }) => {
    const actorId = ctx.session.user.adminUserId!;
    const activation = await prisma.activation.findUnique({
      where: { id: input.activationId },
      select: { id: true, reviewStatus: true, createdById: true, consentVersion: true },
    });
    if (!activation) throw new TRPCError({ code: "NOT_FOUND" });
    if (actorId === activation.createdById) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve your own activation." });
    }
    if (activation.reviewStatus !== "SUBMITTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot approve from state ${activation.reviewStatus}.` });
    }
    // Consent-diff acknowledgement is mandatory if there is a previous approval
    // and the consentVersion differs. See §4.5.
    const lastApprovedConsentVersion = await fetchLastApprovedConsentVersion(input.activationId);
    if (lastApprovedConsentVersion && lastApprovedConsentVersion !== activation.consentVersion && !input.acknowledgedConsentDiff) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Acknowledge the consent notice changes before approving.",
      });
    }
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
        metadata: { notes: input.notes ?? null, consentVersionApproved: activation.consentVersion },
        tx,
      });
    });
    return { ok: true as const };
  }),

requestChanges: adminProcedure
  .input(z.object({
    activationId: z.string().min(1),
    notes: z.string().min(1).max(500),  // notes mandatory
  }))
  .mutation(async ({ input, ctx }) => {
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
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot request changes from state ${activation.reviewStatus}.` });
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
    return { ok: true as const };
  }),
```

The `setLegalApproved` mutation is removed in Phase 2. Any client code referencing it is updated to call the new mutations.

### 4.3 Soft invalidation rules

When `activation.update` mutates an `APPROVED` activation, the update handler checks whether any **audited content field** changed. The audited set is:

```
content, consentNotice, consentItems, termsContent, ctaText, heroImageUrl,
primaryColor, name, slug, startsAt, endsAt,
successHeading, successSubheading, successContent, successSponsorContent,
successCtaLabel, successCtaUrl, successHeroImageUrl, successShowEntryCode, successShowResend
```

If any audited field changes and `reviewStatus === 'APPROVED'`, transition to `DRAFT_EDITED` in the same transaction. Approval metadata (`approvedAt`, `approvedById`, `reviewNotes`) is **preserved** so the diff view can show the approved version. Write an audit row `activation.review.invalidated_by_edit` capturing which fields changed.

Non-audited fields (e.g., `entryCodePrefix`, `timezone`, internal-only fields) do not trigger soft invalidation. The audited set is a constant in `lib/activation/auditedFields.ts`; adding a field requires a code change (governed surface).

### 4.4 UI

`ActivationFormLegal.tsx` is renamed to `ActivationFormReview.tsx` in Phase 2 (file rename) and rewritten in Phase 3. The new component shows different controls based on `(viewerRole, reviewStatus, viewerId === createdById)`:

| Viewer | Review status | What they see |
|--------|---------------|---------------|
| Creator (any role) | `DRAFT` / `CHANGES_REQUESTED` | "Submit for review" button; if `CHANGES_REQUESTED`, show reviewer's notes prominently |
| Creator (any role) | `SUBMITTED` | Status pill + "Awaiting review by another admin" message; no buttons |
| Creator (any role) | `APPROVED` | Status pill + approver name + approval timestamp; no buttons |
| Creator (any role) | `DRAFT_EDITED` | "Resubmit for review" button + "Previous approval invalidated by edits" warning + link to diff view |
| Non-creator ADMIN | `DRAFT` / `DRAFT_EDITED` | Status pill only; no buttons (creator hasn't submitted) |
| Non-creator ADMIN | `SUBMITTED` | "Approve" button + "Request changes" button + diff view (§4.5) + consent-diff acknowledgement checkbox if applicable |
| Non-creator ADMIN | `APPROVED` | Status pill + approver name + approval timestamp |
| Non-creator MEMBER | any | Status pill only (read-only); MEMBERs cannot review |

The approve/request-changes buttons are **client-side hidden** for the creator AND **server-side rejected** for the creator. UI hiding is for affordance; server enforcement is for safety. Both required.

### 4.5 Side-by-side diff for Tiptap docs

When a reviewer opens a `SUBMITTED` activation that was previously `APPROVED` (now `DRAFT_EDITED → SUBMITTED`), the form layout shifts to show:

- Left pane: **"Approved version"** — read-only `ActivationPreview` rendered from the approved snapshot
- Right pane: **"Pending version"** — read-only `ActivationPreview` rendered from current state

The approved snapshot is reconstructed from the `AuditLog` row `activation.review.approved` for the previous approval cycle. That row records `consentVersionApproved` and a JSONB `metadata.snapshot` containing the approved content fields. The snapshot is taken at approval time (Phase 2 work).

For the consent notice specifically (the field with real legal weight), a checkbox **"I have reviewed the consent notice changes"** appears beneath the diff view. The `approveReview` mutation rejects the call if `lastApprovedConsentVersion !== currentConsentVersion && !input.acknowledgedConsentDiff`. Borrowed from the QPlay "acknowledge changed fixtures" pattern at [approval-actions.tsx:212-268](../../../../../../hq-workspace/frontend_poc/hq-monorepo-poc/apps/qplay-manager/app/quick-picks/slates/[id]/_components/approval-actions.tsx).

For first-time approvals (no previous approval cycle exists), no diff is shown — the reviewer sees only the current preview.

Inline character-level diffs for plain-text fields (e.g., `ctaText`) are out of scope. Side-by-side preview only.

### 4.6 Audit log actions

New action strings, all under `category: "ADMIN"`:

| Action | Written by | Metadata |
|--------|-----------|----------|
| `activation.review.submitted` | `submitForReview` | — |
| `activation.review.approved` | `approveReview` | `notes`, `consentVersionApproved`, `snapshot` (JSONB of approved content) |
| `activation.review.changes_requested` | `requestChanges` | `notes` (mandatory) |
| `activation.review.changes_addressed` | implicit on `update` from `CHANGES_REQUESTED` | — |
| `activation.review.invalidated_by_edit` | implicit on `update` of `APPROVED` row | `changedFields` (string[]) |
| `activation.review.backfill.self_approved_demoted` | Phase 1 backfill SQL | `previousLegalApprovedAt`, `previousLegalApprovedById`, `reason` |

Old V5 actions `activation.legal.approved` / `activation.legal.revoked` are not rewritten in historical rows. New code does not write these.

### 4.7 Sidebar review-pending badge

A new `tRPC` query `activation.countPendingReviewForMe` returns the count for the current user:

```ts
countPendingReviewForMe: memberProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.adminUserId!;
  return prisma.activation.count({
    where: {
      reviewStatus: "SUBMITTED",
      createdById: { not: userId },
    },
  });
}),
```

The sidebar `Activations` nav item renders a small badge with the count when ≥ 1. Polled every 60 seconds via `useQuery({ refetchInterval: 60_000 })`. The badge is hidden for MEMBER role (MEMBERs cannot review).

---

## 5. Customisable Registration Success Page

### 5.1 Schema additions

Listed in §3.1. Two Tiptap JSON columns (`successContent`, `successSponsorContent`) plus seven flat scalars. Mirrors the registration-page split.

### 5.2 Tab-based form refactor

`ActivationForm.tsx` becomes tab-based. Tabs: **Registration page** (default) and **Success page**. The component shape:

```
ActivationForm
├── ActivationFormHeader (status badge, name input, slug, dates) — always visible
├── ActivationTabSelector (Registration | Success) — reads ?tab from URL
├── {tab === 'registration' ? <ActivationRegistrationTab /> : <ActivationSuccessTab />}
├── ActivationFormBranding (timezone, primaryColor, entryCodePrefix) — always visible
├── ActivationFormBooths — always visible (booths are activation-wide, not page-specific)
├── ActivationFormUtm — always visible
├── ActivationFormReview — always visible (review state spans the whole activation)
└── ActivationFormSaveBar — always visible
```

`ActivationRegistrationTab` wraps the V5 fields: hero image, marketing copy (Tiptap), consent items, CTA copy, T&Cs.
`ActivationSuccessTab` wraps the new fields: success hero image, heading, subheading, success content (Tiptap), CTA label, CTA URL, sponsor content (Tiptap), entry-code toggle, resend toggle.

The right-pane `ActivationPreview` reads `?preview` from URL and renders either the registration page mockup or the success page mockup. The toggle is independent from the active tab — a reviewer can edit registration content while previewing the success page.

### 5.3 URL view-state convention

```
/activations/[id]/edit?tab=registration|success&preview=registration|success
```

Defaults: `tab=registration`, `preview` = current tab.

Implementation: a small client hook `useTabUrlState()` in `lib/admin/useTabUrlState.ts` wraps `useSearchParams` + `useRouter().replace`. Replace (not push) — switching tabs is not a navigation-history event.

```ts
// lib/admin/useTabUrlState.ts
export function useTabUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (sp.get("tab") as "registration" | "success") ?? "registration";
  const preview = (sp.get("preview") as "registration" | "success") ?? tab;
  const setTab = (next: "registration" | "success") => {
    const params = new URLSearchParams(sp);
    params.set("tab", next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  const setPreview = (next: "registration" | "success") => {
    const params = new URLSearchParams(sp);
    params.set("preview", next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  return { tab, preview, setTab, setPreview };
}
```

### 5.4 Lifted state pattern

All form state (registration + success values) lives in `ActivationForm` (the parent). Tab components receive their slice as props plus a setter:

```tsx
// ActivationForm.tsx (sketch)
const [registration, setRegistration] = useState<RegistrationFormState>(initialRegistration);
const [success, setSuccess] = useState<SuccessFormState>(initialSuccess);

return (
  <>
    {/* ... */}
    {tab === "registration" ? (
      <ActivationRegistrationTab value={registration} onChange={setRegistration} />
    ) : (
      <ActivationSuccessTab value={success} onChange={setSuccess} />
    )}
    {/* ... */}
  </>
);
```

Switching tabs unmounts the inactive child but the state lives in the parent — values survive. No RHF, no FormProvider, no context. Simplest possible pattern.

Unsaved-changes guard: a `beforeunload` listener fires when the user navigates away from the page entirely (not on tab switches). Implemented in `useUnsavedChangesGuard(isDirty: boolean)` at `lib/admin/useUnsavedChangesGuard.ts`.

### 5.5 Preview pane mode toggle

`ActivationPreview` gains a small segmented control at the top:

```
┌─────────────────────────┐
│  Registration | Success │
└─────────────────────────┘
```

Backed by `?preview=` in URL (independent of `?tab=`). Both modes render an identical-fidelity mockup of what the participant sees. Success mode renders with placeholder values for entry code (`ABC123`) and masked email (`a…@example.com`).

### 5.6 Success page renderer

[src/app/(participant)/[activationSlug]/success/page.tsx](../app/(participant)/[activationSlug]/success/page.tsx) is rewritten to mirror the landing-page pattern:

- Fetches activation via `unstable_cache` with tag `activation:${slug}` (V5 pattern).
- Server-renders heading, hero image, content, sponsor content from DB.
- A small client island handles `sessionStorage` reads (entry code, masked email) and the resend button.
- Falls back to V5 hardcoded copy if the new fields are null (gracefully handles activations created before the success-page customiser shipped — i.e., everything that exists today).

Falsy field defaults:

| Field | Fallback |
|-------|----------|
| `successHeading` | `"You're on the list."` |
| `successSubheading` | (none — section omitted) |
| `successContent` | (none — section omitted) |
| `successSponsorContent` | (none — promo section omitted) |
| `successCtaLabel` | `"Open my email"` |
| `successCtaUrl` | (none — button non-functional placeholder, as today) |
| `successHeroImageUrl` | (none — hero omitted) |
| `successShowEntryCode` | `true` |
| `successShowResend` | `true` |

### 5.7 Post-create flow

When `activation.create` succeeds in `mode="create"`, the form redirects to `/activations/[id]/edit?tab=success` instead of `/activations/[id]/edit` (V5 default). A dismissible banner at the top of the success tab on first visit reads:

> Now design the page punters see after they verify. Their email and entry code are inserted automatically — you control everything else.

The banner dismissal state is local to the session (`sessionStorage` key `mrq:successTabBannerDismissed:${activationId}`). It does not persist across browsers.

---

## 6. QR Codes & UTM Tracking

### 6.1 `getActivationUrl` utility

New file `lib/url/activationUrl.ts`. Single source of truth for participant URLs. Used by:
- `ActivationFormUtm` (copy-to-clipboard URL)
- `BoothQrButton` (QR target URL)
- New campaign QR generator
- Dashboard UTM breakdown links
- `lib/qr/render.ts` (server-side QR rendering)

```ts
// lib/url/activationUrl.ts
import { env } from "@/lib/env";

export interface ActivationUrlOptions {
  boothCode?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export function getActivationUrl(activationSlug: string, options: ActivationUrlOptions = {}): string {
  const url = new URL(`/${activationSlug}`, env.PUBLIC_BASE_URL);
  if (options.boothCode) url.searchParams.set("booth", options.boothCode);
  if (options.utmSource) url.searchParams.set("utm_source", options.utmSource);
  if (options.utmMedium) url.searchParams.set("utm_medium", options.utmMedium);
  if (options.utmCampaign) url.searchParams.set("utm_campaign", options.utmCampaign);
  return url.toString();
}
```

Existing `lib/qr/render.ts` is refactored to call `getActivationUrl` instead of constructing the URL inline.

### 6.2 Booth QR fix

[ActivationFormBooths.tsx:84-86](../components/admin/activation-form/ActivationFormBooths.tsx) — replace the dead `<Button>QR ↓</Button>` with `<BoothQrButton activationId={...} boothCode={b.code} label="QR ↓" />`. `BoothQrButton` accepts an optional `label` prop for compact rendering.

### 6.3 Campaign QR

`ActivationFormUtm.tsx` gains a "Download QR" button next to the existing "Copy" button. Calls a new tRPC procedure:

```ts
// activation.ts (Iteration 2 addition)
getCampaignQrPng: adminProcedure
  .input(z.object({
    activationId: z.string().min(1),
    utmSource: z.string().max(100).optional(),
    utmMedium: z.string().max(100).optional(),
    utmCampaign: z.string().max(100).optional(),
  }))
  .query(async ({ input }) => {
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
    const filename = buildCampaignQrFilename(activation.slug, input);
    return { filename, base64: png.toString("base64") };
  }),
```

`buildCampaignQrFilename` produces e.g. `boxing-2026__email_newsletter_q1.png`. `renderQrPng(url)` is the generic version of V5's `renderBoothQrPng` extracted into `lib/qr/render.ts`.

### 6.4 Bulk ZIP export (server-side streaming)

New file `src/app/api/admin/activations/[id]/qr-zip/route.ts`. Streams a ZIP of all booth QRs for an activation. Uses `archiver` (npm package, npm-pinned in `package.json`). Authentication via `getServerSession` + ADMIN role check. The handler:

```ts
// app/api/admin/activations/[id]/qr-zip/route.ts (sketch)
import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { Readable } from "stream";
// ...
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRoleHandler(req, "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const activation = await prisma.activation.findUnique({
    where: { id },
    select: { slug: true, booths: { select: { code: true } } },
  });
  if (!activation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk) => controller.enqueue(chunk));
      archive.on("end", () => controller.close());
      archive.on("error", (err) => controller.error(err));
      (async () => {
        for (const booth of activation.booths) {
          const url = getActivationUrl(activation.slug, { boothCode: booth.code });
          const png = await renderQrPng(url);
          archive.append(png, { name: `${activation.slug}-${booth.code}.png` });
        }
        await archive.finalize();
      })();
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${activation.slug}-qrs.zip"`,
    },
  });
}
```

Constant memory: each PNG is generated, appended, flushed downstream, then garbage-collected. No buffering of the full ZIP. Audit log row `activation.qr.bulk_export` written on entry.

### 6.5 `ActivationCampaignLink` model (optional v2 — deferred)

A model to persist generated campaign URLs for dashboard attribution was discussed and **deferred** beyond Iteration 2. UTM params on registrations are already captured (V5 `Registration.utmSource/Medium/Campaign`). The dashboard breakdown in §7.4 reads from those, not from a separate link table. If a "list of generated campaign QRs" surface is desired later, a future iteration adds the model.

---

## 7. Dashboard Discoverability

### 7.1 Per-row dashboard link

[ActivationListClient.tsx](../components/admin/ActivationListClient.tsx) gains a dedicated "Dashboard →" link in each row, alongside (not replacing) the existing "Edit" button. Visible regardless of role (MEMBERs can view dashboards in V5 — confirmed by [DashboardPage:13](../app/(admin)/dashboard/[activationId]/page.tsx) using `requireRole("ANY")`).

The activation name in the row continues to link to the dashboard (V5 behaviour — preserves muscle memory).

### 7.2 Live banner on edit page

When the activation being edited has `status === 'LIVE'`, a banner at the top of the edit page reads:

> ● This activation is live. View the dashboard →

Linked to `/dashboard/${id}`. Banner is a server component — no client logic needed.

### 7.3 Sidebar "Live activations" submenu

[MainNavigationMenuItems.ts](../config/MainNavigationMenuItems.ts) — the existing `Create > Activations` group gains a sibling `Create > Live activations` link. The link target is `/?status=LIVE` (the activation list with the LIVE filter pre-applied; ActivationListClient already supports the filter). A small badge next to the link shows the count of LIVE activations (polled every 60s via tRPC).

The badge from §4.7 (peer-review pending) sits on the `Activations` link itself. Two distinct badges, two distinct queries.

### 7.4 UTM stacked bar in the dashboard

A new chart in `DashboardClient`:

```
By UTM source
─────────────
google      ████████████████░░░░░ 47
direct      ███████░░░░░░░░░░░░░░ 21
email       ███░░░░░░░░░░░░░░░░░░ 8
qr          ██░░░░░░░░░░░░░░░░░░░ 5
(no source) █░░░░░░░░░░░░░░░░░░░░ 3
```

Backed by a new field on `dashboardStats` query: `utmBreakdown: Array<{ source: string | null; count: number }>`. Aggregated server-side via `prisma.registration.groupBy({ by: ['utmSource'], _count: true, where: { activationId, status: 'VERIFIED' } })`.

### 7.5 CSV export button

The existing `/api/admin/registrations/export` endpoint (V5) is exposed as a button in the dashboard header: "Download CSV". The button hits the existing endpoint — no new backend work. Audit log row `registrations.csv.exported` already exists in V5.

---

## 8. Methodology Page

### 8.1 Route + nav placement

New route: `src/app/(admin)/methodology/page.tsx`. Server component, no client interactivity beyond TOC anchor links.

[MainNavigationMenuItems.ts](../config/MainNavigationMenuItems.ts) — add a new top-level group `Help`:

```ts
{
  id: "help",
  label: "Help",
  title: "Help",
  href: "#",
  icon: "BookOpen",
  children: [
    {
      id: "methodology",
      label: "Methodology",
      title: "Methodology",
      href: "/methodology",
      icon: "GitBranch",
    },
    {
      id: "help-existing",
      label: "Help & FAQs",
      title: "Help & FAQs",
      href: "/help",
      icon: "HelpCircle",
    },
  ],
}
```

### 8.2 Primitives

Copied from [Reports Manager methodology/page.tsx:27-89](../../../../../../hq-workspace/frontend_poc/hq-monorepo-poc/apps/reports-manager/app/(pages)/linear-command-centre/methodology/page.tsx). The five primitives are ~30 lines total. They live inline in the methodology page (not extracted to shared components) because they're single-use:

- `Section({ id, title, children })` — top-level section with heading and separator
- `SubSection({ title, children })` — nested heading
- `Steps({ items })` — ordered list
- `Callout({ type: 'tip' | 'warning' | 'info', children })` — coloured info box
- `Formula({ children })` — monospace code block (unused in v1 but kept for parity)

### 8.3 Content outline

The page covers 12 sections, written by the build agent based on the actual implemented system (not by transcribing this document):

1. Overview & terminology — activation, booth, registration, verification, entry code, peer review
2. Creating an activation — step-by-step (registration page → success page → submit for review → schedule)
3. Designing the registration page — Tiptap editor, hero, consent items, T&Cs
4. Designing the success page — fields available, where they render, fallback behaviour
5. Booths & QR codes — physical setup, how booth code propagates through the funnel, bulk QR download
6. UTM tracking — how to build campaign URLs, where they appear on the dashboard
7. Peer review process — state machine, who can submit, who can approve, what triggers re-review
8. Status lifecycle — DRAFT → SCHEDULED → LIVE → ENDED, gates, phrase confirmations (V5 §9.5)
9. Going live — pre-flight checklist
10. Reading the dashboard — what each metric means, polling cadence, drop-off interpretation
11. Data, retention & DSAR — what's stored, what's hashed, how to handle data requests (V5 §14)
12. Glossary

The agent producing this in Phase 5 reads V5 + this iteration's master prompt and writes accurate copy. The page is not a copy-paste of either document.

---

## 9. Environment Variables

**No new env vars in Iteration 2.** All work uses existing V5 env vars. The full list remains as documented in V5 §15.

The QR bulk export uses `env.PUBLIC_BASE_URL` (existing). The methodology page is static content. Peer-review and success-page features use only existing env vars.

If any phase appears to require a new env var, surface a single-concern question first. The default is to hard-code as a constant (e.g., `BANNER_DISMISSAL_KEY_PREFIX`).

---

## 10. What NOT to Do (Iteration 2 deltas to V5 §16)

V5 §16 still applies. Additions:

| Anti-pattern | Why |
|--------------|-----|
| Construct participant URLs with manual string concatenation. Always use `getActivationUrl`. | UTM/booth/slug encoding will drift between call sites and produce subtly different URLs. |
| Add a `setLegalApproved` mutation back, or a single-sided "approve" button. | Two-pair-eyes is the contract. Self-approval is a security regression. |
| Hard-clear approval on edit. Use `DRAFT_EDITED` soft state. | Hard-clear is V5 behaviour and is being removed. Clearing approval on a typo is hostile UX. |
| Add a `REVIEWER` role. | Two-pair-eyes is "any admin who is not the creator". A dedicated role is over-engineering for the current team size. |
| Generate QR ZIPs with jszip in the browser. | Locks the main thread on large activations; we deploy on Railway, server-side streaming is the right call. |
| Buffer the QR ZIP fully in memory before responding. | Defeats the streaming pattern; will OOM on activations with 100+ booths. |
| Put form values (Tiptap docs, hero URLs, etc.) in URL query params. | URL length caps, log leakage, re-render storms. URL is for view-state only. |
| Refactor `ActivationForm` to react-hook-form as part of this iteration. | Out of scope; lifted `useState` is the chosen pattern. RHF migration is a separate ticket. |
| Add an MDX dependency for the methodology page. | TSX is sufficient for a single document. MDX migration gated on a second methodology-style doc. |
| Show the review-pending sidebar badge to the activation creator. | Creates a false-positive nudge to review one's own work. Badge query filters to non-creator submissions. |
| Skip the DB CHECK constraint on the assumption that the tRPC mutation is enough. | Defence in depth is the contract. The constraint catches raw SQL, future microservices, future bugs. |
| Drop the legacy `legalApproved*` columns in Phase 1. | Expand → migrate → contract. Phase 6 is the contract step, not Phase 1. |
| Rewrite historical audit log rows from `activation.legal.*` to `activation.review.*`. | Audit logs are immutable. Old rows are the historical record of the old terminology. New rows use new names. |
| Add notifications (Slack, email) for review submissions. | Out of scope for Iteration 2. Audit log + sidebar badge are sufficient signal. |
| Introduce a third tRPC route handler exception for the QR ZIP. | The QR ZIP is a streaming binary response — Route Handler is the correct pattern (V5 §6.1 already permits binary endpoints). |

---

## 11. Phased Implementation Plan

> **Before Phase 1.** Read this entire document end-to-end. Confirm the §1 constitution (V5 + Iteration 2 deltas) is internalised. Surface ambiguities before beginning Phase 1; clarification is cheaper than refactoring at a checkpoint. Each phase has a pre-flight checklist, an implementation list, a verification checklist, an effort estimate, and a checkpoint gate. **Stop at every checkpoint.** Do not begin Phase N+1 without explicit human approval phrased exactly as `Iteration 2 Phase [N] approved — begin Iteration 2 Phase [N+1]`.

### Iteration 2 Phase 1 — Schema, Constraint, Backfill

**Effort:** 0.5 day.

**Goal.** New columns added to `Activation` and `AdminUser`, `ActivationReviewStatus` enum created, CHECK constraint added, production data backfilled, no application code changes yet (old `setLegalApproved` still works, new fields are populated but unread).

**Pre-flight:**
- [ ] V5 build is at the production-deployed state (no in-flight V5 work blocking this iteration)
- [ ] Database snapshot taken (rollback safety net for the backfill)
- [ ] Iteration 2 master prompt + execution template read

**Implementation:**
- Update `prisma/schema.prisma` per §3.1:
  - Add `ActivationReviewStatus` enum
  - Add success-page fields to `Activation`
  - Add peer-review fields to `Activation`
  - Add `@@index([reviewStatus, createdById])` on `Activation`
  - Add new relation back-references on `AdminUser`
  - **Keep** all `legalApproved*` fields and the `LegalApprover` relation (removed in Phase 6)
- Generate migration with `pnpm prisma migrate dev --create-only --name iteration_2_schema_expand`
- **Hand-edit the generated migration SQL** to:
  - Add the CHECK constraint per §3.2 (Prisma does not generate CHECK constraints)
  - Add the backfill SQL per §3.3 (run inside the same transaction as the column adds)
- Apply the migration to a local database
- Apply to staging
- **Do not apply to production until Phase 6 is ready** — production runs Phase 1 + Phase 6 atomically as a coordinated cutover. Wait — actually correction: production runs Phase 1's migration immediately (the new columns are additive and safe) and Phase 6's migration after Phase 5 ships. See "Production rollout" notes below.

**Verification:**
- [ ] `pnpm prisma migrate dev` applies cleanly to a fresh DB (smoke)
- [ ] Migration applies cleanly to a database snapshot of production (proves backfill works on real data)
- [ ] After backfill: every row that had `legalApproved=true AND legalApprovedById<>createdById` now has `reviewStatus='APPROVED'` with matching `approvedAt`/`approvedById`
- [ ] After backfill: every row that had `legalApproved=true AND legalApprovedById=createdById` now has `reviewStatus='DRAFT'` and an audit row `activation.review.backfill.self_approved_demoted`
- [ ] CHECK constraint rejects `INSERT INTO "Activation" (..., "approvedById", "createdById", ...) VALUES (..., 'X', 'X', ...)` (run a manual psql test)
- [ ] CHECK constraint rejects `UPDATE "Activation" SET "approvedById" = "createdById"` (run a manual psql test)
- [ ] `EXPLAIN ANALYZE` on the sidebar-badge query (`SELECT count(*) FROM "Activation" WHERE "reviewStatus" = 'SUBMITTED' AND "createdById" <> 'X'`) uses the new index
- [ ] `pnpm typecheck` clean (Prisma Client regenerated; new types compile)
- [ ] `pnpm test` clean (existing tests still pass; no application code changed)
- [ ] No application code references the new columns yet (grep `reviewStatus`, `submittedAt`, `successHeading` returns only `prisma/schema.prisma` and the migration file)

**Sections to internalise:** §1, §3 (entire), §11 Phase 1, §11 Phase 6 (forward awareness for the cutover plan), V5 §5, V5 §16.

**Production rollout note.** The Phase 1 migration is purely additive (new columns, new constraint, new index) and safe to apply to production immediately after staging verification. The application code does not yet read the new columns, so there is no lockstep deployment requirement. Phase 6's migration (column drops) is the irreversible step and runs only after Phases 2–5 are deployed and stable.

**Checkpoint:** `Iteration 2 Phase 1 approved — begin Iteration 2 Phase 2`

---

### Iteration 2 Phase 2 — tRPC Mutations + Audit + Soft Invalidation

**Effort:** 1 day.

**Goal.** New tRPC mutations live (`submitForReview`, `approveReview`, `requestChanges`). Status state machine reads `reviewStatus` instead of `legalApproved`. Soft-invalidation logic added to `activation.update`. `setLegalApproved` removed. Tests covering the two-pair-eyes server enforcement.

**Pre-flight:**
- [ ] Iteration 2 Phase 1 approved
- [ ] Phase 1 migration applied to local + staging

**Implementation:**
- Add `lib/activation/auditedFields.ts` — exports `AUDITED_CONTENT_FIELDS: readonly string[]` per §4.3
- Add `lib/activation/reviewSnapshot.ts` — helper `buildReviewSnapshot(activation): JsonValue` that captures the audited-field set as a JSON snapshot for audit metadata
- Update `src/server/trpc/routers/activation.ts`:
  - Add `submitForReview`, `approveReview`, `requestChanges`, `countPendingReviewForMe` per §4.2 / §4.7
  - Update `transitionStatus`: replace `legalApproved` check with `reviewStatus === 'APPROVED'` check
  - Update `update`: detect changes to audited fields; if `reviewStatus === 'APPROVED'`, set to `DRAFT_EDITED` and write `activation.review.invalidated_by_edit` audit row with `changedFields` metadata; if `reviewStatus === 'CHANGES_REQUESTED'`, set to `DRAFT` and write `activation.review.changes_addressed`
  - Update `update`: when transitioning to `APPROVED` (in `approveReview`), capture `buildReviewSnapshot` into the audit row's `metadata.snapshot`
  - Remove `setLegalApproved` mutation entirely
- Add helper `lib/activation/lastApprovedConsentVersion.ts` — fetches the most recent `activation.review.approved` audit row's `metadata.consentVersionApproved`, used by `approveReview` to check whether consent-diff acknowledgement is required
- Update `src/components/admin/StatusTransitionDialog.tsx`: replace any `legalApproved` references with `reviewStatus === 'APPROVED'`
- Update `src/components/admin/activation-form/ActivationFormLegal.tsx` — **rename file** to `ActivationFormReview.tsx` and **temporarily** keep the old approve/revoke UI working against the new mutations (full rewrite lands in Phase 3). Update import in `ActivationForm.tsx`. The old `<ActivationFormLegal>` prop interface (`legalApproved`, `legalApprovedAt`, `onApprovalChange`) is replaced with `(reviewStatus, submittedAt, approvedAt, onReviewChange)`.
- Add tRPC tests in `src/server/trpc/routers/__tests__/activation.review.test.ts`:
  - `submitForReview` rejects non-creator
  - `approveReview` rejects creator (`actorId === createdById`)
  - `approveReview` rejects without consent-diff acknowledgement when consent has changed
  - `requestChanges` rejects creator
  - `requestChanges` requires `notes`
  - `update` of `APPROVED` activation transitions to `DRAFT_EDITED` and writes audit row
  - `update` of `CHANGES_REQUESTED` activation transitions to `DRAFT` and writes audit row
  - State machine: invalid transitions throw `BAD_REQUEST`
- Add unit tests for `lib/activation/auditedFields.ts` and `lib/activation/reviewSnapshot.ts`

**Verification:**
- [ ] `pnpm test` passes; new test file has ≥ 90% coverage on `activation.ts` review mutations
- [ ] Manual: ADMIN A creates an activation, submits for review. ADMIN A cannot approve (UI button hidden + tRPC throws `FORBIDDEN`). ADMIN B can approve.
- [ ] Manual: After ADMIN B approves, ADMIN A edits the marketing copy. Activation transitions to `DRAFT_EDITED`. Approval metadata (`approvedAt`, `approvedById`) is preserved in the row.
- [ ] Manual: `transitionStatus` `DRAFT → SCHEDULED` is now gated by `reviewStatus === 'APPROVED'` (not `legalApproved`). An activation in `DRAFT_EDITED` cannot be scheduled.
- [ ] Audit log contains rows for `activation.review.submitted`, `.approved`, `.changes_requested`, `.changes_addressed`, `.invalidated_by_edit` after the manual flow above
- [ ] `setLegalApproved` is gone — grep returns no matches in `src/server/`
- [ ] `pnpm typecheck` clean
- [ ] No app code reads `legalApproved` (grep returns only `schema.prisma`, the Phase 1 migration, and the legacy column definition; UI/tRPC/Prisma queries all use `reviewStatus`)

**Sections to internalise:** §1, §4 (entire), §10 (anti-patterns), V5 §6, V5 §9.5, V5 §9.5.1.

**Checkpoint:** `Iteration 2 Phase 2 approved — begin Iteration 2 Phase 3`

---

### Iteration 2 Phase 3 — Review UI + Side-by-Side Preview + Sidebar Badge

**Effort:** 1.5 days.

**Goal.** Full role-aware peer-review UI live. Side-by-side diff for previously-approved activations. Consent-diff acknowledgement checkbox. Sidebar badge for review-pending count.

**Pre-flight:**
- [ ] Iteration 2 Phase 2 approved
- [ ] All Phase 2 mutations deployed to staging

**Implementation:**
- Rewrite `src/components/admin/activation-form/ActivationFormReview.tsx` per §4.4:
  - Read `(viewerRole, viewerId, reviewStatus, createdById)` and render the appropriate UI variant
  - Submit button (creator, DRAFT/CHANGES_REQUESTED/DRAFT_EDITED)
  - Approve + Request changes buttons (non-creator ADMIN, SUBMITTED)
  - Status pill + reviewer name + timestamp (APPROVED)
  - Reviewer notes display (CHANGES_REQUESTED)
  - "Awaiting review" message (creator, SUBMITTED)
- Add `src/components/admin/activation-form/ActivationReviewDiff.tsx` per §4.5:
  - Side-by-side `ActivationPreview` panes (left: approved snapshot, right: current pending)
  - Reads approved snapshot from latest `activation.review.approved` audit row's `metadata.snapshot`
  - Hidden when no previous approval exists (first-time approval)
  - Includes the consent-diff acknowledgement checkbox when `lastApprovedConsentVersion !== currentConsentVersion`
- Add tRPC procedure `activation.getLastApprovedSnapshot` (memberProcedure) returning `{ snapshot: JsonValue | null, consentVersionApproved: string | null }` for the diff view
- Update `src/components/admin/activation-form/ActivationPreview.tsx`:
  - Accept a `mode: 'edit' | 'readonly-diff'` prop
  - In `readonly-diff` mode, render with no editor affordances
- Update `src/components/admin/StatusTransitionDialog.tsx`:
  - Block `DRAFT → SCHEDULED` when `reviewStatus !== 'APPROVED'` with a clear message linking to the review section
- Add `src/components/shared/SidebarBadge.tsx` — generic numeric badge component
- Update `src/components/shared/sidebar-nav.tsx` to render the badge for nav items with a `badge?: { count: number }` prop
- Update `src/config/MainNavigationMenuItems.ts`: add a `badgeQueryKey: 'pendingReview'` field on the `Activations` nav item (drives the badge)
- Add a small client component `src/components/shared/SidebarBadgeFetcher.tsx` that calls `trpc.activation.countPendingReviewForMe` every 60s and feeds the count to the matching nav item
- Update `src/app/(admin)/layout.tsx` to mount `SidebarBadgeFetcher`
- Add E2E test `e2e/peer-review.spec.ts`:
  - User A creates and submits an activation
  - User A sees "Awaiting review" message; no Approve button rendered
  - User B logs in, sees the activation in pending review
  - User B opens the activation, sees Approve and Request Changes buttons
  - User B requests changes with notes
  - User A sees the notes and the activation in `CHANGES_REQUESTED` state
  - User A edits and resubmits
  - User B approves; activation transitions to `APPROVED`
  - User A edits the consent notice; activation transitions to `DRAFT_EDITED`
  - User A resubmits
  - User B opens the diff view, sees the consent-diff acknowledgement checkbox, ticks it, approves

**Verification:**
- [ ] Playwright E2E `e2e/peer-review.spec.ts` passes
- [ ] Sidebar badge renders the correct count for ADMIN users; hidden for MEMBER users
- [ ] Sidebar badge polls every 60 seconds (verify via network tab)
- [ ] Sidebar badge does not include activations created by the current user
- [ ] Diff view renders only when a previous approval exists (audit row `activation.review.approved`)
- [ ] Consent-diff checkbox is required only when consent version differs from last approval
- [ ] Approve button is not rendered to the creator (DOM-level check, not just disabled)
- [ ] Manual: a MEMBER role user sees the review section as read-only (no submit/approve buttons)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

**Sections to internalise:** §1, §4 (entire), §5.5 (preview pane), V5 §9.4, V5 §9.5.1.

**Checkpoint:** `Iteration 2 Phase 3 approved — begin Iteration 2 Phase 4`

---

### Iteration 2 Phase 4 — Success Page Customiser + Tab Form + Lifted State

**Effort:** 2 days.

**Goal.** `ActivationForm` is tab-based with URL-backed view-state and lifted parent state. Success page is fully customisable from the admin. New success page renderer in `(participant)` with caching parity to the landing page. Post-create redirect to the success tab. Backwards-compatible fallback for activations with null success-page fields.

**Pre-flight:**
- [ ] Iteration 2 Phase 3 approved
- [ ] Phases 1–3 deployed to staging

**Implementation:**
- Add `lib/admin/useTabUrlState.ts` per §5.3
- Add `lib/admin/useUnsavedChangesGuard.ts` per §5.4
- Refactor `src/components/admin/ActivationForm.tsx`:
  - Lift state into typed groups: `RegistrationFormState` (V5 fields) and `SuccessFormState` (new fields)
  - Add tab selector reading/writing `?tab` via `useTabUrlState`
  - Mount `<ActivationRegistrationTab>` or `<ActivationSuccessTab>` based on `tab`
  - Mount the always-visible sections (Header, Branding, Booths, UTM, Review, SaveBar) outside the tab boundary
  - Wire `useUnsavedChangesGuard(isDirty)` for `beforeunload`
- Extract V5 registration-page fields into `src/components/admin/activation-form/ActivationRegistrationTab.tsx` (Hero image, Marketing copy, Consent items, CTA copy, T&Cs)
- Add `src/components/admin/activation-form/ActivationSuccessTab.tsx` (Success hero image, Success heading, Success subheading, Success content, Success CTA label, Success CTA URL, Success sponsor content, entry-code toggle, resend toggle)
- Update `src/components/admin/activation-form/ActivationPreview.tsx`:
  - Add `?preview` toggle (segmented control at top)
  - Add success-page mockup mode rendering placeholders for entry code (`ABC123`) and masked email (`a…@example.com`)
- Update `src/server/trpc/routers/activation.ts` `ActivationWriteSchema`:
  - Add success-page fields with appropriate Zod validators
  - `successContent` and `successSponsorContent` validated against `CONTENT_ALLOWLIST` (loose Tiptap allowlist)
- Update `activation.create` and `activation.update` to read/write the new success-page fields
- Update `activation.create` to redirect to `/activations/[id]/edit?tab=success` (already handled in the form's `router.push`)
- Add `src/components/admin/activation-form/SuccessTabBanner.tsx` — dismissible "Now design the page punters see..." banner shown on first visit to the success tab post-create
- Rewrite `src/app/(participant)/[activationSlug]/success/page.tsx` per §5.6:
  - Fetch activation via `unstable_cache` with tag `activation:${slug}` (mirrors V5 landing page)
  - Server-render heading, hero, content, sponsor content
  - Client island `<SuccessSessionData>` reads sessionStorage (entry code, masked email) and renders the resend button
  - Falsy field defaults per §5.6 table
- Add `src/components/participant/SuccessSessionData.tsx` (the client island)
- Update `revalidateTag('activation:${slug}')` calls in `activation.update` if not already firing on success-page field changes (verify the existing pattern from V5 still works)
- Add E2E test `e2e/success-page-customiser.spec.ts`:
  - Create an activation with custom success-page heading, content, sponsor block
  - Verify the participant success page renders the custom values
  - Verify the fallback behaviour: an activation with null success fields renders the V5 defaults
  - Verify the post-create redirect lands on `?tab=success`
  - Verify URL view-state: switching tabs updates `?tab=`; refreshing the page restores the tab; `?tab=success` deep link works
  - Verify form values survive tab switches (type into success tab, switch to registration, switch back, value still there)

**Verification:**
- [ ] Playwright E2E `e2e/success-page-customiser.spec.ts` passes
- [ ] Existing E2E tests still pass (no regressions to V5 flows)
- [ ] Manual: an existing activation (created under V5, all success fields null) renders the V5 hardcoded success page (fallback works)
- [ ] Manual: a new activation with custom success heading + content renders those values
- [ ] Manual: switching tabs updates `?tab=` without scroll/full-page reload
- [ ] Manual: `?preview=success` shows the success preview while editing the registration tab
- [ ] Manual: `beforeunload` fires when leaving the page with unsaved changes; does not fire on tab switches
- [ ] Soft-invalidation works for new success fields: editing `successHeading` on an `APPROVED` activation transitions to `DRAFT_EDITED`
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

**Sections to internalise:** §1, §5 (entire), §4.3 (soft invalidation), V5 §3.4 (component conventions), V5 §9.2 (Tiptap allowlists).

**Checkpoint:** `Iteration 2 Phase 4 approved — begin Iteration 2 Phase 5`

---

### Iteration 2 Phase 5 — QR/UTM + Dashboard Discoverability + Methodology

**Effort:** 1.5 days.

**Goal.** Booth QR button works. Campaign QR generator live. Bulk QR ZIP export streaming. Dashboard discoverability (per-row link, live banner, sidebar submenu, UTM breakdown, CSV button). Methodology page live and linked from the sidebar.

**Pre-flight:**
- [ ] Iteration 2 Phase 4 approved
- [ ] Phases 1–4 deployed to staging
- [ ] `archiver` package added to `package.json` (run `pnpm add archiver` and `pnpm add -D @types/archiver`)

**Implementation:**

*QR / UTM:*
- Add `lib/url/activationUrl.ts` per §6.1
- Refactor `lib/qr/render.ts`: extract a generic `renderQrPng(url: string): Promise<Buffer>`; refactor `renderBoothQrPng` to call `renderQrPng(getActivationUrl(slug, { boothCode }))`
- Refactor `src/components/admin/activation-form/ActivationFormUtm.tsx` to call `getActivationUrl` instead of inline string concatenation
- Wire `<BoothQrButton>` into `src/components/admin/activation-form/ActivationFormBooths.tsx` (replace dead `<Button>QR ↓</Button>`)
- Add `getCampaignQrPng` tRPC procedure to `src/server/trpc/routers/activation.ts` per §6.3
- Add a "Download QR" button to `ActivationFormUtm.tsx` next to the existing "Copy" button — calls `getCampaignQrPng` and triggers a download
- Add `lib/qr/zipStream.ts` — exports a helper `streamBoothQrZip(activationId): ReadableStream` that constructs the streaming archive (centralised pattern)
- Add `src/app/api/admin/activations/[id]/qr-zip/route.ts` per §6.4 (calls `streamBoothQrZip`)
- Add a "Download all booth QRs (zip)" button on the activation edit page (in the booths section) — links to the route
- Audit log row `activation.qr.bulk_export` written from the route handler

*Dashboard discoverability:*
- Update `src/components/admin/ActivationListClient.tsx`:
  - Add a "Dashboard →" button in each row alongside Edit
- Update `src/app/(admin)/activations/[id]/edit/page.tsx`:
  - Render a "View live dashboard →" banner when `status === 'LIVE'`
- Update `src/config/MainNavigationMenuItems.ts`:
  - Add `Create > Live activations` link with `/?status=LIVE`
  - Add a `badgeQueryKey: 'liveCount'` to drive a sidebar count badge
- Add `activation.countLive` tRPC procedure (memberProcedure) — `prisma.activation.count({ where: { status: 'LIVE' } })`
- Update `src/components/shared/SidebarBadgeFetcher.tsx` to fetch both `pendingReview` (from Phase 3) and `liveCount`
- Update `src/server/trpc/routers/registration.ts` `dashboardStats` query:
  - Add `utmBreakdown: Array<{ source: string | null; count: number }>` aggregated server-side
- Update `src/components/admin/DashboardClient.tsx`:
  - Add a UTM stacked bar chart per §7.4 (use the existing per-booth chart pattern as a template)
  - Add a "Download CSV" button in the header linking to `/api/admin/registrations/export?activationId=...`

*Methodology:*
- Add `src/app/(admin)/methodology/page.tsx` per §8 (server component, TSX, primitives inline)
- Update `src/config/MainNavigationMenuItems.ts`: add the `Help` group per §8.1
- Verify TOC anchor links scroll to the correct sections (`scroll-mt-20` on each `<Section>` to clear the header)

*Tests:*
- Add tRPC test `src/server/trpc/routers/__tests__/activation.qr.test.ts`:
  - `getCampaignQrPng` returns a valid PNG (decode with `qrcode.toString` and verify the encoded URL)
  - `getCampaignQrPng` URL matches `getActivationUrl` output exactly (UTM params correctly appended)
- Add unit test `lib/url/__tests__/activationUrl.test.ts`:
  - All combinations of optional params (booth, source, medium, campaign) produce expected URLs
  - Empty string params are not appended
  - URL encoding is correct for special characters

**Verification:**
- [ ] Manual: click "QR ↓" on a booth row — PNG downloads; opening it scans to the correct URL with the correct booth code
- [ ] Manual: enter UTM params in the builder; click "Download QR" — PNG downloads; opening it scans to the URL with all UTM params
- [ ] Manual: click "Download all booth QRs (zip)" on an activation with 5+ booths — ZIP downloads, contains one PNG per booth, filenames match `${slug}-${code}.png`
- [ ] Manual: with an activation in LIVE state, the edit page shows the live dashboard banner; clicking it navigates to the dashboard
- [ ] Manual: sidebar shows two badges (pending review + live count) where applicable
- [ ] Manual: dashboard shows the UTM stacked bar with correct counts
- [ ] Manual: dashboard "Download CSV" button works
- [ ] Manual: navigate to `/methodology` — page renders, TOC links scroll correctly
- [ ] `pnpm test` passes; new tests pass
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] Memory check on bulk ZIP: generate a ZIP for an activation with 50+ synthetic booths; observe Railway memory in real time; should stay roughly constant (< 200 MB delta) during the response

**Sections to internalise:** §1, §6 (entire), §7 (entire), §8 (entire), §10 (anti-patterns).

**Checkpoint:** `Iteration 2 Phase 5 approved — begin Iteration 2 Phase 6`

---

### Iteration 2 Phase 6 — Cutover & Cleanup

**Effort:** 0.25 day.

**Goal.** Drop legacy `legalApproved*` columns from `Activation`. Remove the `LegalApprover` relation from `AdminUser`. Remove all V5 references in code, schema, and seed. Iteration 2 complete.

**Pre-flight:**
- [ ] Iteration 2 Phase 5 approved
- [ ] Phases 1–5 deployed to production for ≥ 1 week without rollback
- [ ] No application code references `legalApproved`, `legalApprovedAt`, `legalApprovedById`, `legalApprovalNotes`, or `LegalApprover` (grep proven clean)
- [ ] Database snapshot taken (rollback safety net)

**Implementation:**
- Update `prisma/schema.prisma`:
  - Remove `legalApproved`, `legalApprovedAt`, `legalApprovedBy`, `legalApprovedById`, `legalApprovalNotes` from `Activation`
  - Remove `activationsLegalApproved` from `AdminUser`
- Generate migration with `pnpm prisma migrate dev --create-only --name iteration_2_drop_legacy_columns`
- Apply locally and to staging
- Update any seed file references in `prisma/seed.ts` (likely none, but verify)
- Final grep sweep:
  - `grep -r "legalApprov" src/ prisma/` → no matches
  - `grep -r "LegalApprover" src/ prisma/` → no matches
  - `grep -r "setLegalApproved" src/` → no matches (already gone since Phase 2)

**Verification:**
- [ ] Migration applies cleanly to a database snapshot of production
- [ ] All E2E tests pass (peer-review, success-page, QR, dashboard)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` clean
- [ ] `pnpm lint` clean
- [ ] Production deploy succeeds; no errors in Sentry related to the schema change in the first 60 minutes

**Sections to internalise:** §3.4, §10 (anti-patterns relevant to cutover).

**Checkpoint (closing):** `Iteration 2 Phase 6 approved — Iteration 2 complete`

---

### Aggregate Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1 — Schema, Constraint, Backfill | 0.5 d | Medium (production data backfill) |
| Phase 2 — tRPC Mutations + Audit + Soft Invalidation | 1.0 d | Medium (replaces hot-path mutations) |
| Phase 3 — Review UI + Diff + Sidebar Badge | 1.5 d | Low (UI on top of stable APIs) |
| Phase 4 — Success Page Customiser | 2.0 d | Low (additive feature) |
| Phase 5 — QR/UTM + Dashboard + Methodology | 1.5 d | Low (additive features + bug fix) |
| Phase 6 — Cutover & Cleanup | 0.25 d | Low (additive removal after stable deploy) |
| **Total** | **~6.75 days** | |

---

## 12. Known Gotchas (Iteration 2 additions to V5 §18)

V5 §18 still applies. New gotchas surfaced by this iteration:

### Prisma + CHECK constraints
- Prisma's schema.prisma cannot declaratively express CHECK constraints. The constraint must be added via raw SQL in the migration file. Re-running `prisma migrate dev` will not regenerate or alter it — manage it as hand-written SQL.
- If `prisma db push` is ever run (don't), it will not respect or recreate the constraint. The constraint exists only because Phase 1's migration created it.

### Prisma + JSON column updates
- When updating a JSON column via Prisma, passing `null` to a nullable JSON column requires `Prisma.DbNull` (not JS `null`). The success-page Tiptap fields (`successContent`, `successSponsorContent`) need this — pattern matches V5's `termsContent` handling at [activation.ts:181](../server/trpc/routers/activation.ts).

### `archiver` + Next.js streams
- `archiver` emits Node `Buffer` chunks. To stream from a Next.js Route Handler, wrap with `ReadableStream` and `controller.enqueue(chunk)`. Do not return the `archiver` instance directly.
- Always call `archive.finalize()` and await it inside the stream's `start` callback. Forgetting to finalize causes the stream to hang indefinitely.
- Errors during ZIP generation must be propagated via `controller.error(err)` — otherwise the client receives a truncated, corrupt ZIP with no error indication.

### `useSearchParams` + Suspense
- Next.js 16 requires `useSearchParams` to be wrapped in `<Suspense>` at the page level. The tab-state hook lives inside `ActivationForm` which is a client component; ensure the page component (`/activations/[id]/edit/page.tsx`) wraps it in `<Suspense>` if not already.

### `revalidateTag` and the success page
- The new success page uses the same `activation:${slug}` cache tag as the landing page. Verify that `activation.update` calls `revalidateTag('activation:${slug}')` after the update. If V5 doesn't already do this (check current `activation.update` implementation), add it as part of Phase 4 — otherwise edits to success-page fields won't be visible to participants until the cache TTL expires.

### Backfill + the CHECK constraint
- The Phase 1 backfill SQL must demote self-approved rows to `DRAFT` (clearing `approvedById` to null) **before** the CHECK constraint is added. If the CHECK constraint runs first, the backfill `UPDATE` for self-approved rows will fail (no row will populate `approvedById = createdById`, but the demotion doesn't violate it either — the failure mode is actually the opposite: the CHECK is added, then nothing fails). Order of operations in the migration file matters; follow §3.3 exactly.

### Soft invalidation + concurrent updates
- If two reviewers race (one approves while another edits), the soft-invalidation logic in `update` must run inside the same transaction as the row update to avoid a lost-update bug. Pattern: read `reviewStatus` inside the transaction, decide on `DRAFT_EDITED` transition inside the transaction, write inside the transaction. Use `tx.activation.findUnique` and `tx.activation.update` together.

### Sidebar badge + role check
- The badge query `countPendingReviewForMe` is a `memberProcedure`, but the badge UI should be hidden entirely for MEMBER role users (they cannot approve). Hide via the existing `RequireRole` capability check on the badge component. Don't conditionally render based on the count — render the badge wrapper conditionally on role, then conditionally on count > 0.

---

## Appendix A — Design Decisions & Rationale

This appendix records the design exchanges that produced this document. It exists to explain *why* the choices in §1–§10 were made, so future readers don't re-litigate settled calls.

### A.1 Initial review findings (senior fullstack review)

A senior fullstack engineer reviewed the V5 codebase and identified five concerns:

1. **Registration success page is hardcoded.** The participant success page at [src/app/(participant)/[activationSlug]/success/page.tsx](../app/(participant)/[activationSlug]/success/page.tsx) is a 177-line static React component. Creators can fully customise the landing page but cannot touch what the participant sees after verification. **Recommendation:** make it customisable using the same Tiptap + JSON column pattern as the landing page.

2. **"Legal approval" allows self-approval.** The `setLegalApproved` mutation accepts any ADMIN caller, including the activation creator. This violates segregation of duties. The naming is also a misnomer — there is no legal-team workflow. **Recommendation:** replace with a true peer-review state machine, copying the QPlay slate two-eyes pattern (`require(slate.createdBy != approvedBy)` at [SlateService.kt:71](../../../../../../hq-workspace/backend_poc/quickpicks-game-service/src/main/kotlin/io/qplay/quickpicksgameservice/service/SlateService.kt)).

3. **QR code button is dead.** [ActivationFormBooths.tsx:84-86](../components/admin/activation-form/ActivationFormBooths.tsx) renders a `QR ↓` button with no `onClick`. UTM params are never baked into QRs. **Recommendation:** wire the existing `BoothQrButton`, add a campaign QR generator, centralise URL construction in a `getActivationUrl` utility.

4. **Dashboard is hidden.** The dashboard exists but is reachable only by clicking the activation name in the list. **Recommendation:** add per-row links, live-state banner on edit page, sidebar submenu, UTM breakdown.

5. **No methodology page.** Reports Manager has a comprehensive methodology page at [methodology/page.tsx](../../../../../../hq-workspace/frontend_poc/hq-monorepo-poc/apps/reports-manager/app/(pages)/linear-command-centre/methodology/page.tsx) (838 lines). **Recommendation:** add equivalent for the activation tool.

### A.2 Peer review (settled choices)

A second senior engineer reviewed the proposal and pushed back on five points. The settled outcomes:

| Topic | Initial proposal | Counter-proposal | Settled outcome | Rationale |
|-------|------------------|------------------|-----------------|-----------|
| Success-page schema | 9+ flat columns | Single `successConfig` JSONB | Mirror existing convention: Tiptap docs in JSON cols, scalars flat | Existing pattern for the landing page mixes both. A third pattern is the worst option. Future refactor unifies both pages, not just one. |
| Approval invalidation | Hard-clear approval on any edit | Soft `DRAFT_EDITED` state + diff view | Soft state, **side-by-side preview** for diff (no inline character diff in v1) | Hard-clear is hostile UX (typo wipes approval). Soft state preserves history; diff view lets reviewer focus on actual changes. Inline char diff is v2 polish. |
| QR ZIP generation | Server-side `archiver` streaming | Client-side `jszip` + Web Worker | Server-side `archiver` streaming | Deployment is Railway (long-running Node, not serverless). Server streaming uses constant memory. Client-side requires a Web Worker to avoid main-thread freeze; not a free lunch. |
| Methodology format | TSX (copy Reports Manager primitives) | MDX | TSX for v1; MDX migration when a second methodology-style doc exists | One doc doesn't justify MDX tooling cost. Migration is mechanical. |
| Form state | Lifted `useState` | React Hook Form + FormProvider | Lifted `useState` | RHF migration is a separate ticket; introducing it mid-feature is scope creep. The "don't lose unsaved changes" concern is solved by lifting state to the parent. |
| Self-approval enforcement | tRPC middleware throws `FORBIDDEN` | Add Postgres CHECK constraint | Both layers required (defence in depth) | DB constraint catches raw SQL, future microservices, future bugs. tRPC catches the common path. Both is the contract. |
| Sidebar review badge | Show count to all admins | Filter to non-creator submissions | Filter to non-creator submissions | Showing the creator their own pending submission creates a false-positive nudge to review one's own work. |

### A.3 Form-state URL question (settled)

A third question arose: could form state be persisted via the URL? The settled answer:

- **URL holds view-state only** (`?tab=`, `?preview=`). Implemented via `useSearchParams` + `router.replace`. Tab switching becomes shareable, browser-back works, refresh-safe.
- **React state holds form values.** Tiptap docs, hero URLs, consent items, etc. cannot live in URLs (length limits, log leakage, re-render storms on every keystroke).
- Lifted parent `useState` keeps form values alive across tab switches without RHF.
- `beforeunload` listener for unsaved-changes guard.

### A.4 Migration shape (settled)

Production data exists. The migration follows **expand → migrate → contract**:

- **Phase 1 (expand):** add new columns, add CHECK constraint, backfill production data, keep old columns. Application code unchanged.
- **Phases 2–5 (migrate):** application code reads/writes new columns. Old columns become dead.
- **Phase 6 (contract):** drop old columns. Schema is clean.

This pattern allows production rollout in three independent deploys (Phase 1 migration → Phase 2–5 application changes → Phase 6 migration), each rollback-safe in isolation.

### A.5 Phase chunking (settled)

Two options were discussed:

- **Coarse (4 phases):** one phase per concern (peer review / success page / QR-dashboard / methodology). Each ~1.5–2 days.
- **Fine (6 phases):** schema separated from logic, logic separated from UI, methodology bundled with smaller features, cleanup as its own phase. Each ~0.25–2 days.

**Settled outcome:** fine (6 phases). Each phase fits in one half-day or full-day reviewable session. Schema migration alone deserves its own checkpoint — irreversible damage lives there.

### A.6 Iteration numbering (settled)

V5 phases ran 1 → 8 with closing phrase `Phase 8 approved — build complete`. Iteration 2 uses a fresh, prefixed numbering: `Iteration 2 Phase 1` through `Iteration 2 Phase 6`. Closing phrase: `Iteration 2 Phase 6 approved — Iteration 2 complete`. Separate prefix prevents ambiguity in audit logs, PR titles, and conversational shorthand.

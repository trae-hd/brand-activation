# MrQ Live Activation Platform — Iteration 2 Phase 1: Schema, Constraint, Backfill

You are the builder for **Iteration 2** of the MrQ Live Activation Platform. Begin Iteration 2 Phase 1.

---

## Operating context

Read these documents before writing any code:

1. **`MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md`** — the constitution for Iteration 2. Single source of truth for the schema deltas, the peer-review system design, the success-page customiser, the QR/UTM work, the dashboard discoverability changes, the methodology page, and the six-phase plan. Read end-to-end.
2. **`MRQ_LIVE_ACTIVATION_ITERATION_2_EXECUTION_TEMPLATE.md`** — your operating manual for Iteration 2. Re-read at the start of every phase.
3. **`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`** — the V5 constitution. Iteration 2 inherits everything in V5 unless explicitly overridden in the Iteration 2 master. Read §1 (constitution), §3.2 (folder structure), §5 (Prisma schema), §9.5.1 (audit writer), §16 (anti-patterns), §17 (V5 phase plan, for context only — V5 is shipped), §18 (gotchas).
4. **`MRQ_LIVE_ACTIVATION_LITE_EXECUTION_TEMPLATE.md`** — the V5 operating manual. Read once at the start of Iteration 2 Phase 1 to internalise the conventions; the Iteration 2 execution template supersedes it for Iteration 2 work.

Confirm in your first message that you have read items 1, 2, and 3 in full and item 4 at least once.

---

## Phase 1 scope (verbatim from §11 of the Iteration 2 master prompt)

### Iteration 2 Phase 1 — Schema, Constraint, Backfill

**Effort:** 0.5 day.

**Goal.** New columns added to `Activation` and `AdminUser`, `ActivationReviewStatus` enum created, CHECK constraint added, production data backfilled, no application code changes yet (old `setLegalApproved` still works, new fields are populated but unread).

**Pre-flight:**
- [ ] V5 build is at the production-deployed state (no in-flight V5 work blocking this iteration)
- [ ] Database snapshot taken (rollback safety net for the backfill)
- [ ] Iteration 2 master prompt + execution template read

**Implementation:**
- Update `prisma/schema.prisma` per Iteration 2 master §3.1:
  - Add `ActivationReviewStatus` enum
  - Add success-page fields to `Activation` (the eight columns: `successHeading`, `successSubheading`, `successContent`, `successSponsorContent`, `successCtaLabel`, `successCtaUrl`, `successHeroImageUrl`, `successShowEntryCode`, `successShowResend`)
  - Add peer-review fields to `Activation` (`reviewStatus`, `submittedAt`, `submittedBy` relation + `submittedById`, `approvedAt`, `approvedBy` relation + `approvedById`, `reviewNotes`)
  - Add `@@index([reviewStatus, createdById])` on `Activation`
  - Add new relation back-references on `AdminUser` (`activationsReviewSubmitted`, `activationsReviewApproved`)
  - **Keep** all `legalApproved*` fields and the `LegalApprover` relation on both models (removed in Phase 6)
- Generate migration with `pnpm prisma migrate dev --create-only --name iteration_2_schema_expand`
- **Hand-edit the generated migration SQL** to:
  - Add the CHECK constraint per Iteration 2 master §3.2 (Prisma does not generate CHECK constraints declaratively)
  - Add the backfill SQL per Iteration 2 master §3.3 (run inside the same transaction as the column adds — order: column adds → backfill UPDATE → self-approved demotion + audit log inserts → CHECK constraint)
- Apply the migration to a local database
- Apply to staging
- **Do not apply to production until human approval** — production rollout for Phase 1 is human-coordinated; the migration is additive and safe but the backfill is irreversible without a snapshot restore.

**Verification:**
- [ ] `pnpm prisma migrate dev` applies cleanly to a fresh DB (smoke)
- [ ] Migration applies cleanly to a database snapshot of production (proves backfill works on real data)
- [ ] After backfill: every row that had `legalApproved=true AND legalApprovedById<>createdById` now has `reviewStatus='APPROVED'` with matching `approvedAt`/`approvedById`/`reviewNotes`
- [ ] After backfill: every row that had `legalApproved=true AND legalApprovedById=createdById` now has `reviewStatus='DRAFT'` and an audit row `activation.review.backfill.self_approved_demoted` exists for it
- [ ] CHECK constraint rejects `INSERT INTO "Activation" (..., "approvedById", "createdById", ...) VALUES (..., 'X', 'X', ...)` (run a manual psql test and capture the error)
- [ ] CHECK constraint rejects `UPDATE "Activation" SET "approvedById" = "createdById"` (run a manual psql test and capture the error)
- [ ] `EXPLAIN ANALYZE SELECT count(*) FROM "Activation" WHERE "reviewStatus" = 'SUBMITTED' AND "createdById" <> 'some-uuid'` uses the new `Activation_reviewStatus_createdById_idx` index
- [ ] `pnpm typecheck` clean (Prisma Client regenerated; new types compile)
- [ ] `pnpm test` clean (existing tests still pass; no application code changed)
- [ ] No application code references the new columns yet (`grep -r "reviewStatus\|submittedAt\|successHeading" src/` returns matches only in `prisma/schema.prisma` paths and the migration file)

**Sections to internalise:** Iteration 2 master §1, §3 (entire), §11 Phase 1, §11 Phase 6 (forward awareness for the cutover plan), V5 §5, V5 §16.

**Checkpoint:** `Iteration 2 Phase 1 approved — begin Iteration 2 Phase 2`

---

## Phase 1 dependencies — sections to internalise

Beyond the universal must-read list in the Iteration 2 execution template, Phase 1 specifically depends on:

- **Iteration 2 master §1 — System Instructions & Behavioural Rules.** Every Iteration 2 delta applies to every line of Phase 1's migration. Pay particular attention to: the "two-pair-eyes enforced at three layers" rule (the CHECK constraint is layer 3), the "no setLegalApproved" rule (the V5 mutation must remain functional in Phase 1 — removal lands in Phase 2), and the "expand → migrate → contract" framing (Phase 1 is expand only).
- **Iteration 2 master §3 (entire).** The single source of truth for the schema delta. The full schema with `// ── ADDED ──` and `// ── REMOVED IN PHASE 6 ──` annotations is in §3.1. The CHECK constraint SQL is in §3.2. The backfill SQL is in §3.3 — copy it verbatim into the migration file. The cutover plan in §3.4 is forward awareness only (do not run any drops in Phase 1). The index strategy in §3.5 explains why the new composite index exists.
- **Iteration 2 master §11 Phase 1.** The full phase scope, repeated above.
- **Iteration 2 master §11 Phase 6.** Forward awareness only — Phase 6 drops the legacy `legalApproved*` columns. Knowing this is coming prevents you from "tidying up" by removing them in Phase 1.
- **Iteration 2 master §12 — Known Gotchas.** Particularly: "Prisma + CHECK constraints" (must be hand-written SQL in the migration; Prisma will not regenerate it), "Backfill + the CHECK constraint" (order of operations matters), "Prisma + JSON column updates" (forward awareness for the success-page Tiptap fields — Phase 4 will hit this).
- **V5 §1 — System Instructions & Behavioural Rules.** Every V5 rule still applies. Particularly: British English in audit messages (the new `activation.review.backfill.self_approved_demoted` audit row's `metadata.reason` field uses British English), Migrations are reviewed before generation (`migrate dev --create-only` first, review the SQL, then apply), Time UTC at rest (the new `submittedAt`, `approvedAt` columns are `DateTime` and store UTC).
- **V5 §5 — Prisma Schema & Database (entire).** The schema in §5.1 is the V5 baseline. Iteration 2 §3.1 shows the full schema after Phase 1. Compare them carefully. Pay attention to V5 §5.4 (Migrations) — the workflow is `migrate dev --create-only` then human review then apply. Never `prisma db push`.
- **V5 §9.5.1 — The Audit Writer.** The Phase 1 backfill writes audit rows directly via raw SQL (because it runs inside the migration, before any application code is loaded). The structure of those rows (`category`, `action`, `actorId`, `targetType`, `targetId`, `metadata`, `createdAt`) must match what `writeAuditLog` produces in application code. Verify the column names and JSON structure match V5's `AuditLog` model exactly.
- **V5 §16 — What NOT to Do (entire).** Read every entry. Iteration 2 §10 adds 13 new anti-patterns; for Phase 1 specifically, the relevant ones are: do not skip the CHECK constraint, do not drop legacy columns in Phase 1, do not rewrite historical audit log rows, and do not skip the self-approved demotion step in the backfill.

---

## Authority order

When unsure, re-read the spec rather than improvising. Iteration 2 master wins over V5 master. V5 master wins over V3 spec. Spec wins over training-data intuition.

If a decision isn't covered, surface a single-concern question. Do not pick a default.

For Phase 1 specifically, the most likely places to want to "default" are:

- **Migration file naming.** Use `iteration_2_schema_expand` exactly. Do not abbreviate.
- **Backfill SQL placement.** Inline in the migration file, inside the same transaction as the column adds. Not in `prisma/seed.ts`. Not in a separate `pnpm tsx` script.
- **CHECK constraint placement.** Inline in the migration file, **after** the column adds and **after** the self-approved demotion step (so the constraint check passes against the post-backfill state).
- **Index naming.** Let Prisma generate the index name from `@@index([reviewStatus, createdById])` (it will be something like `Activation_reviewStatus_createdById_idx`). Do not hand-name it.
- **Whether to drop the V5 `LegalApprover` relation.** Do not. Phase 6 handles removal.

---

## Output format

Produce, in this order:

1. **Confirmation** — one line confirming you've read the Iteration 2 master prompt, the Iteration 2 execution template, V5 master prompt sections §1/§3.2/§5/§9.5.1/§16, plus the section list above. State explicitly that the V5 execution template was read at least once.
2. **Plan** — bullet list of files you will create or change, one line per file, marked `[NEW]`, `[CHANGED]`, or `[GENERATED]` (the migration SQL file is `[GENERATED]` — Prisma creates it, you hand-edit it). This is your read-back to me before writing.
3. **Files** — produce them. Full file contents, not diffs. Two files at minimum:
   - `prisma/schema.prisma` (full updated file, all V5 + Iteration 2 fields)
   - `prisma/migrations/<timestamp>_iteration_2_schema_expand/migration.sql` (full SQL, including: column adds, backfill UPDATEs, self-approved demotion, audit log inserts, CHECK constraint, index)
   - No `<placeholder>` tokens — every file commit-ready.
4. **Setup commands** — exact commands to run locally. Include:
   - `pnpm prisma migrate dev --create-only --name iteration_2_schema_expand`
   - The instruction to hand-edit the generated SQL per §3.2 / §3.3
   - `pnpm prisma migrate dev` to apply
   - `pnpm prisma generate` (if not auto-run by `migrate dev`)
   - The recommendation to run `pg_dump` against staging before applying to staging
   - The recommendation to NOT apply to production yet — wait for explicit human go-ahead
5. **Acceptance check** — for each verification item in §11 Phase 1 (the ten checkboxes above), state how you verified it. Be specific: which command you ran, what output you observed, which row counts you compared. If a check requires a production database snapshot you can't reach, say so explicitly and mark it "needs human verification."
6. **Open questions** — anything that wasn't fully specified, one question per concern. Do not batch unrelated questions. If there are no open questions, write "None."
7. **Stop.** Wait for the user to type the exact phrase:

> Iteration 2 Phase 1 approved — begin Iteration 2 Phase 2

Do not begin Phase 2 until you receive that exact phrase. Any other input from the user is feedback on Phase 1.

# MrQ Live Activation Platform — Iteration 2 Execution Template

You are the builder for **Iteration 2** of the MrQ Live Activation Platform. Each phase you execute, you re-read this template plus the relevant sections of the Iteration 2 master prompt **and** the V5 master prompt before writing code.

The Iteration 2 master prompt is at `MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md`. It records only the deltas to V5. The V5 master prompt is at `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`. Where this template and either prompt overlap, the Iteration 2 master wins; failing that, the V5 master wins; failing that, this document wins. This document is your operating manual; the master prompts are the spec.

---

## Authority order

1. **Iteration 2 master prompt** (`MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md`) — the constitution for this iteration. Wins over everything except a direct contradiction with this template's checkpoint protocol (in which case stop and ask).
2. **V5 master prompt** (`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`) — the constitution for everything Iteration 2 does not explicitly modify. Schema fields, library pins, env vars, anti-patterns, and gotchas all survive intact unless §1–§10 of the Iteration 2 master overrides them.
3. **V5 execution template** (`MRQ_LIVE_ACTIVATION_LITE_EXECUTION_TEMPLATE.md`) — the operating-manual ancestor of this document. Read once before Iteration 2 Phase 1 to internalise the conventions. This document supersedes it for Iteration 2 work.
4. **V3 source spec** (`MRQ_LIVE_ACTIVATION_MASTER_PROMPT_V3.md`) — historical reference only. The V5 master prompt overrides it. You will rarely need to reference V3 during Iteration 2.

When unsure, re-read the spec rather than improvising. If a decision is not covered in any of the four documents above, surface it as a **single-concern question**. **Do not pick a default.** Defaults compound — a default chosen in Phase 2 quietly constrains Phase 5. Asking is cheap; refactoring is not.

---

## Must read at the start of every phase

These are non-negotiable reads on every Iteration 2 phase, even when they feel unrelated:

- **Iteration 2 master prompt §1 — System Instructions & Behavioural Rules.** The Iteration 2 deltas to V5's constitution. The "no `setLegalApproved`", "URL holds view-state only", "soft invalidation default", and "QR ZIP server-side streaming" rules are easy to forget if you don't re-read.
- **V5 master prompt §1 — System Instructions & Behavioural Rules.** Every V5 rule still applies. British English, TS strict, Zod at every boundary, no `process.env` outside the carve-out, no barrels, RSC by default, `proxy.ts` (not `middleware.ts`), Tailwind v4 tokens in `@theme inline`, PII handling, opaque response shapes for participant routes, time UTC at rest / Europe/London at the boundary.
- **Iteration 2 master prompt §2.3 — Out of Scope.** Re-skim every phase. Many tempting follow-ons (RHF migration, MDX, REVIEWER role, `pageConfig` JSONB, inline char-diff, notifications) are explicitly out of scope.
- **V5 master prompt §3.2 — Folder Structure.** Single source of truth for file locations. Iteration 2 adds files within existing directories only — no new top-level directories.
- **V5 master prompt §4.5 — Library Version Pinning.** No version bumps in Iteration 2 except the `archiver` addition in Phase 5. The agent's instinct will be to install latest; resist.
- **Iteration 2 master prompt §3 — Database Schema Changes.** The single source of truth for what changes in `Activation` and `AdminUser`. Read the expand → migrate → contract framing in §3.3 / §3.4 every phase.
- **V5 master prompt §15 — Environment Variables.** Iteration 2 adds **none**. If you find yourself reaching for a new env var, surface a question.
- **V5 master prompt §16 + Iteration 2 master prompt §10 — What NOT to Do.** Read every entry, every phase. Iteration 2 adds 13 new anti-patterns to V5's table.
- **Iteration 2 master prompt §11 — The phase you are working on, plus the surrounding two phases.** Dependencies between phases (e.g., Phase 2's `buildReviewSnapshot` is read by Phase 3's diff view) are visible only when you see neighbours.
- **Iteration 2 master prompt §12 — Known Gotchas.** Re-reading these once per phase catches drift. The Prisma + CHECK constraint, `archiver` + Next.js streams, and backfill ordering gotchas are particularly easy to break.
- **Iteration 2 master prompt Appendix A — Design Decisions & Rationale.** Skim once per phase. The "why" behind settled choices stops you from re-litigating them.

The Iteration 2 master prompt's §11 names the additional sections each phase depends on under "Sections to internalise." Read those too.

---

## Iteration-specific must-reads (in addition to the universal list)

Some V5 sections are easy to skip but load-bearing for Iteration 2 work. Read them whenever you touch the corresponding surface:

- **V5 §5.7 (HMAC primitives), §3.6 (rate limiter), §9.5.1 (audit writer)** — Iteration 2 writes a lot of audit rows. The `writeAuditLog(...)` helper with the optional `tx` parameter is the only correct path. If you find yourself writing `prisma.auditLog.create(...)` directly, stop — there's a helper, and it must be inside the same transaction as the row update.
- **V5 §6 — tRPC Layer.** All Iteration 2 mutations are tRPC `adminProcedure` (with the exception of the QR ZIP route handler, which is a streaming binary and uses a Route Handler per V5 §6.1's binary-endpoint exception). Procedure naming, error code conventions, and Zod input shape all follow V5.
- **V5 §9.2 (Tiptap allowlists), §9.3 (consent versioning).** Iteration 2 introduces two new Tiptap fields (`successContent`, `successSponsorContent`), both validated against the loose `CONTENT_ALLOWLIST` (not the tight `CONSENT_ALLOWLIST`). The two-allowlist pattern is load-bearing; using one allowlist for both opens a trust gap.
- **V5 §9.4 (Activation Builder UI), §9.5 (state machine).** Iteration 2 modifies both surfaces. Read in full whenever the work touches `ActivationForm.tsx`, `StatusTransitionDialog.tsx`, `ActivationFormReview.tsx` (renamed from `ActivationFormLegal.tsx`), or the `transitionStatus` mutation.
- **V5 §14 (GDPR / Data Protection).** Iteration 2 does not touch retention or DSAR, but the new success-page fields are creator-authored content that may incidentally contain references to participants. The audit-log snapshot in `activation.review.approved` captures full content fields — this is intentional (it's the immutable record of what a reviewer approved), but it means `metadata.snapshot` is potentially wide. Do not include any participant data (email, IP, etc.) in the snapshot — only activation content fields.
- **V5 §13.2 (Structured Logging).** New mutations and route handlers must log with the V5 structured-logging convention. No `console.log("approved!")`; always `console.log(JSON.stringify({ event: "activation.review.approved", ... }))`.

---

## Project-specific must-reads — Iteration 2 surfaces

When the work touches one of these new surfaces, read the corresponding §:

- **Touching peer-review code (mutations, UI, audit, sidebar badge)** → re-read Iteration 2 master §4 (entire) every time. The state machine in §4.1, the mutation contracts in §4.2, the soft-invalidation rules in §4.3, and the UI matrix in §4.4 are all easy to misread by skimming.
- **Touching the success page (schema, form, renderer)** → re-read Iteration 2 master §5 (entire). The lifted state pattern in §5.4 and the falsy-field defaults in §5.6 are subtle.
- **Touching QR / UTM code** → re-read Iteration 2 master §6 (entire). The `getActivationUrl` utility is non-negotiable; manual string concat is a §10 anti-pattern. Server-side streaming for the bulk ZIP is non-negotiable.
- **Touching dashboard or sidebar nav** → re-read Iteration 2 master §7 (entire) and §4.7 (the badge filter). Both badges (pending review, live count) are filtered queries — getting the filter wrong creates UX bugs that don't fail tests but degrade the product.
- **Touching the methodology page** → re-read Iteration 2 master §8 (entire). The 12-section content outline in §8.3 is the contract for what the page covers; do not abbreviate or skip sections.
- **Touching any migration** → re-read Iteration 2 master §3 (entire) and §12 (Prisma + CHECK constraint, backfill ordering). The CHECK constraint must be added via raw SQL in the migration; Prisma will not regenerate it.

---

## Do not improvise on

These zones are off-limits to creative interpretation. If something here seems wrong, surface it as a question — do not change it:

- **The schema deltas in §3.1.** No new fields beyond what is listed. No splitting `successContent` and `successSponsorContent` into a single column. No removing the `LegalApprover` relation before Phase 6. Schema changes ripple through tRPC procedures, audit metadata, retention purges, and migration ordering — the cost of getting one wrong is high.
- **The CHECK constraint in §3.2.** It exists. It runs at the DB layer. Do not skip it on the assumption that the tRPC mutation is enough. Defence in depth is the contract.
- **The backfill SQL in §3.3.** Order of operations matters: column adds → backfill → CHECK constraint → index. Do not reorder. Do not drop the self-approved demotion step.
- **The state machine in §4.1.** Do not introduce new states (no `IN_REVIEW`, no `APPROVED_PENDING_SCHEDULE`, no `REJECTED`). The five states (`DRAFT`, `SUBMITTED`, `APPROVED`, `CHANGES_REQUESTED`, `DRAFT_EDITED`) are the contract.
- **The mutation contracts in §4.2.** Server-side `actorId !== createdById` check. Mandatory `notes` for `requestChanges`. Mandatory `acknowledgedConsentDiff` when consent has changed. Do not relax any of these.
- **The audit-row snapshot in `activation.review.approved`.** Every approval captures `buildReviewSnapshot(activation)` into `metadata.snapshot`. The diff view in Phase 3 reads from this. If you skip the snapshot, the diff view breaks for every newly-approved activation.
- **The lifted-state pattern in §5.4.** Form values live in `ActivationForm`. Tab children receive props. No FormProvider, no React Context for form data, no RHF. If you find yourself reaching for one of those, stop.
- **The URL convention in §5.3.** `?tab=` and `?preview=` are the only Iteration 2 URL params. No form values in URLs. Use `router.replace`, not `router.push`.
- **The `getActivationUrl` utility in §6.1.** Single source of truth. If you find yourself writing `\`${baseUrl}/${slug}?...\`` anywhere, stop and call the utility.
- **The streaming pattern in §6.4.** The bulk ZIP route is server-side, streaming, constant memory. Do not buffer. Do not switch to client-side jszip. Do not return the `archiver` instance directly without wrapping in a `ReadableStream`.
- **The methodology-page format in §8.** TSX, primitives inline, 12 sections. No MDX. No abbreviation of the section list.
- **Phase scope in §11.** If you find yourself wanting to ship something not in the current phase's scope, stop and ask. "While I'm here" is how phase boundaries get blurred and how Phase 4 ends up with Phase 5 work that turns out to depend on a Phase 5 schema change.
- **Anything in V5 §16 or Iteration 2 §10's anti-pattern tables.** Each row exists because someone made (or proposed) the mistake. Don't.

---

## Output format per phase

For each phase you produce, in this order:

1. **Confirmation** — one line acknowledging you've read this template, both master prompts, and the section list for this phase.
2. **Summary** — one short paragraph describing what was built. Reference the Iteration 2 master prompt section numbers covered.
3. **Files created or changed** — flat list, one line per file. Mark each `[NEW]`, `[CHANGED]`, `[RENAMED <from>]`, or `[DELETED]`. Group by sub-system if the list is long (e.g., `Migration`, `tRPC`, `UI`, `Tests`).
4. **Migration / setup commands** — what the user runs locally and on Railway to bring the changes live. Include the exact `pnpm` / `prisma` / `pnpm tsx` commands. If a migration is involved, include the `prisma migrate dev --create-only --name ...` command and remind the user to review the generated SQL before applying.
5. **Acceptance criteria check** — confirm each verification item from §11 for this phase, with how you verified it. If a verification step requires a runtime environment you couldn't reach (e.g., production Railway, real production database snapshot), say so explicitly and mark it "needs human verification."
6. **Open questions** — anything you encountered that wasn't fully specified, surfaced one concern at a time. Do not batch unrelated questions. If there are no open questions, write "None."
7. **Stop.** Wait for the checkpoint phrase.

Code goes in real files, full content, no diffs unless the user asks for a diff. No `<placeholder>` tokens — every file should be commit-ready. SQL goes in the migration files (or as an explicit "run this manually" block in the Migration / setup commands section if it's an operational step).

---

## Checkpoint gate

After producing the above, **stop**. Do not begin the next phase.

Wait for the user to type the exact phrase:

> Iteration 2 Phase [N] approved — begin Iteration 2 Phase [N+1]

For Phase 6 (the final phase), the closing phrase is:

> Iteration 2 Phase 6 approved — Iteration 2 complete

If the user gives any feedback that isn't this phrase, treat it as revisions to the current phase. Apply the revisions, re-run the verification checklist, and stop again. Do not advance.

---

## What to do if you get stuck

Ask. Don't guess. Specifically:

- **Section missing or unclear in either master prompt** → surface a single-concern question quoting the section reference (e.g., "Iteration 2 §4.5 is unclear on whether ...").
- **Iteration 2 master prompt and V5 master prompt contradict each other** → Iteration 2 wins by authority order, but flag the contradiction. The user should know if V5 needs an addendum or if Iteration 2 needs clarification.
- **You want to add a library, env var, or new top-level file** → ask first, every time. Iteration 2 explicitly adds one library (`archiver`) in Phase 5 and zero env vars. Anything beyond that is out of scope without approval.
- **You hit a verification item you can't actually verify** (e.g., a memory check on Railway streaming that needs production-shape load, a backfill verification that needs a real production database snapshot) → say so explicitly. Mark the item "needs human verification" rather than silently skipping it.
- **A V5 surface needs to change to make an Iteration 2 surface work** (e.g., the V5 dashboard query needs a new field for the UTM breakdown) → surface as a question. It's almost certainly fine, but it's the kind of thing where blast radius is easy to underestimate.
- **The migration backfill produces unexpected results on staging** → stop, do not proceed to production, surface the discrepancy with the row counts and the SQL you ran. The Phase 1 backfill is the riskiest single moment in this iteration.

The cost of asking is one round-trip. The cost of guessing wrong shows up in Phase 5 when an architectural assumption from Phase 2 turns out to be incompatible.

---

## What this template is not

This is not the spec. This is your operating manual.

The spec is `MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md` (for Iteration 2 deltas) plus `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` (for everything else). Read all three documents at the start of every phase.

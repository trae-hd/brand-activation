# MrQ Live — Future Features & Improvements

**Last reviewed:** 2026-05-10
**Maintained alongside:** [`INVARIANTS.md`](./INVARIANTS.md) (must-not-change rules) · [`/methodology`](../app/(admin)/methodology/page.tsx) (how things work today)

---

## Purpose & how to use this document

This is the canonical backlog of **deferred work, known limitations, and discussed-but-not-built features** for the MrQ Live Brand Activation Platform. It does not replace ticketing — it captures the *engineering memory* that would otherwise live in commit messages, Slack threads, and Notion comments. When a contributor asks "why don't we just do X?", the answer should be in here, with a rationale.

**How to use:**
- **Before you start a feature**, scan the relevant section to check whether it's already been discussed, scoped out, or blocked.
- **When you defer something during a build**, add an entry. Include the file paths, why it was deferred, and what would unblock it.
- **When you ship something on this list**, remove the entry (don't leave stale "done" markers — git history is the record).
- **Don't add speculative wishlist items.** This is for things with concrete context: a TODO in code, a comment in a spec, an explicit team decision, or a documented limitation. If it's just "would be nice", it doesn't go here yet.

**Priority signals** are guidance, not commitments:
- **P1** — actively blocking known production scenarios or compliance posture
- **P2** — UX or operational pain that's tolerable but worth fixing on the next pass
- **P3** — architectural cleanup / nice-to-have

**Effort signals** are rough sketches, not estimates:
- **S** — a focused day or less
- **M** — a few days, single contributor
- **L** — multi-day with cross-cutting concerns (schema, infra, or external integration)

---

## 1. Participant flow

### 1.1 · Notify-me on SCHEDULED activations
- **Status:** Removed in `9c3b538` (2026-05-10). Stub form was misleading — it never POSTed anywhere.
- **Priority / effort:** P3 / M
- **What's needed if reinstated:**
  - `NotifySubscription` table keyed on `(activationId, emailHash)` with `subscribedAt`, `dispatchedAt`, `dispatchAttempts`.
  - `POST /api/notify-me` with same rate-limit shape as `/api/register` (per-IP and per-`(activationId, emailHash)`).
  - Second leg added to `/api/cron/tick`: when an activation flips `SCHEDULED → LIVE`, fan out emails (or SMS) to all subscribers, mark `dispatchedAt`, audit-log dispatch.
  - Email template + copy approval.
  - Audit log entries for both subscribe and dispatch.
- **Files affected:** `prisma/schema.prisma`, `src/app/api/notify-me/route.ts` (new), `src/app/api/cron/tick/route.ts`, `src/components/participant/NotifyMeForm.tsx` (new), `src/app/(participant)/[activationSlug]/page.tsx` SCHEDULED branch.

### 1.2 · SMS OTP delivery
- **Status:** Out of scope for Phase 1 per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`. Email-only.
- **Priority / effort:** P3 / L
- **Blocked on:** SMS provider selection + per-region cost analysis. Schema would need `Registration.phone` (encrypted, hashed for lookup) and a parallel `issueOtpSms()` flow.

### 1.3 · Recover entry code without re-verifying
- **Status:** Discussed (2026-05-09) in resend dead-end thread.
- **Priority / effort:** P2 / M
- **Problem:** A participant who verified successfully but lost their confirmation email has no in-app way to recover their entry code. The `/api/register` no-op path correctly refuses to re-issue an OTP for a verified email; the `mailto:hello@mrqlive.com` link on `/expired` and `/verify` is the current escalation path, requiring human intervention.
- **Sketch:** New endpoint `POST /api/recover-entry-code` taking `{ activationId, email }`; if a `VERIFIED` row exists, send a "your entry code is X" email. Rate-limited identically to `/api/register`. Audit-logged. Anti-enumeration shape: same opaque 202 response whether the email matches a row or not.
- **Files:** `src/app/api/recover-entry-code/route.ts` (new), `src/lib/email/templates/EntryCodeRecoveryEmail.tsx` (new), participant UI link from `/verify` and `/expired`.

### 1.4 · Plug timing leak on `/api/register` noop path
- **Status:** Discussed (2026-05-10) and explicitly deferred per team review. See [thread context in commit `87ab708`].
- **Priority / effort:** P3 / M
- **Problem:** The `/api/register` happy path (`issueOtp` + `emailProvider.sendOtp`) takes ~250 ms; the noop path (verified email, anti-enumeration) returns in ~50 ms. A determined attacker could discriminate paths via response timing despite the identical body shape.
- **Mitigation in place:** Per-`(activationId, emailHash)` rate limit (5 / 10 min) makes statistical sampling impractical.
- **Fix sketch:** Move email send to a fire-and-forget queue (BullMQ + Redis, or a lightweight async wrapper). Both paths return at the same speed.
- **Files:** `src/app/api/register/route.ts` lines 117–122, plus new queue infrastructure.

---

## 2. Admin UX & dashboard

### 2.1 · Toggle `Registration.excluded` from the dashboard
- **Status:** Schema field exists (`prisma/schema.prisma`) and is rendered as the 🚫 icon in the registrations table State column, but no UI to set it. Admins must use Prisma Studio.
- **Priority / effort:** P2 / S
- **Sketch:** Add a per-row "Exclude from draws" action (ADMIN-only) on `RegistrationsTable`. Mutation flips `excluded`, writes audit log entry with reason, invalidates the registrations query. Should be reversible (toggle back).
- **Files:** `src/components/admin/RegistrationsTable.tsx`, `src/server/trpc/routers/registration.ts` (new mutation).

### 2.2 · Auto-email winners
- **Status:** Documented in `/methodology` §13 as deferred. Current state: admin clicks "Copy winner emails", pastes into their own email tool.
- **Priority / effort:** P2 / M
- **Sketch:** New `winner.notifyByEmail` adminProcedure that templates a message (configurable per activation? or platform default?) and sends via `emailProvider`. Each send writes a `WinnerDrawSelection.notifiedAt` and `notifiedBy`. Copy and template approval needed before build.

### 2.3 · Manual reserve promotion (without disqualifying anyone)
- **Status:** Out of scope per `MRQ_LIVE_ACTIVATION_WINNER_PICKING_PROMPT.md` — promotion only happens as a side-effect of disqualifying a winner.
- **Priority / effort:** P3 / S
- **Use case:** "We want to also award this reserve" — currently impossible without the disqualify-and-promote flow.

### 2.4 · Reserve-to-reserve auto-promotion
- **Status:** Deferred per spec. When a reserve is disqualified, reserves below them do not shuffle up.
- **Priority / effort:** P3 / S
- **Decision needed:** is reserve order meaningful? If position #2 reserve is disqualified, should #3 become #2? Currently no — positions are immutable.

### 2.5 · Real-time conflict detection on winner notes
- **Status:** Deferred per team feedback. Last-Write-Wins for v1.
- **Priority / effort:** P3 / M
- **Sketch:** Optimistic concurrency via `notesUpdatedAt` — when admin opens edit, capture the current `notesUpdatedAt`; on save, only persist if `WHERE notesUpdatedAt = <captured>` matches. On mismatch, surface "another admin saved changes — reload to see them" before letting the user reapply.
- **Files:** `src/server/trpc/routers/winner.ts` (`updateSelectionNotes`), `src/components/admin/winner/WinnersSection.tsx` notes editor.

### 2.6 · Inline text diff for approval reviews
- **Status:** Deferred per `MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md`. Current review UI shows side-by-side previews; no character-level highlighting.
- **Priority / effort:** P3 / M
- **Files:** `src/components/admin/activation-form/ActivationReviewDiff.tsx`. Library option: `diff-match-patch` or `react-diff-viewer-continued`.

---

## 3. Winner picking

### 3.1 · Cross-activation winner exclusion
- **Status:** Out of scope for Phase 1 per `MRQ_LIVE_ACTIVATION_WINNER_PICKING_PROMPT.md` (line 664). Only intra-activation exclusion via `@@unique([activationId, registrationId])` on `WinnerDrawPoolEntry` is enforced today.
- **Priority / effort:** P2 / M
- **Use case:** "Don't let the same email win across activations within a 30-day rolling window."
- **Blocked on:** business policy. Once the window and matching key (email hash? linked MRQ account?) are agreed, the implementation is a `WHERE NOT EXISTS` against `WinnerDrawSelection` joined to `Registration` on `emailHash` with a date filter.
- **Files affected:** `src/server/trpc/routers/winner.ts` `eligibilityWhere()`, plus the corresponding raw SQL filter — see `INVARIANTS.md` INVARIANT-001.

### 3.2 · Server-side enforcement of MrQ contact consent
- **Status:** Currently UX-only. The `mrqContactConsentEnabled` toggle on an activation just controls whether the checkbox renders on the registration form — there's no server-side enforcement that submissions for those activations have `mrqContactConsent = true`.
- **Priority / effort:** P2 / S
- **Risk:** A direct API call to `/api/register` with `mrqContactConsent: false` succeeds even on activations where the toggle is on. Compliance impact on winner-contact pipelines.
- **Sketch:** In `/api/register`, fetch `activation.mrqContactConsentEnabled` (already in schema) and reject (`400`) if it's `true` and the body has `mrqContactConsent: false`. Add a test in `src/app/api/register/__tests__/`.
- **Files:** `src/app/api/register/route.ts`.

### 3.3 · Production verification: erasure + concurrent draw
- **Status:** Listed as human-in-the-loop checks in winner-picking sign-off (commits `d487872` / `197a81f`).
- **Priority / effort:** P2 / M (test infrastructure)
- **What's needed:**
  - **Erasure test:** verify that GDPR erasure of a `Registration` correctly nulls the FK on past `WinnerDrawSelection` rows (per `onDelete: SetNull`) without breaking historical draws.
  - **Concurrent-draw test:** two simultaneous `pickWinners` mutations against the same activation should not produce overlapping pool entries (the unique constraint should reject the loser).
  - **Performance baseline:** measure end-to-end `pickWinners` latency on a representative pool (10k? 50k?). The SHA-256 deterministic shuffle is `O(n log n)` server-side; identify the breakpoint where eligibility query dominates.
- **Files:** new integration suite, e.g. `src/server/trpc/routers/__tests__/winner.integration.test.ts`. Requires a test database (not the mocked-Prisma unit suite).

### 3.4 · Refactor INVARIANT-001 duplicate filters
- **Status:** Documented in `INVARIANTS.md`. Three filters (`eligibilityWhere()` JS, raw SQL `INSERT … WHERE`, raw SQL shuffle `SELECT … WHERE`) must stay in sync.
- **Priority / effort:** P3 / M
- **Sketch:** Promote the WHERE clause to a shared SQL fragment built via `Prisma.sql\`...\`` and used by both raw queries. The JS Prisma form will still need to mirror it for `previewEligiblePool` — comment must remain.

---

## 4. Security & privacy

### 4.1 · Email encryption at rest
- **Status:** Phase 2 work per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` §14.0. Currently `Registration.email` is plaintext; the HMAC `emailHash` is what's used for indexing/uniqueness.
- **Priority / effort:** P1 / L
- **Sketch:** Add `emailEncrypted` (bytea) + `emailKeyVersion` columns. Encryption: AES-256-GCM with per-installation master key. Backfill, swap reads, drop `email`. Key rotation runbook needed before this can ship.

### 4.2 · HMAC key rotation runbook
- **Status:** Documented but not implemented per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` §14.4. `EMAIL_HASH_HMAC_KEY`, `IP_HASH_HMAC_KEY` assumed stable for the platform's lifetime.
- **Priority / effort:** P2 / L
- **Sketch:** Versioned keys (`HMAC_KEY_V1`, `HMAC_KEY_V2`, …); existing rows get a `keyVersion` column and a backfill process. Verification reads check matching version.

### 4.3 · Audit-log rate-limit hits
- **Status:** Discussed (2026-05-10) in the anti-enumeration thread. Currently `fixedWindow` rejects with 429 silently — no audit trail of attempted abuse.
- **Priority / effort:** P3 / S
- **Sketch:** When `fixedWindow` denies a request in `/api/register` or `/api/verify`, write an audit log entry with category=SECURITY, action=`rate_limit_hit`, metadata containing key prefix (no PII). Later, an admin can query for activations under enumeration pressure.

### 4.4 · Cron job retry / dead-letter handling
- **Status:** Current `/api/cron/tick` swallows per-activation errors into an `errors[]` array but doesn't retry or dead-letter.
- **Priority / effort:** P3 / M
- **Failure mode:** if an activation's `SCHEDULED → LIVE` transition fails (e.g. transient DB blip), the error is logged in the cron response and **never retried** — the next tick won't re-attempt because the WHERE clause is `status = SCHEDULED AND startsAt <= now`, which still matches, but if the underlying issue is persistent (e.g. constraint violation on dependent data), it'll fail every tick forever.
- **Sketch:** Add a `lastTransitionAttemptAt` column or a separate `ActivationTransitionFailure` table; surface in admin UI when an activation has been failing.
- **Files:** `src/app/api/cron/tick/route.ts`, `prisma/schema.prisma`.

---

## 5. Infrastructure & deployment

### 5.1 · Background email worker (BullMQ)
- **Status:** Phase 1 is synchronous via Resend. Per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` opening notes, queue infrastructure is deferred.
- **Priority / effort:** P3 / L
- **Trigger condition:** if `/api/register` p95 latency starts impacting participant verification rates, or if email-provider rate limiting becomes a bottleneck. Subsumes 1.4 (timing leak fix).
- **Sketch:** Redis-backed queue, dedicated worker process on Railway, retry policy with exponential backoff.

### 5.2 · PgBouncer / external connection pooling
- **Status:** Deferred per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`. Railway's managed Postgres pooling is sufficient for current traffic.
- **Priority / effort:** P3 / M
- **Trigger condition:** connection-pool exhaustion warnings in prod, or dashboard-load latency tied to queueing for connections.

### 5.3 · Cache coherency for multi-replica deployments
- **Status:** Documented limitation per `MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`. `unstable_cache` is per-replica; `revalidateTag` only invalidates the calling replica.
- **Priority / effort:** P3 / L
- **Trigger condition:** edit propagation delay becomes operationally painful (admins editing activations and waiting >60 s for all replicas to see changes). Phase 2 might use Redis-backed cache or longer manual TTL with explicit cross-replica purge.

### 5.4 · Pre-existing lint errors
- **Status:** 3 `react-hooks/set-state-in-effect` errors and 1 `@typescript-eslint/no-unused-vars` warning predate winner-picking work. Surfaced during recent review but not fixed (pre-existing scope).
- **Priority / effort:** P3 / S each
- **Files:**
  - `src/components/admin/winner/PickWinnersDialog.tsx:108` (winnerCount → reserveCount sync useEffect)
  - `src/components/admin/winner/PickWinnersDialog.tsx:115` (dialog close reset useEffect)
  - `src/components/admin/RegistrationsTable.tsx:154` (filter-change reset useEffect)
  - `src/components/admin/winner/WinnersSection.tsx:357` (`isEditingThisRow` declared but never read)
- **Pattern:** the React docs anti-pattern; refactor to derived state or event handlers per [react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect).

### 5.5 · Pre-existing Redis-dependent test failures
- **Status:** 5 tests in `src/lib/otp/__tests__/issue-verify.test.ts` require a real Redis instance. Mocked Prisma tests pass; these don't.
- **Priority / effort:** P3 / S
- **Sketch:** Either (a) wrap the suite with `describe.skipIf(!process.env.REDIS_URL)` so they only run when a test Redis is available, or (b) adopt `ioredis-mock` for the suite. Option (b) is preferred — keeps CI green by default.

---

## 6. Compliance & integrations

### 6.1 · MrQ account enrichment API
- **Status:** Stub at `src/server/trpc/routers/registration.ts:293`. Currently only stamps `mrqEnrichedAt`; doesn't populate `mrqAccountStatus` or `mrqLastLoginAt`.
- **Priority / effort:** P2 / M
- **Blocked on:** upstream MRQ account API spec + credential provisioning.
- **What it should do:** for each pending registration, hash the email per the MrQ Live ↔ MrQ accounts shared HMAC convention, call the lookup endpoint, update the three fields plus the consent-cross-reference flag if applicable.

### 6.2 · DSAR export — winner picking data inclusion
- **Status:** Not verified. The DSAR export at `src/app/api/admin/dsar/export/route.ts` predates winner picking. Needs review to confirm a participant's `WinnerDrawSelection` history is surfaced when they request their data.
- **Priority / effort:** P2 / S
- **Action:** audit the DSAR export pipeline; add winner-selection rows + draw context if missing. Add a test fixture with a participant who has been a winner to lock the behaviour.

### 6.3 · Right-to-erasure verification across winner schema
- **Status:** Schema is set up correctly (`onDelete: SetNull` on `WinnerDrawSelection.registrationId`), but no integration test exercises a real erasure → draw-history-still-coherent path. Listed in 3.3.

---

## 7. Documentation & operational

### 7.1 · Methodology page coverage drift
- **Status:** `/methodology` is the canonical "how it works" doc. As features ship without methodology updates, drift accumulates.
- **Priority / effort:** P3 / S each release
- **Process:** any feature that changes user-visible behaviour or admin workflow should bump the relevant `/methodology` section in the same PR. Reviewer should treat methodology gaps as blocking.

### 7.2 · Runbook for production cutovers
- **Status:** `docs/RUNBOOK.md` exists (top-level). Worth reviewing whether it covers the migration deploy sequence the team uses today (Railway start command `pnpm prisma migrate deploy && pnpm start`).
- **Priority / effort:** P3 / S

---

## 8. Out-of-band notes

- **INVARIANT-001 SQL filter duplication** — see [`INVARIANTS.md`](./INVARIANTS.md) for the rationale. Item 3.4 above is the eventual cleanup.
- **No one item should be silently expanded into a refactor.** If you start a small change and find yourself rewriting more than a couple of files, stop and turn the over-scope into a new entry here.

---

*End of backlog. To add an item: append a new sub-section under the right category, with status / priority / effort / file paths / rationale. Don't reorder existing entries unless reprioritising — the section numbers aren't load-bearing but they do help cross-reference in commits and PR descriptions.*

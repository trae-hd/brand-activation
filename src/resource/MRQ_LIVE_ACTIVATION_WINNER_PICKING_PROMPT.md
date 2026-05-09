# MrQ Live Activation Platform — Winner Picking Feature

You are the builder for the **Winner Picking** feature. This document is **both** the spec for the feature and the phased operating manual for delivering it. Read end-to-end before writing any code.

The feature is bounded — it adds a single capability (admins picking winners on an activation) with associated data model, mutations, UI, and audit trail. It is not an iteration; it is one cohesive deliverable shipped over six phases of work.

---

## Operating context

Read these documents before writing any code:

1. **This document** — the spec and the phase plan. Single source of truth for the winner-picking feature.
2. **`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`** — the V5 constitution. Winner Picking inherits everything in V5. Read §1 (constitution), §3.2 (folder structure), §5 (Prisma schema), §6 (tRPC layer), §9.5.1 (audit writer), §13.2 (structured logging), §14 (GDPR / Data Protection), §16 (anti-patterns).
3. **`MRQ_LIVE_ACTIVATION_ITERATION_2_MASTER_PROMPT_V1.md`** — the Iteration 2 deltas. Winner Picking inherits everything in Iteration 2 and adds new surfaces. Read §3 (schema framing — Iteration 2 introduced the patterns this feature reuses), §10 (anti-patterns added in Iteration 2).
4. **`MRQ_LIVE_ACTIVATION_LITE_EXECUTION_TEMPLATE.md`** and **`MRQ_LIVE_ACTIVATION_ITERATION_2_EXECUTION_TEMPLATE.md`** — operating manuals for the previous iterations. Re-skim once; this document supersedes them for Winner Picking work.

Confirm in your first message that you have read items 1, 2, and 3 in full and items 4 once each.

---

## Authority order

When unsure, re-read the spec rather than improvising.

1. **This document** wins for Winner Picking. The spec in §1 and the phase plan in §2 are the contract.
2. **Iteration 2 master prompt** wins for cross-cutting concerns Iteration 2 introduced (peer review patterns, soft-invalidation conventions, audit-snapshot conventions).
3. **V5 master prompt** wins for everything else (schema fields, library pins, env vars, anti-patterns, coding conventions).

If a decision is not covered in any of these documents, surface it as a **single-concern question**. **Do not pick a default.** Defaults compound — a default chosen in Phase 2 quietly constrains Phase 4. Asking is cheap; refactoring is not.

---

## §1 Feature spec

### §1.1 Goal in one paragraph

Admins can pick a randomised, auditable set of winners from an activation's verified registrations. The draw uses a deterministic Postgres-side shuffle keyed by a cryptographic seed so the result is reproducible for audit. Each draw produces N **winners** plus M **reserves** (next-in-line) in a single shuffle. Winners can be disqualified, in which case the topmost reserve is promoted — preserving the original randomness without a new draw event. The eligibility filter respects three hard floors (verified status, contact-consent given, not excluded by an admin) and an optional MrQ-account filter. All actions are audit-logged.

### §1.2 Eligibility

A registration is eligible for selection in a draw if and only if **all** of the following are true:

| Condition | Source | Notes |
|---|---|---|
| `Registration.status === "VERIFIED"` | Registration row | Pending and expired registrations never participate |
| `Registration.mrqContactConsent === true` | Registration row | The participant ticked the contact-consent box at registration |
| `Registration.excluded === false` | Registration row (new column added in Phase 1) | Defaults to false. Admins can flip via direct DB / Prisma Studio in v1 — no UI for managing exclusion in this feature |
| `Registration.verifiedAt <= WinnerDraw.eligibilityCutoffAt` | Registration row | Point-in-time snapshot. For ENDED activations, defaults to `Activation.endsAt`. For LIVE activations, defaults to `now()` at draw trigger time |
| Optional: `Registration.mrqAccountStatus === "ACTIVE"` | Registration row | Toggle in the modal, default off. Only applied if the admin enables it |
| Not present in **any** existing `WinnerDrawSelection` for this activation, regardless of selection status (`SELECTED`, `DISQUALIFIED`, etc.) and regardless of type (`WINNER` or `RESERVE`) | `WinnerDrawSelection` table | Enforced at two layers: (1) the SELECT in the shuffle SQL filters with `AND r.id NOT IN (SELECT "registrationId" FROM "WinnerDrawSelection" WHERE "activationId" = $activationId AND "registrationId" IS NOT NULL)` so already-selected registrations never enter the shuffle; (2) the `@@unique([activationId, registrationId])` constraint catches any race-condition bypass at insert time. **Disqualification does not free a registrationId for re-selection** — once you've been on a draw for an activation, you stay on it forever (compliance: prevents "redrawing until a preferred outcome"). |

### §1.3 Algorithm

The draw uses a **deterministic Postgres-side shuffle** keyed by a per-draw cryptographic seed.

**Step-by-step:**

1. Generate a fresh seed: `crypto.randomBytes(32).toString("hex")`. This is the source of randomness. Stored on the `WinnerDraw` row.
2. Compute the eligible-pool size with a `COUNT(*)` against the eligibility filter. Stored on the `WinnerDraw` row as `eligiblePoolSize`. Used for verification + for the modal's live preview before commit.
3. Validate `winnerCount + reserveCount <= eligiblePoolSize`. If not, abort with a clear error message. Modal-side validation must already prevent this from reaching the server, but the server enforces.
4. Snapshot the eligible-pool IDs ordered by `id ASC` into `WinnerDrawPoolEntry`. This ordering is the input to the shuffle. The pool snapshot is permanent and survives erasure (the `registrationId` is set to NULL on erasure, but the `position` remains).
5. Run the shuffle in SQL. The eligibility filter must include the "not on any prior draw for this activation" clause:
   ```sql
   INSERT INTO "WinnerDrawSelection" (...)
   SELECT
     $drawId,
     r.id,
     row_number() OVER (ORDER BY encode(digest($seed || ':' || $drawId || ':' || r.id::text, 'sha256'), 'hex')),
     CASE WHEN row_number() OVER (...) <= $winnerCount THEN 'WINNER'::"SelectionType" ELSE 'RESERVE'::"SelectionType" END,
     'SELECTED'::"SelectionStatus"
   FROM "Registration" r
   WHERE r."activationId" = $activationId
     AND r."status" = 'VERIFIED'
     AND r."mrqContactConsent" = TRUE
     AND r."excluded" = FALSE
     AND r."verifiedAt" <= $eligibilityCutoffAt
     AND ($mrqAccountOnly = FALSE OR r."mrqAccountStatus" = 'ACTIVE')
     AND r.id NOT IN (
       SELECT s."registrationId"
       FROM "WinnerDrawSelection" s
       WHERE s."activationId" = $activationId
         AND s."registrationId" IS NOT NULL
     )
   ORDER BY encode(digest($seed || ':' || $drawId || ':' || r.id::text, 'sha256'), 'hex')
   LIMIT $winnerCount + $reserveCount;
   ```
   The `NOT IN (SELECT ... FROM "WinnerDrawSelection" ...)` clause is the load-bearing safeguard. **Without it, a second draw on the same activation can pick someone who was disqualified on the first draw, then fail at the unique-constraint insert mid-shuffle, leaving an inconsistent `WinnerDrawSelection` table.** The clause runs at the SELECT stage so the shuffle universe is correct from the outset.
6. The seed input format is **exactly** `seed || ':' || drawId || ':' || id::text`. Domain-separation tag prevents two draws on the same activation with the same accidental seed from producing the same shuffle.
7. Algorithm version stamped on the draw row: `"v1:sha256-postgres-orderby"`. Future versions get new strings. Re-derivation logic switches on this version.

**The shuffle is reproducible by:**
- Reading `seed`, `drawId`, the eligible pool IDs (from `WinnerDrawPoolEntry.position` ordering), and the algorithm version
- Re-running the same `ORDER BY` against the snapshotted pool
- Comparing the resulting positions to `WinnerDrawSelection.position`

### §1.4 Data model

Three new tables, one new column on an existing table, two new enums, one new Postgres extension.

```prisma
// New extension required
// Migration: CREATE EXTENSION IF NOT EXISTS pgcrypto;

// New column on existing table
model Registration {
  // ... existing fields unchanged ...
  excluded Boolean @default(false)
  // ... existing fields unchanged ...
}

enum SelectionType {
  WINNER
  RESERVE
}

enum SelectionStatus {
  SELECTED
  DISQUALIFIED
  NOTIFIED
  DECLINED
  CONFIRMED
}

model WinnerDraw {
  id                    String   @id @default(cuid())
  activationId          String
  drawnById             String
  drawnAt               DateTime @default(now())
  eligibilityCutoffAt   DateTime
  winnerCount           Int
  reserveCount          Int
  mrqAccountOnly        Boolean  @default(false)
  eligiblePoolSize      Int
  seed                  String   // hex-encoded 32 bytes from crypto.randomBytes
  algorithmVersion      String   @default("v1:sha256-postgres-orderby")
  notes                 String?

  activation            Activation @relation(fields: [activationId], references: [id], onDelete: Restrict)
  drawnBy               AdminUser @relation("DrawnBy", fields: [drawnById], references: [id], onDelete: Restrict)
  selections            WinnerDrawSelection[]
  poolEntries           WinnerDrawPoolEntry[]

  @@index([activationId, drawnAt])
}

model WinnerDrawSelection {
  id                      String   @id @default(cuid())
  drawId                  String
  registrationId          String?  // nullable — set to NULL when the registration is erased
  activationId            String   // denormalised so the @@unique enforces across draws
  position                Int      // 1..(winnerCount + reserveCount); 1..winnerCount are winners, the rest reserves
  type                    SelectionType
  status                  SelectionStatus @default(SELECTED)
  disqualifiedAt          DateTime?
  disqualifiedById        String?
  disqualifiedReason      String?
  promotedFromReserveAt   DateTime?
  notifiedAt              DateTime?
  notifiedById            String?
  notificationNotes       String?
  // Notes are editable after first write. Track the last-edit metadata
  // separately from notifiedById so "who first marked notified" and "who
  // last edited the notes" are both auditable from the row alone (and the
  // full edit history sits in the AuditLog as winner.selection.notes_updated
  // entries).
  notesUpdatedAt          DateTime?
  notesUpdatedById        String?

  draw                    WinnerDraw @relation(fields: [drawId], references: [id], onDelete: Cascade)
  registration            Registration? @relation(fields: [registrationId], references: [id], onDelete: SetNull)
  activation              Activation @relation(fields: [activationId], references: [id], onDelete: Cascade)
  disqualifiedBy          AdminUser? @relation("DisqualifiedBy", fields: [disqualifiedById], references: [id], onDelete: SetNull)
  notifiedBy              AdminUser? @relation("NotifiedBy", fields: [notifiedById], references: [id], onDelete: SetNull)
  notesUpdatedBy          AdminUser? @relation("NotesUpdatedBy", fields: [notesUpdatedById], references: [id], onDelete: SetNull)

  @@unique([drawId, registrationId])
  @@unique([activationId, registrationId])
  @@index([drawId, type])
  @@index([drawId, position])
}

model WinnerDrawPoolEntry {
  drawId         String
  position       Int      // sort position in the original shuffle (1-based, ascending by registration id)
  registrationId String?  // nullable — set to NULL when the registration is erased

  draw           WinnerDraw @relation(fields: [drawId], references: [id], onDelete: Cascade)
  registration   Registration? @relation(fields: [registrationId], references: [id], onDelete: SetNull)

  @@id([drawId, position])
}
```

Add `winnerDrawsRun WinnerDraw[] @relation("DrawnBy")`, `disqualifications WinnerDrawSelection[] @relation("DisqualifiedBy")`, `winnerNotifications WinnerDrawSelection[] @relation("NotifiedBy")`, and `winnerNotesUpdates WinnerDrawSelection[] @relation("NotesUpdatedBy")` back-relations on `AdminUser`.

Add `winnerDraws WinnerDraw[]` and `winnerSelections WinnerDrawSelection[]` back-relations on `Activation`.

Add `winnerSelection WinnerDrawSelection?` and `winnerPoolEntries WinnerDrawPoolEntry[]` back-relations on `Registration`.

### §1.5 Permissions

| Action | ADMIN | MEMBER |
|---|---|---|
| Open the dashboard for an activation | ✓ | ✓ |
| See "Pick winners" button | ✓ | — (button hidden) |
| Click "Pick winners" → submit draw | ✓ | — (mutation refuses with `FORBIDDEN`) |
| View winners + reserves on the dashboard | ✓ | ✓ |
| See entry codes of winners + reserves | ✓ | ✓ |
| Reveal a single email address (per row) | ✓ (audit log on reveal) | ✓ (audit log on reveal) — same pattern as the existing registrations table |
| **Bulk-copy winner emails** (the "Copy winner emails" button) | ✓ (audit log on copy) | — (button hidden, mutation refuses with `FORBIDDEN`). Rationale: bulk-copy is the leakiest action surface — restricting it to ADMINs forces MEMBERs to reveal-and-copy individually, which adds friction that meaningfully reduces data-exfiltration risk if a MEMBER account is compromised or the role is held by an external agency. MEMBERs can still do the actual outreach work; they just do it one row at a time. |
| Disqualify a winner | ✓ | — (button hidden, mutation refuses) |
| Promote a reserve | ✓ | — (mutation refuses; promotion is automatic on disqualification when reserves exist) |
| Mark a selection as `notifiedAt` | ✓ | ✓ |
| Edit `notificationNotes` (writes audit row + updates `notesUpdatedAt`/`notesUpdatedById`) | ✓ | ✓ |
| View previous draws (history) | ✓ | ✓ |

The MEMBER role can view + log notifications because the actual outreach work (calling, emailing, BCC'ing) is often done by marketing-ops members. ADMIN-only gates everything financial-commitment-shaped (drawing, disqualifying).

### §1.6 UX surfaces

**A. "Pick winners" button** — added to the activation dashboard, alongside the existing "Check MRQ accounts" + "CSV ↓" buttons. Hidden for MEMBER users. Clicking opens the modal.

**B. Pick winners modal** — three states:

1. **Compose draw**:
   - Number input: "Number of winners (N)" — clamped 1..eligiblePoolSize
   - Number input: "Number of reserves (M)" — defaults to `Math.max(2, Math.ceil(winnerCount * 0.2))`. Editable. Clamped 0..(eligiblePoolSize - winnerCount).
   - Toggle: "Only participants with an MrQ account" (default off). When toggled, the eligible-pool count refreshes.
   - Read-only summary: "**Eligible pool: X participants** *(verified · contact consent given · not excluded · registered before \<formatted timestamp\>)*"
   - Read-only display of the cutoff time the draw will use, prominently
   - Phrase gate input: "Type DRAW to confirm" — the confirm button stays disabled until the user types `DRAW` exactly
   - "Draw winners" submit button (disabled until all gates pass)
   - "Cancel" button (always enabled; closes the modal without writing)

2. **Drawing** — loading spinner. Should resolve in <2s for any reasonable pool size.

3. **Result**:
   - "{winnerCount} winners + {reserveCount} reserves selected" headline
   - Two tables:
     - **Winners** (positions 1..N): position, email (revealable), entry code, MrQ status, "Mark as notified" button
     - **Reserves** (positions N+1..N+M): position, email (revealable), entry code, MrQ status. Reserves get promoted on disqualification, not directly contacted yet.
   - "Copy winner emails" button — **ADMIN-only** (hidden for MEMBER). Copies newline-delimited list to clipboard, writes a single audit log entry per click for the bulk reveal. The mutation that produces the list also refuses non-ADMIN callers.
   - "Done" button — closes the modal and refreshes the dashboard

**C. Winners view** — appears as a new section on the activation dashboard *if any draws exist for this activation*. Shows:

- For each draw (most recent first):
  - Header row: "Draw #N · drawn at \<timestamp\> by \<admin name\> · cutoff \<timestamp\>"
  - Selections table with all fields above + per-row action buttons:
    - **Disqualify** (ADMIN-only): opens a small dialog with a required `reason` text field. On submit, sets `status = DISQUALIFIED` on the row and, **if the row was a WINNER**, automatically promotes the topmost `RESERVE` selection in the same draw to `WINNER` (sets `type = WINNER`, `promotedFromReserveAt = now()`). Both changes happen in a single transaction.
    - **Mark notified** (ADMIN + MEMBER): sets `notifiedAt = now()`, `notifiedById = current user`. Optional inline note field.
    - **Edit notes** (ADMIN + MEMBER): updates `notificationNotes`, `notesUpdatedAt = now()`, `notesUpdatedById = current user`. Writes a `winner.selection.notes_updated` audit row capturing the actor and a short before/after fingerprint (length-only, not content — content is recoverable from the row at the time of audit query).
- Cutoff time displayed prominently on each draw header.
- Each row with non-empty `notificationNotes` shows "last edited by \<admin name\> \<relative time\>" beneath the notes preview, sourced from `notesUpdatedAt` / `notesUpdatedById`.

**D. Indicators on the existing registrations table** — small icons in a new column:
- **🏆 / ⭐ trophy/star** when a registration has been selected in any draw and the selection is not disqualified. Tooltip shows draw number + position + type (winner/reserve).
- **🚫 excluded** when `Registration.excluded === true`. Tooltip: "Excluded from future winner draws." This icon surfaces silently — there's no UI for setting `excluded` in v1, but admins who flip it via Prisma Studio (or a future flag UI) get visible confirmation that their change took effect.
- A registration can show one or both icons (excluded participants who were nonetheless drawn before they were flagged, for example).
- ADMIN sees both icons; MEMBER sees both icons. The information is non-PII and helps both roles understand the state of the data.

**E. Methodology page** — new section "13. Picking winners" added between the existing "12. MRQ account enrichment" section and the existing "13. Data, retention & DSAR" section. Renumber subsequent sections. Document: eligibility floor, algorithm overview, reserves concept, disqualify-and-promote flow, audit-log entries written, permissions matrix.

### §1.7 Audit log entries

Every action writes an audit log row via the V5 `writeAuditLog(...)` helper. Category, action, actorId, targetType, targetId, metadata fields:

| Action | Category | Action string | targetType | targetId | metadata |
|---|---|---|---|---|---|
| Draw created | `ADMIN` | `winner.draw.created` | `WinnerDraw` | drawId | `{ activationId, winnerCount, reserveCount, mrqAccountOnly, eligiblePoolSize, eligibilityCutoffAt }` |
| Selection disqualified | `ADMIN` | `winner.selection.disqualified` | `WinnerDrawSelection` | selectionId | `{ activationId, drawId, position, type, reason }` |
| Reserve promoted (auto, on disqualification) | `ADMIN` | `winner.selection.promoted` | `WinnerDrawSelection` | promotedSelectionId | `{ activationId, drawId, fromPosition, toPosition, replacedSelectionId }` |
| Selection marked notified | `ADMIN` | `winner.selection.notified` | `WinnerDrawSelection` | selectionId | `{ activationId, drawId, position }` |
| Selection notes updated | `ADMIN` | `winner.selection.notes_updated` | `WinnerDrawSelection` | selectionId | `{ activationId, drawId, position, previousLength, newLength }` (lengths only — not the note content; the live row holds the current value) |
| Bulk-copy winner emails (the "Copy winner emails" button) | `ADMIN` | `winner.draw.bulk_email_copied` | `WinnerDraw` | drawId | `{ activationId, count }` |

No PII in metadata. `actorId` points to the AdminUser. Email content is recoverable via the `Selection → Registration` join on present registrations (and unrecoverable on erased ones — that's by design).

---

## §2 Phase plan

Six phases. Each phase is independently committable, has explicit pre-flight, implementation, verification, and "what NOT to do" lists, and ends with a checkpoint phrase.

**Total effort estimate: 4 days.** Per-phase estimates are suggestive; verification is non-negotiable.

### §2.1 Phase 1 — Schema, extension, types

**Effort:** 0.5 day.

**Goal.** Schema deltas applied (new tables, column, enums, extension), migration generated and applied to local + staging, types regenerated. **No application code references the new tables yet.** A grep for `WinnerDraw\|WinnerDrawSelection\|WinnerDrawPoolEntry` should return matches only in `prisma/schema.prisma` and the migration file.

**Pre-flight:**
- [ ] Previous batch (commits `0489920` through `4051986`) is deployed and verified on Railway production
- [ ] Database snapshot taken from Railway production (rollback safety net for the migration — even though it's purely additive, the new pgcrypto extension touches the DB at the extension level)
- [ ] This document, V5 master prompt §5 and §16, and Iteration 2 master prompt §3 have been re-read

**Implementation:**
- Update `prisma/schema.prisma` per §1.4 of this document:
  - Add `excluded Boolean @default(false)` to `Registration` (preserve all existing fields)
  - Add `SelectionType` and `SelectionStatus` enums
  - Add `WinnerDraw`, `WinnerDrawSelection`, `WinnerDrawPoolEntry` models
  - Add the back-relations on `AdminUser`, `Activation`, `Registration`
  - All `@@unique`, `@@index`, and `@@id` clauses per §1.4
- Generate the migration with `pnpm prisma migrate dev --create-only --name winner_picking_schema_expand`
- **Hand-edit the generated migration SQL** to:
  - Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` at the top of the migration
  - Verify Prisma generated the right `ON DELETE` clauses (`SetNull` for `registrationId` on Selection and PoolEntry; `Restrict` for `activationId` and `drawnById` on the Draw row; `Cascade` for parent-draw deletion of children)
  - Verify the unique constraints are `@@unique([drawId, registrationId])` and `@@unique([activationId, registrationId])` on Selection
- Apply the migration to a local database
- Apply the migration to staging
- **Do not apply to production until explicit human approval.** Production rollout for Phase 1 is human-coordinated. The migration is additive and safe but the new extension installation is operational and merits a human eye on the Railway logs.

**Verification:**
- [ ] `pnpm prisma migrate dev` applies cleanly to a fresh DB (smoke)
- [ ] Migration applies cleanly to a database snapshot of production (proves it works against real data shape)
- [ ] After migration: `SELECT * FROM pg_extension WHERE extname = 'pgcrypto'` returns one row
- [ ] After migration: `SELECT digest('hello', 'sha256')` returns a 32-byte bytea (proves pgcrypto's `digest` function is reachable)
- [ ] After migration: every existing `Registration` row has `excluded = false`
- [ ] After migration: the three new tables exist and are empty
- [ ] `pnpm typecheck` clean (Prisma Client regenerated; new types compile)
- [ ] `pnpm test` clean (existing tests still pass; no application code changed)
- [ ] No application code references the new tables yet (`grep -r "WinnerDraw\|WinnerDrawSelection\|WinnerDrawPoolEntry" src/` returns matches only in `prisma/schema.prisma` and the migration file)

**Sections to internalise:**
- §1.4 (this document)
- V5 master §5 (Prisma Schema & Database, entire) — for the V5 baseline
- V5 master §16 (anti-patterns) — particularly the migration anti-patterns
- Iteration 2 master §3 (schema framing) — for the expand-migrate-contract pattern Iteration 2 introduced

**What NOT to do in Phase 1:**
- Do not write any tRPC procedures referencing the new tables. Phase 2 owns that.
- Do not write any UI referencing the new tables. Phase 4 owns that.
- Do not skip the `pgcrypto` extension. Phase 2's shuffle depends on it; if it's missing, Phase 2 will fail at runtime in a confusing way.
- Do not change the `ON DELETE` behaviour to `Cascade` on `WinnerDrawSelection.registrationId`. Cascade-deleting a winner because the participant erased themselves would destroy the audit trail. `SetNull` is correct.
- Do not "tidy up" by adding a `winners` count column on `Activation`. Counts derive from `WinnerDrawSelection` joins; storing them is redundant and can drift.
- Do not use `prisma db push`. Always `migrate dev --create-only` then human review then apply.

**Human intervention required at end of Phase 1:**
1. Review the generated SQL diff and confirm it matches §1.4
2. Apply the migration to Railway production via `pnpm prisma migrate deploy` (already part of Railway's start command, but the FIRST application of the new extension benefits from a human watching the deploy logs)
3. Confirm `pgcrypto` is enabled on production via `railway run psql ${DATABASE_URL} -c "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'"` (or the equivalent through the Railway dashboard's psql)

**Checkpoint:** `Winner Picking Phase 1 approved — begin Phase 2`

---

### §2.2 Phase 2 — Draw mutation + SQL shuffle + pool snapshot

**Effort:** 1 day.

**Goal.** A working server-side draw. Calling the new `pickWinners` tRPC mutation creates a `WinnerDraw` row, snapshots the eligible pool to `WinnerDrawPoolEntry` rows, runs the deterministic Postgres shuffle, populates `WinnerDrawSelection` rows with positions and types, and writes the audit log entry. **No UI yet.** Verifiable via tRPC explorer or a unit test that calls the mutation directly.

**Pre-flight:**
- [ ] Phase 1 verified on local + staging + production
- [ ] `pgcrypto` extension confirmed enabled in all three environments
- [ ] V5 master prompt §6 (tRPC layer), §9.5.1 (audit writer) re-read

**Implementation:**
- New tRPC procedure `winner.pickWinners` in `src/server/trpc/routers/winner.ts` (new file). Wire into the root router.
- Procedure inputs (Zod schema):
  - `activationId: z.string().min(1)`
  - `winnerCount: z.number().int().min(1).max(1000)`
  - `reserveCount: z.number().int().min(0).max(1000)`
  - `mrqAccountOnly: z.boolean().default(false)`
  - `eligibilityCutoffAt: z.coerce.date().optional()` — when omitted, defaults to `min(now(), activation.endsAt)` (server-side)
  - `phrase: z.literal("DRAW")` — reject if not exactly "DRAW"
- Permission gate: `ctx.session.user.role === "ADMIN"`. Throw `TRPCError({ code: "FORBIDDEN" })` otherwise.
- Activation existence gate: load the activation by ID. Throw `NOT_FOUND` if missing. The activation must be in `LIVE` or `ENDED` status; reject with `BAD_REQUEST` otherwise.
- Validate `winnerCount + reserveCount > 0`. Reject with `BAD_REQUEST` otherwise.
- Compute eligible pool size with the eligibility filter from §1.2 plus the `mrqAccountOnly` toggle. Reject with `BAD_REQUEST` if `winnerCount + reserveCount > eligiblePoolSize`.
- Generate the seed: `crypto.randomBytes(32).toString("hex")`.
- Open a transaction. Inside the transaction, in this order:
  1. Insert the `WinnerDraw` row with all fields populated. Capture the new `drawId`.
  2. Insert the eligible-pool snapshot — every eligible registration's id, ordered by `id ASC`, with sequential `position`. Use a single `INSERT INTO ... SELECT` query.
  3. Run the shuffle insert per §1.3 step 5 — the parameterised SQL string with the `seed`, `drawId`, and the eligibility filter. Use `prisma.$executeRaw` with proper parameter binding (NEVER string-concatenate). Insert into `WinnerDrawSelection`.
  4. Write the audit log row via `writeAuditLog(...)` with `tx`. Action `winner.draw.created`.
- Return the new `drawId` plus a summary `{ winnerCount, reserveCount, eligiblePoolSize, drawnAt }`.
- New tRPC query `winner.listForActivation` — returns all draws for an activation with eager-loaded selections, sorted by `drawnAt DESC`. Used by the UI in Phase 4. Permission gate: ADMIN + MEMBER.
- Unit tests in `src/server/trpc/routers/__tests__/winner.test.ts`:
  - Happy path: 5 winners + 2 reserves from a pool of 20 produces 7 selections with positions 1..7, first 5 are `WINNER`, last 2 are `RESERVE`
  - Edge: `winnerCount + reserveCount > eligiblePoolSize` rejects
  - Edge: phrase mismatch rejects
  - Edge: MEMBER role rejects with `FORBIDDEN`
  - Edge: activation in DRAFT or SCHEDULED rejects
  - Determinism: given the same seed + drawId + pool, two runs of the shuffle produce identical `position` orderings (run the SQL twice against a fixed test pool)

**Verification:**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passes the new winner test file (other test failures unrelated to this work — the Redis-dependent OTP tests stay flaky locally; that's pre-existing)
- [ ] Manual end-to-end via tRPC: from a logged-in ADMIN session, call `pickWinners` against a real activation. Confirm `WinnerDraw`, `WinnerDrawPoolEntry`, `WinnerDrawSelection` rows appear in the DB and an audit row is present.
- [ ] Repeat the manual call: confirm the second call refuses to re-pick already-selected registrations (the unique constraint on `(activationId, registrationId)` enforces this server-side). Or — if you've not yet built the "additional draw" path — confirm the second call still produces a fresh independent draw whose selections exclude already-won registrations (depending on Phase 3 plan).
- [ ] Determinism test passes: same seed + drawId + pool produces same positions across runs.

**Sections to internalise:**
- §1.2, §1.3, §1.5, §1.7 (this document)
- V5 master §6 (tRPC layer)
- V5 master §9.5.1 (audit writer)
- V5 master §13.2 (structured logging) — for any error logging in the mutation

**What NOT to do in Phase 2:**
- Do not pull all eligible registrations into Node memory and shuffle in JavaScript. Postgres-side shuffle is the contract per §1.3.
- Do not omit the domain-separation tag from the seed input (`seed || ':' || drawId || ':' || id::text`). Two draws on the same activation with the same accidental seed must produce different shuffles.
- Do not use `Math.random()` anywhere in the seed path. Always `crypto.randomBytes`.
- Do not concatenate user input into the SQL string. Always parameterised. The seed is generated server-side; it's safe but the principle stands.
- Do not write the pool snapshot as a JSON column on the draw row. The `WinnerDrawPoolEntry` table is the contract because individual rows can be nulled on erasure independently.
- Do not skip the transaction wrap. The four steps must commit together or roll back together. A draw row without a pool snapshot is a corrupt audit trail.
- Do not add an "auto-promote on draw creation" behaviour. Promotion is triggered by disqualification only. Phase 3 owns it.
- Do not allow the mutation on activations in `DRAFT` or `SCHEDULED` status. Picking winners before an activation has launched is meaningless.
- Do not return the seed to the client UI. The seed is server-side audit material; it doesn't need to be in any response payload.

**Human intervention required at end of Phase 2:**
1. Review the SQL the mutation generates by inspecting Postgres logs during a local manual run, confirm parameters are bound, no string concat
2. Confirm an audit log entry was written for the manual draw
3. **Do not run the mutation against production data** in this phase. Phase 4's UI is the path for that.

**Checkpoint:** `Winner Picking Phase 2 approved — begin Phase 3`

---

### §2.3 Phase 3 — Selection lifecycle mutations (disqualify / promote / notify)

**Effort:** 0.5 day.

**Goal.** The supporting mutations are in place: disqualifying a winner automatically promotes the topmost reserve, marking notified is logged, all transitions are audited. No UI yet.

**Pre-flight:**
- [ ] Phase 2 verified
- [ ] §1.6 (UX surfaces) and §1.7 (audit log entries) re-read

**Implementation:**
- New tRPC procedure `winner.disqualifySelection` — input `{ selectionId, reason: z.string().min(1).max(500) }`. ADMIN-only. In a transaction:
  1. Load the selection with its draw + activation. Reject `NOT_FOUND` if missing. Reject `BAD_REQUEST` if `status !== "SELECTED"` (already disqualified).
  2. Update the selection: `status = DISQUALIFIED`, `disqualifiedAt = now()`, `disqualifiedById = actor`, `disqualifiedReason = reason`.
  3. **If the disqualified selection was a `WINNER`**: find the topmost `RESERVE` selection in the same draw (lowest `position` where `type = RESERVE` AND `status = SELECTED`). If one exists, update it: `type = WINNER`, `promotedFromReserveAt = now()`. If no eligible reserve exists, the winner slot remains unfilled — the admin will need to start a new draw to backfill (Phase 5 / future).
  4. Write audit log: `winner.selection.disqualified` for the disqualified row; if a reserve was promoted, additionally write `winner.selection.promoted`.
- New tRPC procedure `winner.markNotified` — input `{ selectionId, note: z.string().max(2000).optional() }`. ADMIN + MEMBER. Updates `notifiedAt = now()`, `notifiedById = actor`. If `note` is supplied, also updates `notificationNotes`, `notesUpdatedAt = now()`, `notesUpdatedById = actor` and writes a `winner.selection.notes_updated` audit row. Always writes a `winner.selection.notified` audit row.
- New tRPC procedure `winner.updateSelectionNotes` — input `{ selectionId, notes: z.string().max(2000) }`. ADMIN + MEMBER. Updates `notificationNotes`, `notesUpdatedAt = now()`, `notesUpdatedById = actor`. Writes a `winner.selection.notes_updated` audit row capturing `previousLength` and `newLength` only (no content). Used when editing notes after the initial "mark notified" click.
- Unit tests:
  - Disqualifying a winner with reserves available promotes the topmost reserve in a single transaction
  - Disqualifying a winner with no reserves leaves the slot unfilled and writes only the disqualified audit row
  - Disqualifying a reserve does not trigger promotion (reserves don't backfill each other in v1)
  - MEMBER role rejected on `disqualifySelection`
  - Already-disqualified selection cannot be re-disqualified (BAD_REQUEST)
  - `markNotified` works for both ADMIN and MEMBER, writes the audit row, idempotent across multiple calls

**Verification:**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` clean (new and existing)
- [ ] Manual end-to-end: disqualify a winner from the previous Phase 2 draw, confirm DB state shows the original winner as `DISQUALIFIED` and the topmost reserve flipped to `type = WINNER` with `promotedFromReserveAt` set. Confirm two audit rows.
- [ ] Manual end-to-end: mark a selection as notified, confirm the audit row.

**Sections to internalise:**
- §1.6, §1.7 (this document)
- V5 master §9.5.1 (audit writer)

**What NOT to do in Phase 3:**
- Do not allow promotion to be triggered manually by the UI. Promotion is automatic on disqualification of a winner; that's the contract.
- Do not implement reserve-to-reserve promotion. Reserves don't auto-shuffle when a fellow reserve is disqualified. If you need to handle that, it's a v2 concern.
- Do not allow `disqualifySelection` to write directly without a `reason`. The reason is part of the audit record; required by Zod min(1).
- Do not allow a MEMBER to disqualify or promote. Hard FORBIDDEN.
- Do not skip the transaction. Disqualification + promotion are atomic — if promotion fails, the disqualification must roll back.
- Do not add a "redo draw" button or mutation. Out of v1 scope. Disqualify + promote handles the common case; if reserves are exhausted, the team starts a new draw.

**Human intervention required at end of Phase 3:**
None beyond reviewing audit log output for sanity.

**Checkpoint:** `Winner Picking Phase 3 approved — begin Phase 4`

---

### §2.4 Phase 4 — UI: Pick Winners modal

**Effort:** 1 day.

**Goal.** The "Pick winners" button appears on the activation dashboard for ADMINs, opens a modal that walks through compose → drawing → result, and writes a draw via the Phase 2 mutation. Result state shows winners + reserves with revealable emails. **No Winners view yet** — Phase 5 owns that. **No promote/disqualify UI yet** — Phase 5 owns that.

**Pre-flight:**
- [ ] Phase 3 verified
- [ ] §1.6 (UX surfaces — re-read the modal section in detail), V5 master §9.4 (Activation Builder UI for component conventions) re-read

**Implementation:**
- New component `src/components/admin/winner/PickWinnersButton.tsx` — the button that appears on the dashboard. Shown only when `role === "ADMIN"` AND activation status is `LIVE` or `ENDED`.
- New component `src/components/admin/winner/PickWinnersDialog.tsx` — the modal with three states (compose, drawing, result). Uses the existing dialog primitives from V5.
- Compose state form:
  - Number input for winners (`Math.max(1, ...)` clamped)
  - Number input for reserves (defaults to `Math.max(2, Math.ceil(winners * 0.2))`, recomputes when winners changes IF the user hasn't manually edited reserves; once edited, stays at the user's value)
  - MrQ-account toggle
  - Live-fetched `eligiblePoolSize` via a new `winner.previewEligiblePool` query (lightweight — just the count + cutoff that would be used)
  - Phrase gate input (must type "DRAW" exactly)
  - Cutoff time displayed prominently as plain readable text
- Drawing state: spinner + "Selecting winners…" text. Submit triggers the `pickWinners` mutation.
- Result state:
  - Two tables: Winners (positions 1..N) + Reserves (positions N+1..N+M)
  - Email column uses the existing reveal-with-audit pattern from `RegistrationsTable.tsx` — extract the reveal logic into a shared hook if convenient, or duplicate cleanly
  - "Copy winner emails" button (writes the bulk-copy audit row via a new `winner.copyEmails` mutation that returns the list — same audit pattern as `revealAllEmails`)
  - "Done" button closes the dialog and refreshes the activation dashboard query
- Update the activation dashboard page to render `<PickWinnersButton />` for ADMINs alongside existing actions
- Update `winner` router with the lightweight `previewEligiblePool` query and the `copyEmails` mutation

**Verification:**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` clean (existing tests; no new test work mandated for UI)
- [ ] `pnpm build` clean (verify the proxy still detects, all routes register)
- [ ] Manual end-to-end as ADMIN: button visible, modal opens, compose state validates, submitting writes a draw, result state shows winners + reserves, copy-emails writes audit row
- [ ] Manual end-to-end as MEMBER: button hidden. If a MEMBER somehow triggers the mutation (e.g. via a curl), the server returns `FORBIDDEN`.
- [ ] Manual end-to-end: pool size mismatch (request more winners than pool) shows a clear modal-side error and does not call the mutation
- [ ] Phrase gate works: confirm button disabled until "DRAW" typed exactly

**Sections to internalise:**
- §1.5, §1.6 (this document)
- V5 master §9.4 (Activation Builder UI) for component patterns
- The existing `RegistrationsTable.tsx` for the reveal-with-audit pattern

**What NOT to do in Phase 4:**
- Do not duplicate the "Pick winners" button on the registrations table itself. The button lives on the dashboard summary, not the table header.
- Do not implement the disqualify or promote actions in this phase. Phase 5 owns them.
- Do not auto-trigger an email send to winners. Admin-driven for v1; the "Copy winner emails" button is the affordance.
- Do not show the seed in any UI. Server-side audit material only.
- Do not store form-state in the URL. The dialog is ephemeral; closing it discards in-flight state intentionally.
- Do not skip the phrase gate. It's there to prevent muscle-memory clicks on a financially-committing action.
- Do not break the existing eye-icon reveal pattern or the bulk-reveal button. The new winner table mirrors that pattern; do not introduce a third reveal pattern.

**Human intervention required at end of Phase 4:**
1. Visual sanity check of the modal at all three states on a real activation
2. Verify the audit log entries appear in the AuditLog table after a real draw
3. Verify a MEMBER user genuinely cannot see the button (sign in as a MEMBER role and confirm)

**Checkpoint:** `Winner Picking Phase 4 approved — begin Phase 5`

---

### §2.5 Phase 5 — UI: Winners view + selection lifecycle actions

**Effort:** 0.5 day.

**Goal.** A persistent "Winners" section appears on the activation dashboard whenever any draws exist for that activation. Each draw shows its selections; ADMINs can disqualify and (implicitly via disqualification) promote; ADMINs and MEMBERs can mark notified and edit notes.

**Pre-flight:**
- [ ] Phase 4 verified

**Implementation:**
- New component `src/components/admin/winner/WinnersSection.tsx` — renders all draws for an activation, most-recent first.
- Per draw: header with metadata (drawn at, drawn by, cutoff, winnerCount, reserveCount, mrqAccountOnly), then a selections table.
- Selections table: position, type pill (WINNER / RESERVE), status pill (SELECTED / DISQUALIFIED / NOTIFIED / DECLINED / CONFIRMED — color-coded), email (revealable), entry code, MrQ status, action buttons.
- Per-row actions:
  - "Disqualify" (ADMIN-only, hidden if `status !== SELECTED` or this is a reserve where reserves-can't-be-disqualified-in-v1 — actually allow disqualifying reserves too; just no auto-promotion in that case): opens a small inline dialog with a required reason text field. On submit calls `disqualifySelection`.
  - "Mark notified" (ADMIN + MEMBER, available on any non-DISQUALIFIED selection): one-click action. After click, the row shows the notified-by + notified-at and an "Edit notes" affordance.
  - "Edit notes" (ADMIN + MEMBER): inline textarea for `notificationNotes`.
- When a winner is disqualified and a reserve is auto-promoted, the table re-renders with both rows updated. The promoted row shows a small "promoted" badge (or similar) so the admin can see at a glance that the slot was filled.
- Update the activation dashboard page to render `<WinnersSection />` below the registrations table when any draws exist.
- Update `RegistrationsTable.tsx` with a new "State" column showing two possible icons (per §1.6.D):
  - **Trophy/star** when the row has a non-disqualified `WinnerDrawSelection` for this activation. Tooltip shows `Draw #N · Position M · Winner` or `Draw #N · Position M · Reserve`.
  - **🚫 excluded** when `Registration.excluded === true`. Tooltip: "Excluded from winner draws."
  - Both can appear on the same row.
- Both indicators are visible to ADMIN and MEMBER (§1.6.D — non-PII state visibility helps both roles).

**Verification:**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` clean
- [ ] `pnpm build` clean
- [ ] Manual end-to-end as ADMIN: Winners section appears for an activation with draws; disqualifying a winner promotes the topmost reserve; promotion is visible without a page refresh; audit log shows both rows.
- [ ] Manual end-to-end as MEMBER: Winners section visible; disqualify/promote buttons hidden; "Mark notified" + "Edit notes" available and functional; emails revealable per existing reveal pattern.
- [ ] Indicator on the registrations table: ADMIN sees the icon on winner rows; MEMBER sees no additional icon.

**Sections to internalise:**
- §1.5, §1.6 (this document)

**What NOT to do in Phase 5:**
- Do not add a manual "Promote reserve" button. Promotion is automatic on disqualification of a winner. If the team's workflow ever needs a non-disqualification-driven promotion path, that's a v2 conversation.
- Do not show different data to MEMBERs vs ADMINs *beyond* the action-button visibility. Both roles see the same selection rows. Action buttons differ; data does not.
- Do not allow disqualification of an already-disqualified row. The button must be hidden when `status === DISQUALIFIED`.
- Do not allow re-promotion of an already-promoted reserve. Once a row is `type = WINNER`, it stays a winner.
- Do not implement bulk disqualification. Per-row only.
- Do not allow MEMBER to disqualify even by direct API call. The server enforces FORBIDDEN; the UI hides the button.

**Human intervention required at end of Phase 5:**
1. Visual sanity check of the Winners section on a real activation with at least one draw
2. Confirm role-based action gating works in both directions (ADMIN sees action buttons; MEMBER does not)
3. Confirm the audit trail captures all actions — disqualify, promote, notify, edit notes

**Checkpoint:** `Winner Picking Phase 5 approved — begin Phase 6`

---

### §2.6 Phase 6 — Methodology page docs + edge case tests + ship

**Effort:** 0.5 day.

**Goal.** The methodology page covers the new feature so admins discover it via the existing platform-knowledge surface. Edge case test coverage is in place. Final pre-ship walkthrough complete.

**Pre-flight:**
- [ ] Phase 5 verified
- [ ] §1 entire (this document) re-read

**Implementation:**
- Add a new section "13. Picking winners" to `src/app/(admin)/methodology/page.tsx` between the existing sections 12 and 13 (renumber subsequent sections — currently §13 "Data, retention & DSAR", §14 "Glossary"). Subsections:
  - **Eligibility** — restate §1.2 in human language
  - **The algorithm** — explain seed, sha256-postgres-orderby, reproducibility (without exposing the actual SQL)
  - **Reserves** — explain N + M shuffle, why reserves are drawn at the same time as winners
  - **Disqualification + promotion** — the disqualify-and-promote flow
  - **Permissions** — the ADMIN vs MEMBER table from §1.5
  - **Audit trail** — what gets logged (high level)
  - **What's not yet supported** — flagging UI deferred, auto-email deferred, cross-activation rules deferred (so admins don't ask)
- Add a new entry to the methodology TOC.
- Edge case tests in `src/server/trpc/routers/__tests__/winner.test.ts`:
  - Pool of zero (no verified, consenting, non-excluded registrations) → mutation rejects
  - `winnerCount = poolSize`, `reserveCount = 0` → all eligible become winners, no reserves
  - `winnerCount = 1, reserveCount = poolSize - 1` → one winner, everyone else a reserve
  - Two concurrent draws on the same activation should not double-pick (run two `pickWinners` calls in parallel; the unique constraint should make one fail)
  - Erasure: erase a winning participant's `Registration` row (via the existing erasure flow). The `WinnerDrawSelection.registrationId` becomes NULL; the audit trail (status, position, type, disqualifiedReason if any, notifiedAt if any) survives. The pool entry's `registrationId` also becomes NULL.
- Update `.env.example` if needed (no new env vars; this should be unchanged — verify and confirm).
- Run a full typecheck + build + lint pass.

**Verification:**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passes all tests added in Phases 2, 3, and 6
- [ ] `pnpm build` produces a clean build (proxy still detected, no missed routes)
- [ ] `pnpm lint` clean (or whatever the existing lint script is)
- [ ] Methodology page renders the new section cleanly; TOC links to it
- [ ] Manual end-to-end smoke: end-to-end on a real activation — pick winners, disqualify one, watch reserve promote, mark notified, copy emails, view audit log. Every step works without console errors or stack traces.
- [ ] **Performance check**: time `pickWinners` against the largest available staging dataset. The shuffle does a full table scan + per-row `digest()` call by design. Document the wall-clock time in §5 (Known gotchas) for future reference. If it exceeds 10s on a real-world dataset (which would imply >1M registrations on a single activation), surface a follow-up note recommending a functional index or alternative algorithm — but do not implement the optimisation in this feature; v1 is fine for the realistic data scale.

**Sections to internalise:**
- §1 entire (this document)
- The existing methodology page structure for the new section's tone and depth

**What NOT to do in Phase 6:**
- Do not add "follow-up improvements" to the methodology section. Document only what shipped. v2 features go in their own commits and their own doc updates.
- Do not skip the erasure test. It validates the GDPR pattern; if it breaks, the privacy story falls apart.
- Do not ship without re-running the full happy-path manually as both ADMIN and MEMBER.

**Human intervention required at end of Phase 6:**
1. Final review of the methodology page section for accuracy
2. Approval to push all Phase 1–6 commits to production
3. Post-deploy smoke test on production (pick winners on a real activation; this tests pgcrypto on production's specific Postgres version)

**Checkpoint:** `Winner Picking Phase 6 approved — Winner Picking complete`

---

## §3 Output format per phase

For each phase you produce, in this order:

1. **Confirmation** — one line acknowledging you've read this document, the V5 master prompt sections listed in §2.X's "Sections to internalise", and any other documents the phase calls out.
2. **Plan** — bullet list of files you will create or change, one line per file, marked `[NEW]`, `[CHANGED]`, `[GENERATED]` (Prisma-generated migration files), or `[RENAMED <from>]`. This is your read-back to me before writing.
3. **Files** — produce them. Full file contents, not diffs unless the user asks for a diff. No `<placeholder>` tokens — every file commit-ready.
4. **Migration / setup commands** — exact commands to run locally and on Railway. Include `pnpm prisma migrate dev --create-only --name ...` plus the instruction to hand-edit the generated SQL if applicable. For phases with no migration, write "No migration this phase."
5. **Acceptance criteria check** — for each verification item in §2.X, state how you verified it. Be specific. If a check requires a runtime environment you can't reach, say so explicitly and mark it "needs human verification."
6. **Open questions** — anything that wasn't fully specified, one question per concern. Do not batch unrelated questions. If there are no open questions, write "None."
7. **Stop.** Wait for the user to type the exact phase-checkpoint phrase from §2.X. Do not begin the next phase until you receive that exact phrase. Any other input from the user is feedback on the current phase.

---

## §4 What NOT to do across the whole feature

These rules apply to every phase, in addition to the per-phase "What NOT to do" lists.

- **Do not introduce new env vars.** This feature uses no secrets beyond what V5 already provisioned.
- **Do not introduce new top-level libraries.** Use the existing `crypto` from Node's stdlib, `pgcrypto` from Postgres, the existing tRPC + Prisma + Zod stack.
- **Do not add a `WinnerStatus` field to `Registration`.** The selection state lives on `WinnerDrawSelection`. Adding it to Registration creates two sources of truth.
- **Do not add cross-activation logic.** "Has this person won an activation in the last 30 days" is a v2 conversation.
- **Do not add weighted random.** Flat probability for v1.
- **Do not add a UI for editing the `excluded` flag on Registration.** v1 ships with the column; UI is deferred to a follow-up feature.
- **Do not auto-email winners.** Admin-driven copy/paste only.
- **Do not skip British English in user-facing copy.** Match V5's convention.
- **Do not bypass the audit log on any of: draw creation, disqualification, promotion, notification, bulk email copy.** Every action writes one or more audit rows.
- **Do not break the existing reveal-with-audit pattern on emails.** Reuse the existing pattern from `RegistrationsTable.tsx`; do not invent a parallel implementation.
- **Do not allow MEMBER to draw, disqualify, or promote.** ADMIN-only on those three actions, period.
- **Do not modify the existing `Registration` columns beyond adding `excluded`.** Schema discipline.
- **Do not "tidy up" the existing audit categories.** Use `ADMIN` for all winner-picking audit entries (matches the convention of other admin actions).

---

## §5 Known gotchas

- **`pgcrypto` extension is per-database.** Running the migration on a fresh local DB requires the user to have permission to create the extension. On Railway production, the `prisma migrate deploy` step at start time runs as the database owner and has that permission.
- **Postgres `digest()` returns `bytea`, not `text`.** The `encode(..., 'hex')` wrap produces text suitable for `ORDER BY`. Without it, the order is the byte order — which is also deterministic but harder to reason about. Stick with `encode(..., 'hex')`.
- **`row_number() OVER (...)` in Postgres requires a window definition that includes the ordering**. The syntax in §1.3 includes `ORDER BY` inside the window; do not omit it.
- **The seed is a string in the SQL.** When binding the seed parameter, send it as text. Postgres does not need to interpret the bytes.
- **`crypto.randomBytes` returns a Buffer in Node.** Use `.toString("hex")` to get a 64-character hex string. Do not pass the Buffer directly to Prisma's parameter binding — that confuses the parameter type inference.
- **Prisma's `$executeRaw` vs `$executeRawUnsafe`.** Use `$executeRaw` with template-literal parameter binding for the shuffle insert. Never `$executeRawUnsafe` — the latter is string concat and a SQLi vector even with non-user-input params (the discipline matters).
- **Soft-invalidation on activation status changes.** If an activation goes from LIVE to ENDED while a draw is in progress, the in-flight draw uses the cutoff time captured at the start of the request, not at commit. The transaction wraps everything but the cutoff is computed once at request-entry.
- **Concurrent draws on the same activation.** The `@@unique([activationId, registrationId])` on `WinnerDrawSelection` is the safety net. Two parallel `pickWinners` calls may both succeed in selecting some non-overlapping participants and both fail on overlapping ones (one transaction wins, the other fails its insert). Phase 6's concurrency test validates this.
- **Erasure flow.** When a participant is erased, the existing erasure flow at `/admin/erasure` deletes the `Registration` row. The new `onDelete: SetNull` on `WinnerDrawSelection.registrationId` and `WinnerDrawPoolEntry.registrationId` mean the erasure does not break the audit trail. Verify in Phase 6.

---

## §6 What needs human verification (cannot be agent-verified)

These are verification items that require access to environments or data the agent cannot reach. Mark them in the per-phase acceptance criteria as "needs human verification" and surface them clearly:

- **Phase 1** — `pgcrypto` extension installation on Railway production. The agent applies the migration locally and to staging; production rollout is human-coordinated.
- **Phase 2** — manual draw on production data is **not** a verification step. Do not run the mutation on production until Phase 4 ships and the UI is in place.
- **Phase 4** — visual sanity check of the modal across all three states on a real activation. Confirming the role-based button visibility for a real MEMBER user.
- **Phase 5** — visual sanity check of the Winners section. Confirming that disqualifying a winner immediately promotes a reserve in the UI (no page refresh required).
- **Phase 6** — production smoke test after deploy. This validates pgcrypto on production's Postgres version specifically; the staging environment may be a different Postgres minor version.

---

## §7 Authority order recap

- **This document** wins for Winner Picking
- **Iteration 2 master prompt** wins for cross-cutting Iteration 2 conventions
- **V5 master prompt** wins for everything else
- **Training-data intuition** never wins. Re-read the spec.

If a decision isn't covered, surface a single-concern question.

---

## §8 Final notes

- **Migrations land before code that references them.** Phase 1's migration goes to production *before* Phase 2's code is deployed. This is the V5 expand-migrate-contract pattern; the spec assumes you follow it.
- **Each phase commits independently.** Same pattern as the previous batch — one commit per logical unit, all locally first, push only at the end (or per phase if the user gives the all-clear). Do not push without an explicit `push` instruction.
- **The user has full veto on every phase.** "Approved — begin Phase N+1" is the only signal to proceed. Anything else is feedback on the current phase.
- **Build for the long-tail.** This feature will run for years on data the team has not yet collected. The eligibility filter, audit log, and reproducibility guarantees are the load-bearing parts. UI polish is replaceable; the audit trail is not.

End of prompt.

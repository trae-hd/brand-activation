# MrQ Live Field Agent Tool — Master Build Prompt v1

> **Purpose.** A complete, self-contained build proposal for adding a separate field-agent registration support tool to the MrQ Live Activation Platform. This is a **sibling deployment** to the existing `activation-app` — not a new product, not a second source of truth, and not an extension of the admin console. It is a thin, stateless one-page UI plus a narrow API surface, deployed at `fieldactivation.mrq.com` as its own Railway service, sharing the existing monorepo, Prisma client, Postgres database, Redis instance, and shared domain functions with the main platform. Hand this to any capable engineer (or AI assistant) and it should produce a working application without further clarification.
>
> **Relationship to V5.** The V5 master prompt (`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`) remains the source of truth for the participant flow, the admin console, and all platform invariants. Where they overlap (HMAC keys, audit log shape, rate-limit primitive, env validation pattern, Tailwind v4 token rules, British English, UTC at rest, `proxy.ts` rather than `middleware.ts`), V5 wins. Where V5 is silent (everything below), this document is authoritative.
>
> **Why now.** External, on-the-ground agents working brand activations need a way to (a) look up a participant by their entry code and (b) manually register or verify a punter who can't complete the standard OTP flow (lost OTP, no signal, typo'd email). Today this is impossible without giving externals admin access — which conflicts with the platform's `ADMIN`/`MEMBER`-only role model and the `@mrq.com` SSO gate.
>
> **Precursor work (ships first, separately).** `MRQ_LIVE_POST_VERIFY_EMAIL_PROMPT_V1.md` adds a transactional confirmation email so participants can recover their entry code from their inbox. That work materially reduces the rescue caseload this tool will handle and is independently valuable. **Do not merge this proposal's Phases until the post-verify email work has shipped to production.**
>
> **Build proceeds in eight phases (§12).** Each phase has a pre-flight checklist, a verification checklist, an effort estimate, and an explicit checkpoint gate. **Stop at every checkpoint. Do not proceed without human approval.** Phase N+1 begins only on receipt of `Phase [N] approved — begin Phase [N+1]`.

---

## 0. TL;DR

- **One new Railway service.** `field-app` at `fieldactivation.mrq.com`, separate deploy from the existing `activation-app`. Same monorepo (Turborepo + pnpm workspaces), same Prisma client, same Postgres, same Redis.
- **No new database.** All persistence lives in the existing platform Postgres. Two new tables: `FieldAccessGrant`, `FieldAgentSession`. New columns on `Registration` track creation source and verification source independently (with per-action reasons). New columns on `AuditLog` support non-admin actors. DB-level `CHECK` constraints back the source/FK invariants.
- **No business-logic duplication.** Manual register/verify call the **same shared domain functions** the participant API calls today, lifted into `packages/domain`. Source attribution distinguishes the two callers; reasons are recorded per action (register and verify can have different reasons on the same row).
- **Auth is invite-link based, no passwords, no SSO.** Admin issues a named invite from the existing admin console; the agent exchanges it for a host-only session cookie scoped to one activation.
- **One-page UI.** Search-first by entry code (with optional email-fallback search gated by a separate per-grant permission). No customer table. Manual register and manual verify gated behind reason enums, idempotency keys, and an explicit confirmation flag for email reveal.
- **Precursor:** post-verify confirmation email (`MRQ_LIVE_POST_VERIFY_EMAIL_PROMPT_V1.md`) ships first to reduce rescue caseload.
- **Field-agent verifications are excluded from the winner-draw pool.** Closes the most material fraud vector by construction — see §14.1 R1.
- **Compliance story is unified.** One audit log, one DSAR/erasure flow, one retention policy. The new tables fold into the existing 14.1 retention purges.
- **Migrations run via Railway Release Command** on `activation-app`. Field-app trusts the schema it sees.

---

## 1. Purpose & Scope

### 1.1 Problem

Brand activations occasionally use external (agency-supplied) staff at booths. Two real workflows we cannot support today:

1. **Lookup.** Punter walks up to the prize-collection desk with their phone showing an entry code; the agent needs to confirm the registration is real and verified.
2. **Manual rescue.** Punter completed the form but never got the OTP (signal blackspot, mistyped email, dead phone). Today this person is lost — there is no admin override that doesn't require an `@mrq.com` admin to be on the floor.

Giving externals access to `activationadmin.mrq.com` is the wrong answer: it dilutes the admin trust boundary, breaks the `ADMIN`/`MEMBER`-only invariant from V5 §2.3, and would require relaxing the `ALLOWED_EMAIL_DOMAIN` gate.

### 1.2 In Scope (Phase 1)

- New Railway service deployed at `fieldactivation.mrq.com`.
- Email-only invite flow issued from the existing admin console (new admin page + tRPC procedure).
- Host-only session cookie on `fieldactivation.mrq.com`, validity tied to the access grant.
- Re-exchangeable invite (within TTL) with capped exchange count, single concurrent session per grant.
- Risk-based monitoring on session creation (UA / ASN / velocity); soft-locks and Sentry alerts on suspicious patterns.
- Search by entry code; manual register; manual verify (skipping OTP); reveal email.
- Reason enum on every manual write; client-supplied idempotency key.
- Source attribution on `Registration` rows: a manual-via-field-agent registration is distinguishable from a standard OTP registration.
- All actions written to the existing `AuditLog` table, against a new `actorType` axis (existing schema only has `AdminUser` actors — see §3.3).
- Read-only mode for 24h post-`activation.endsAt` for venue-side reconciliation, then session expiry.

### 1.3 Out of Scope (Phase 1)

- SMS/phone delivery of invites. Email-only.
- A customer table view. Search-first only (see §6.4 for the rationale).
- Offline-first / IndexedDB queueing. The field service depends on the platform DB and does not survive a Postgres outage. (Backlog item if real-world venues prove flaky.)
- Bulk operations (bulk verify, bulk export, bulk register). Each action is one punter at a time.
- Self-service password / 2FA for agents. Identity is the invite link plus the named individual on the grant.
- A separate field-side database. We are not building a second source of truth.
- KYC / identity verification of the punter at the booth. Out of scope for the platform.
- Shared UI component package. Premature for Phase 1 — see §8.

---

## 2. Architecture

### 2.1 Railway Topology (Topology A)

```
Railway project: mrq-live-activation
  ├── activation-app    (Next.js 16, existing — admin + participant)
  ├── field-app         (Next.js 16, NEW — UI + API together)
  ├── postgres          (managed, shared)
  └── redis             (managed, shared)
```

Two Next.js services, shared data plane. The new `field-app` is independently deployable, independently rollback-able, has its own Sentry project, its own env, and crashes on its own. A bad admin deploy cannot take field down; a bad field deploy cannot take admin down. See §9 for the precise dependence map.

### 2.2 Monorepo Layout

The proposal assumes the existing repo becomes a pnpm workspace. Today `pnpm-workspace.yaml` exists but contains only the single app. We extend it:

```
mrqlive-brand-activation-tool/
├── apps/
│   ├── activation-app/        # existing app, moved unchanged
│   └── field-app/             # NEW — this proposal
├── packages/
│   ├── domain/                # NEW — shared domain functions (§7)
│   ├── db/                    # NEW — Prisma client, schema, migrations
│   ├── audit/                 # NEW — writeAuditLog (moved from src/lib/audit)
│   ├── rate-limit/            # NEW — fixedWindow (moved)
│   ├── crypto/                # NEW — hmac helpers (moved)
│   ├── redis/                 # NEW — singleton client (moved)
│   └── field-api-contract/    # NEW — Zod schemas + inferred types for /v1/field/*
├── pnpm-workspace.yaml
├── turbo.json                 # NEW — build pipeline orchestration
└── ...
```

The move of existing `src/lib/*` modules into `packages/*` is the necessary cost of a second consumer. **This is a real refactor of the existing app** and must be done before field-app development starts. It cannot be a copy-paste — see §7.

**Build orchestration: Turborepo.** `pnpm` workspaces handle dependency hoisting but do not orchestrate the build graph — `apps/field-app` cannot build until `packages/db` has run `prisma generate`, and `pnpm`'s native answer is brittle script chaining (`pnpm --filter @mrq/db generate && next build`). Turborepo solves this declaratively:

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "db:generate": { "cache": false },
    "build": { "dependsOn": ["^build", "@mrq/db#db:generate"], "outputs": [".next/**", "dist/**"] },
    "lint": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

Two material wins beyond avoiding race conditions:

- **Caching.** A change in `apps/field-app` does not rebuild `apps/activation-app`. Saves Railway build minutes; cuts CI feedback time meaningfully on a monorepo this size.
- **Single source of truth for build order.** `prisma generate` runs once, before anything that imports the generated client.

The cost is a 20-line `turbo.json` and one root-level dev dependency (`turbo`). Worth it on day one — retrofitting Turborepo onto a monorepo with brittle scripts is more painful than starting with it.

### 2.3 Field-app Folder Structure

```
apps/field-app/
├── app/
│   ├── layout.tsx                          # Mobile-first, no chrome
│   ├── page.tsx                            # Search/action page (post-auth)
│   ├── start/page.tsx                      # Invite-link landing
│   ├── expired/page.tsx                    # Session-expired terminal state
│   ├── api/
│   │   └── v1/
│   │       └── field/
│   │           ├── session/
│   │           │   ├── exchange/route.ts   # POST — invite token → cookie
│   │           │   ├── refresh/route.ts    # POST — extend cookie within grant
│   │           │   └── logout/route.ts     # POST — revoke session
│   │           ├── lookup/route.ts         # POST — by entry code
│   │           ├── register/route.ts       # POST — manual add
│   │           ├── verify/route.ts         # POST — manual verify
│   │           └── reveal/route.ts         # POST — unmask email (audited)
│   └── globals.css
├── components/
│   ├── EntryCodeSearch.tsx
│   ├── ManualRegisterDialog.tsx
│   ├── ManualVerifyDialog.tsx
│   ├── ResultCard.tsx
│   └── SessionBadge.tsx
├── lib/
│   ├── env.ts                              # Field-only env (§11.2)
│   ├── session/
│   │   ├── cookie.ts                       # Cookie helpers, host-only
│   │   ├── grant.ts                        # Grant lookup + revoke
│   │   └── risk.ts                         # UA/ASN/velocity scoring
│   └── http/
│       └── responses.ts                    # Structured error shapes
├── proxy.ts                                # Single-host gate
├── package.json
└── ...
```

### 2.4 Why `field-app` contains both UI and API

Considered splitting (Topology B from the brainstorm). Rejected because:

- Host-only cookie on `fieldactivation.mrq.com` requires same-origin between UI and API. Splitting forces either parent-domain cookies (rejected for security — would leak field cookies to admin host) or a server-side proxy in the UI app (which means deploying two services to do the work of one).
- The "service vs UI" separation is preserved at the *code* level (different folders, different module boundaries) without paying for two deploys.

If we ever want to split: the `app/api/v1/field/*` directory is self-contained and can be lifted into its own service later. Code structure does not block that future move.

---

## 3. Data Model

### 3.1 New Tables (added to existing Postgres)

```prisma
enum FieldAgentReason {
  OTP_NOT_RECEIVED
  EMAIL_TYPO_ON_FIRST_ATTEMPT
  NO_SIGNAL_AT_BOOTH
  PARTICIPANT_DEVICE_FAILURE
  OTHER
}
// The first four cover ~99% of venue-floor incidents. OTHER exists as an
// escape hatch but MUST be accompanied by free-text notes — both the UI
// and the API enforce notes-required when reason = OTHER. See §5.1.

model FieldAccessGrant {
  id String @id @default(cuid())

  activation   Activation @relation(fields: [activationId], references: [id], onDelete: Cascade)
  activationId String

  /// Named individual — Article 28 audit anchor. Free text for now;
  /// a future iteration may link to an Agency model.
  agentName    String
  agentEmail   String
  agencyName   String?

  /// HMAC-SHA256(rawToken) using FIELD_INVITE_HMAC_KEY. Raw token emailed once.
  tokenHash    String  @unique

  validFrom    DateTime
  /// Defaults to activation.endsAt + 24h grace at creation time.
  validTo      DateTime
  revokedAt    DateTime?
  revokedById  String?
  revokedBy    AdminUser? @relation("FieldGrantRevoker", fields: [revokedById], references: [id])

  /// Cap on number of session exchanges from this grant. Default 5.
  maxExchanges    Int @default(5)
  exchangeCount   Int @default(0)
  lastExchangedAt DateTime?

  permissions   String[] /// e.g. ["lookup", "manual_register", "manual_verify", "reveal_email"]

  createdAt   DateTime @default(now())
  createdBy   AdminUser @relation("FieldGrantCreator", fields: [createdById], references: [id])
  createdById String

  sessions FieldAgentSession[]

  @@index([activationId, validTo])
  @@index([revokedAt])
}

model FieldAgentSession {
  id String @id @default(cuid())

  grant   FieldAccessGrant @relation(fields: [grantId], references: [id], onDelete: Cascade)
  grantId String

  activation   Activation @relation(fields: [activationId], references: [id], onDelete: Cascade)
  activationId String

  startedAt  DateTime @default(now())
  /// Last seen activity — drives the Active sessions list in admin.
  lastSeenAt DateTime @default(now())
  revokedAt  DateTime?
  /// NEW_EXCHANGE | ADMIN_REVOKE | GRANT_EXPIRY | AGENT_LOGOUT | RISK_LOCK
  revokedReason String?

  ipHash        String
  userAgentHash String
  /// Coarse-grain ASN derived at first-seen for risk scoring. Never raw IP.
  ipAsn         String?

  registrationsManuallyCreated Registration[] @relation("FieldAgentSession_Registrations_Created")
  verificationsByThisSession   Registration[] @relation("FieldAgentSession_Registrations_Verified")

  @@index([grantId, revokedAt])
  @@index([activationId, lastSeenAt])
}
```

Idempotency state lives in Redis, not Postgres. Keyed `field:idem:{sessionId}:{endpoint}:{idempotencyKey}` with a 60-second TTL — see §5.2.

### 3.2 Changes to `Registration`

A registration has **two independent attribution axes**: who *created* the row, and who *verified* it. These are not always the same actor — a field agent can create a registration that the participant later verifies via OTP, or vice versa. The schema reflects both axes separately:

```prisma
enum RegistrationCreatedSource {
  PARTICIPANT
  FIELD_AGENT
}

enum RegistrationVerificationSource {
  OTP
  FIELD_AGENT
}

model Registration {
  // ... existing fields ...

  /// Who created this registration row. Default PARTICIPANT covers all existing
  /// data; FIELD_AGENT means an agent typed in the email manually.
  /// REQUIRED — set on insert.
  createdSource RegistrationCreatedSource @default(PARTICIPANT)

  /// Who verified this registration. NULL until verification happens (PENDING rows
  /// have no source). Set to OTP when /api/verify completes; FIELD_AGENT when
  /// the field tool's manual-verify endpoint completes.
  verificationSource RegistrationVerificationSource?

  /// FK to the field session that *created* this registration. Null for PARTICIPANT.
  createdByFieldSession   FieldAgentSession? @relation("FieldAgentSession_Registrations_Created", fields: [createdByFieldSessionId], references: [id], onDelete: SetNull)
  createdByFieldSessionId String?

  /// FK to the field session that *verified* this registration. Null for OTP and PENDING.
  verifiedByFieldSession   FieldAgentSession? @relation("FieldAgentSession_Registrations_Verified", fields: [verifiedByFieldSessionId], references: [id], onDelete: SetNull)
  verifiedByFieldSessionId String?

  /// Reason supplied by the agent at manual REGISTER time.
  /// Required when createdByFieldSessionId is set.
  fieldRegisterReason FieldAgentReason?
  fieldRegisterNotes  String?

  /// Reason supplied by the agent at manual VERIFY time. Distinct from register
  /// reason because a registration can be agent-created with one reason and
  /// agent-verified later with a different reason.
  /// Required when verifiedByFieldSessionId is set.
  fieldVerifyReason FieldAgentReason?
  fieldVerifyNotes  String?

  // ... existing indexes ...
  @@index([createdSource, activationId])
  @@index([verificationSource, activationId])
}
```

The four legitimate combinations:

| Scenario | `createdSource` | `verificationSource` | `createdByFieldSessionId` | `verifiedByFieldSessionId` |
|---|---|---|---|---|
| Standard participant flow | `PARTICIPANT` | `OTP` (after verify) | null | null |
| Agent registers, agent verifies | `FIELD_AGENT` | `FIELD_AGENT` | set | set |
| Agent registers, participant later OTPs | `FIELD_AGENT` | `OTP` | set | null |
| Participant registers, agent rescues with manual verify | `PARTICIPANT` | `FIELD_AGENT` | null | set |

Pending (unverified) rows always have `verificationSource = null` and `verifiedByFieldSessionId = null`.

**Backfill:** existing rows get `createdSource = PARTICIPANT` and `verificationSource = OTP` for `VERIFIED` rows, or `verificationSource = NULL` for `PENDING`/`EXPIRED` rows. The migration must NOT label any existing data as `FIELD_AGENT`.

### 3.3 Changes to `AuditLog`

The existing `AuditLog.actor` relation is to `AdminUser`. Field agents are not admin users. Two options:

- **(Recommended)** Add `actorType` enum (`ADMIN`, `FIELD_AGENT`, `SYSTEM`) and a nullable `fieldAgentSessionId` FK. Existing rows backfill to `actorType = ADMIN` (or `SYSTEM` where `actorId IS NULL`).
- (Alternative — rejected) Create a synthetic `AdminUser` row per field session. Conflates roles, breaks the role gate, distorts admin-user lists.

Schema delta:

```prisma
enum AuditActorType {
  ADMIN
  FIELD_AGENT
  SYSTEM
}

model AuditLog {
  // ... existing fields ...
  actorType         AuditActorType @default(ADMIN)
  fieldAgentSession FieldAgentSession? @relation(fields: [fieldAgentSessionId], references: [id], onDelete: SetNull)
  fieldAgentSessionId String?

  @@index([actorType, createdAt])
}
```

This is a meaningful change to a load-bearing table. It must ship as its own migration in advance of any field-app code so the existing app's audit writes (currently `actorId`-only) aren't disrupted.

**Backfill matrix.** Existing rows must be classified explicitly, not left to the default:

| Existing row condition | Backfill `actorType` | Backfill `fieldAgentSessionId` |
|---|---|---|
| `actorId IS NOT NULL` | `ADMIN` | `NULL` |
| `actorId IS NULL` | `SYSTEM` | `NULL` |

Application-level invariant going forward (enforced in `writeAuditLog`):

| `actorType` | `actorId` | `fieldAgentSessionId` |
|---|---|---|
| `ADMIN` | required | `NULL` |
| `FIELD_AGENT` | `NULL` | required |
| `SYSTEM` | `NULL` | `NULL` |

A DB-level CHECK constraint enforcing this is added post-backfill — see §3.5.

### 3.4 New Audit Actions

```
field.grant_created
field.grant_revoked
field.session_created           # first or subsequent exchange
field.session_resumed           # cookie-only, no exchange
field.session_replaced          # new exchange revoked previous session
field.session_expired
field.session_logged_out
field.suspicious_exchange       # risk score crossed threshold
field.lookup
field.email_lookup
field.email_revealed
field.manual_register
field.manual_verify
field.soft_lock_triggered
field.soft_lock_cleared
field.rate_limit_hit
```

All written via the shared `writeAuditLog` with `actorType: 'FIELD_AGENT'` and `fieldAgentSessionId` populated. `targetType` / `targetId` use existing conventions (`Activation`, `Registration`).

### 3.5 Database-level Constraints

Domain-code invariants are necessary but not sufficient for a compliance-sensitive feature. Where the rule is stable and the migration is tractable, we add a Postgres `CHECK` constraint via raw SQL in the migration. Prisma 6 does not model `CHECK` constraints natively; they are added in a follow-up `prisma migrate dev --create-only` migration after the relevant column-adding migration ships and the backfill completes.

**Three constraints to add:**

```sql
-- After Phase 1 schema lands and backfill completes:

-- Registration.createdSource ↔ createdByFieldSessionId
ALTER TABLE "Registration"
  ADD CONSTRAINT "registration_created_source_fk_consistency"
  CHECK (
    ("createdSource" = 'PARTICIPANT' AND "createdByFieldSessionId" IS NULL) OR
    ("createdSource" = 'FIELD_AGENT' AND "createdByFieldSessionId" IS NOT NULL)
  );

-- Registration.verificationSource ↔ verifiedByFieldSessionId
-- (NULL is permitted on both — that's a PENDING/EXPIRED row.)
ALTER TABLE "Registration"
  ADD CONSTRAINT "registration_verification_source_fk_consistency"
  CHECK (
    ("verificationSource" IS NULL AND "verifiedByFieldSessionId" IS NULL) OR
    ("verificationSource" = 'OTP' AND "verifiedByFieldSessionId" IS NULL) OR
    ("verificationSource" = 'FIELD_AGENT' AND "verifiedByFieldSessionId" IS NOT NULL)
  );

-- AuditLog.actorType ↔ actorId / fieldAgentSessionId
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "audit_log_actor_type_consistency"
  CHECK (
    ("actorType" = 'ADMIN' AND "actorId" IS NOT NULL AND "fieldAgentSessionId" IS NULL) OR
    ("actorType" = 'FIELD_AGENT' AND "actorId" IS NULL AND "fieldAgentSessionId" IS NOT NULL) OR
    ("actorType" = 'SYSTEM' AND "actorId" IS NULL AND "fieldAgentSessionId" IS NULL)
  );
```

**Why DB-level, not just code-level:**

- Catches future code paths that bypass the shared domain functions (e.g. a one-off SQL fix, a misguided Prisma Studio edit, a future engineer adding a parallel write path).
- Makes reporting and audit reviews trustworthy — a stakeholder asking "could a row exist in state X?" gets a definitive `NO` from the DB, not a "we believe so."
- Compensates for the fact that INVARIANT-002 lives in code and could in principle drift.

**Why not Prisma-native:** Prisma 6 has no first-class `@@check` annotation for arbitrary multi-column constraints. The SQL is written by hand into the migration file; Prisma's `--create-only` flow makes this straightforward.

**When to apply:** the constraint migrations land *after* the data backfill completes successfully. Applying them before backfill would reject the migration on rows that haven't yet been classified.

---

## 4. Authentication & Session

### 4.1 Invite Issuance (admin side)

Admin opens an activation in the existing admin console. New page section: **Field Access**. New tRPC router `fieldAccess`:

```ts
fieldAccess.create
  input: {
    activationId: string,
    agentName: string,
    agentEmail: email,
    agencyName?: string,
    permissions: ("lookup" | "lookup_by_email" | "manual_register" | "manual_verify" | "reveal_email")[],
    validFrom?: DateTime,    // default: now
    validTo?: DateTime,      // default: activation.endsAt + 24h
    maxExchanges?: number,   // default: 5
    dpaAcknowledged: true,   // hard gate; checkbox in UI
  }
  output: {
    grantId: string,
    rawToken: string,        // SHOWN ONCE — never persisted, never logged, never sent again
    inviteUrl: string,       // https://fieldactivation.mrq.com/start#<rawToken>
  }
```

Token format: 32 random bytes, base64url. Stored as `tokenHash = HMAC-SHA256(rawToken, FIELD_INVITE_HMAC_KEY)`. The raw value goes:

1. Into the success modal (admin can copy / show / read aloud)
2. Into the agent's email inbox via Resend
3. Nowhere else

Sibling adminProcedures: `fieldAccess.revoke`, `fieldAccess.list`, `fieldAccess.listSessions`, `fieldAccess.unlockSoftLock`.

### 4.2 Invite Email

Sent synchronously from the tRPC mutation via the existing `EmailProvider` interface. New template `apps/activation-app/src/lib/email/templates/fieldInviteEmail.tsx`. British English, MrQ Live branding, no tracking pixels.

Copy:

> Hi <agentName>,
>
> You've been added as a field agent for <activationName> at <venue>. Open the link below at the start of your shift to sign in. Keep this email available — if you get logged out, reopen the link.
>
> **Sign in:** <inviteUrl>
>
> Access expires <ISO datetime, Europe/London>.

No "bookmark this" instruction — the link is a recovery key, not a long-term reference.

### 4.3 Session Creation (field-app side)

Flow at `https://fieldactivation.mrq.com/start#<rawToken>`:

1. Page reads token from URL fragment (never query string — fragments aren't sent to servers in the request line, reducing log leakage).
2. Page POSTs to `/api/v1/field/session/exchange` with `{ token: rawToken }`.
3. Server-side:
   1. `tokenHash = HMAC-SHA256(rawToken)` — constant-time lookup against `FieldAccessGrant.tokenHash` using `crypto.timingSafeEqual` after fixed-length comparison.
   2. Reject if grant not found, revoked, outside `[validFrom, validTo]`, or `exchangeCount >= maxExchanges`.
   3. Run risk-scoring (UA + ASN + recent exchange velocity) — see §4.5.
   4. **Revoke any existing active session** on this grant (`revokedReason = 'NEW_EXCHANGE'`).
   5. Create a new `FieldAgentSession` row.
   6. Increment `exchangeCount`, set `lastExchangedAt`.
   7. Audit `field.session_created` (or `field.session_replaced` if there was a prior active session).
   8. Set the session cookie. Return `{ sessionId, activation: { id, name, slug }, validUntil }`.

### 4.4 Session Cookie

```
Name:        mrq_field_session
Value:       opaque session id (HMAC-signed; the field-app server resolves it)
Domain:      (host-only — no Domain attribute set, so the cookie is bound to fieldactivation.mrq.com)
Path:        /
HttpOnly:    true
Secure:      true
SameSite:    Lax
Max-Age:     (grant.validTo - now) seconds — refreshed on every request
```

**Cookie Max-Age is a hint; the server checks `grant.validTo` on every request.** If admin extends the grant, cookies stop being source-of-truth on the next request automatically.

The cookie is **host-only** (no `Domain` attribute) so it is *not* sent to `activationadmin.mrq.com` or any other subdomain. This preserves the separation-of-concerns boundary at the cookie layer.

### 4.5 Risk-based Monitoring

On every exchange and every authenticated request, compute:

| Signal | Threshold | Action |
|---|---|---|
| Exchanges per grant in 10 min | > 3 | Alert `field.suspicious_exchange`, **soft-lock writes** |
| UA family change between exchanges | yes | Alert |
| ASN change between exchanges | yes | Alert |
| Country change between exchanges | yes | Alert + soft-lock writes |
| Approaching `maxExchanges` | within 1 | Alert (informational) |
| Manual verifies per session | > 20 / hour | Alert + soft-lock writes |
| Manual registers per session | > 30 / hour | Alert + soft-lock writes |
| Email reveals per session | > 50 / day | Alert + lock; admin must clear |
| Email lookups per session | > 20 / day | Soft-lock (possible enumeration) |
| Failed entry-code lookups | > 50 / 10 min | Soft-lock (possible enumeration) |

Soft-lock = write endpoints return `423 Locked`; lookup remains available; admin sees a "Reconfirm to unlock" button. Unlock writes `field.soft_lock_cleared`.

**Unlock UX is deliberately one click.** Legitimate bursts will happen — a busload of punters arrives at the booth exactly as the cell tower drops, an agent ploughs through the queue legitimately. The system fails *secure* (write endpoints freeze) but must recover *fast* (the venue manager can unblock without typing a phrase, leaving the page, or navigating menus). Concretely:

- Admin reviews the suspicious-exchange / velocity context inline on the soft-locked session card (which signals fired, when, and what the agent has been doing).
- Single click on **Clear lock** unblocks writes immediately. An optional one-line reason input is shown but not required.
- The unlock event is audited with `field.soft_lock_cleared`, the admin's `actorId`, the soft-lock reason that triggered it, and the optional admin note.
- Repeated unlocks on the same session within a short window (e.g. 3 in 30 minutes) escalate from soft-lock to hard-lock, requiring grant revocation and re-issue.

The asymmetry is intentional: the tool should be cautious about *staying open* and generous about *getting back open*. Anything heavier (typed phrases, two-admin approval) makes the venue lead reach for Slack and the participant walk away.

ASN/country resolution is best-effort via Cloudflare's `cf-ipcountry` and `cf-ipasn` headers if proxied through CF; otherwise a stubbed `null` (alerts on those signals are suppressed when null). Never persist raw IPs — only hashes plus the coarse ASN.

### 4.6 Revocation

- **Admin revoke** on the grant: `revokedAt` is set; all active sessions on the grant are revoked (`revokedReason = 'ADMIN_REVOKE'`); cookie validation fails on next request.
- **Agent logout**: revokes the session row only; the grant is still usable to issue a new session within the exchange cap.
- **Grant expiry**: validation rejects on `validTo`; no cleanup needed beyond retention purge (§10.3).

---

## 5. API Contract — `/v1/field/*`

All routes:

- POST only (yes, including reads — keeps audit and idempotency consistent; we are not optimising for caching).
- JSON request/response.
- Zod-validated at the route boundary.
- `activationId` is **never** read from the request body. Always derived server-side from the session.
- Structured error shape: `{ error: { code: string, message: string } }`. Never includes PII.
- Versioned at `/v1/field/...`. A breaking change ships as `/v2/...` with a deprecation window.
- Shared schemas and inferred types live in `packages/field-api-contract`, consumed by the field-app's API routes and any future client. Zod schemas are the source of truth; TypeScript types are inferred via `z.infer<>`.

### 5.1 Endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v1/field/session/exchange` | `{ token }` | `{ sessionId, activation, validUntil }` |
| `POST /v1/field/session/refresh` | `{}` | `{ validUntil }` |
| `POST /v1/field/session/logout` | `{}` | `{ ok: true }` |
| `POST /v1/field/lookup` | `{ entryCode }` | `{ found, registration?: { entryCode, status, verifiedAt, emailMasked } }` |
| `POST /v1/field/lookup-by-email` | `{ email }` | `{ found, registration?: { entryCode, status, verifiedAt, emailMasked } }` — separate endpoint, gated by `lookup_by_email` permission |
| `POST /v1/field/reveal` | `{ entryCode, confirmation: true }` | `{ email }` (audited) |
| `POST /v1/field/register` | `{ email, reason, notes?, idempotencyKey }` | `{ registrationId, status }` |
| `POST /v1/field/verify` | `{ entryCode? \| email?, reason, notes?, idempotencyKey }` | `{ registrationId, status: "VERIFIED" }` |

**Verify endpoint validation rules:**

1. Exactly one of `entryCode` or `email` must be present.
2. If `reason === 'OTHER'`, `notes` is required and must be at least 10 characters of meaningful free text (not whitespace-only).

```ts
export const FieldVerifyRequestSchema = z.object({
  entryCode: z.string().optional(),
  email: z.string().email().optional(),
  reason: FieldAgentReasonSchema,
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid(),
})
.refine(
  (data) => Boolean(data.entryCode) !== Boolean(data.email),
  { message: 'Provide exactly one of entryCode or email', path: ['entryCode'] }
)
.refine(
  (data) => data.reason !== 'OTHER' || (data.notes && data.notes.trim().length >= 10),
  { message: 'Notes (≥ 10 chars) are required when reason is OTHER', path: ['notes'] }
)
```

The same `OTHER ⇒ notes` rule applies to the register endpoint:

```ts
export const FieldRegisterRequestSchema = z.object({
  email: z.string().email(),
  reason: FieldAgentReasonSchema,
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid(),
})
.refine(
  (data) => data.reason !== 'OTHER' || (data.notes && data.notes.trim().length >= 10),
  { message: 'Notes (≥ 10 chars) are required when reason is OTHER', path: ['notes'] }
)
```

The UI mirrors this: the notes field is hidden when one of the four common reasons is selected, and dynamically becomes a required input with a 10-character minimum when `OTHER` is picked. Server-side validation is the source of truth — agents cannot bypass the rule by tampering with the client.

Entry code is the preferred identifier — it's what the agent has on the punter's phone in front of them. Email is the fallback for the case where the punter never received a confirmation but knows the email they registered with.

**Reveal endpoint requires explicit confirmation.** The body's `confirmation: true` is a hard literal — Zod `z.literal(true)`. The UI surfaces this as a confirmation drawer:

```
Reveal this participant's email?
This will be recorded in the audit log.
[Cancel] [Reveal email]
```

This is to make email reveal — the highest-PII action in the tool — visibly intentional rather than a tap-misfire.

**Email lookup endpoint (`/v1/field/lookup-by-email`).** This exists for the rescue case where the punter cannot produce their entry code (lost their confirmation email — see prerequisite work in `MRQ_LIVE_POST_VERIFY_EMAIL_PROMPT_V1.md` — or never had it because their device failed mid-flow). It is a **separate endpoint** from `/lookup`, not an overload, because:

- Different permission gate (`lookup_by_email` is OFF by default on grants).
- Different rate limit (much tighter — see §5.3).
- Different audit action (`field.email_lookup` not `field.lookup`).
- Different risk-scoring threshold.

**Anti-enumeration shape.** Email lookup re-introduces the membership-probe risk that V5 §1 explicitly designed against in the participant flow. Mitigations are layered:

1. **Permission gating.** A grant without `lookup_by_email` rejects the endpoint with a 403 even before the email is read. Default OFF; admin must explicitly tick at grant creation.
2. **Identical-shape responses.** Internally, `found: false` and `found: true` take the same code path and timing. Implementation: always run the lookup; if no row, populate the response with `{ found: false }`; both code paths go through the same `await new Promise(r => setTimeout(r, baselineMs))` floor before returning. Agents cannot probe membership by timing.
3. **Heavy rate limit and risk-scoring.** See §5.3.
4. **Distinct audit action with metadata.** Every email lookup writes `field.email_lookup` with `metadata.emailHash` and `metadata.found: boolean`. Admin reporting can graph email-lookup volume per grant, filter for high `found: false` ratios (which indicate enumeration sweeps).

### 5.2 Idempotency

Every write endpoint requires a client-generated `idempotencyKey` (UUID v4). Server-side dedup:

- Key: `field:idem:{sessionId}:{endpoint}:{idempotencyKey}`
- Storage: Redis, TTL 60 seconds.
- First request with a fresh key: process and cache the response body.
- Replay within TTL: return the cached response, do **not** re-execute.
- After TTL: replay is treated as a new request (acceptable trade — agents won't retry after 60s).

### 5.3 Rate Limits

Reuse the existing `fixedWindow` primitive from `packages/rate-limit`:

| Key shape | Limit | Window |
|---|---|---|
| `field:rl:exchange:{ipHash}` | 10 | 5 min |
| `field:rl:lookup:{sessionId}` | 60 | 1 min |
| `field:rl:lookup_by_email:{sessionId}` | 10 | 1 hour |
| `field:rl:write:{sessionId}` | 30 | 1 min |
| `field:rl:reveal:{sessionId}` | 20 | 5 min |

429s are audited with `category: SECURITY, action: 'field.rate_limit_hit'` (closes BACKLOG 4.3 for the field surface).

### 5.4 Email Masking & Reveal

`emailMasked` format: `j***@e******.com` — first character of local-part, first character of domain, exact dots preserved. Reveal endpoint returns the unmasked email and writes `field.email_revealed` with `targetId = registrationId`. Reveal counts toward the daily limit; reveals on the same registration within 5 minutes are de-duped at the audit layer (single audit row, count incremented in metadata).

---

## 6. UI Scope

Mobile-first, dark-mode-default (venue floors are dim, screens are bright). Three pages.

### 6.1 `/start` — Invite Landing

- Reads token from URL fragment.
- POSTs to exchange; shows a "Signing you in…" state.
- On success → redirect to `/`.
- On failure → "Invite expired or invalid. Contact your event lead." with a `mailto:` to the configured ops contact.

### 6.2 `/` — Search and Actions

```
┌─────────────────────────────────────┐
│ Cheltenham Brand Activation          │
│ Jane Smith · Active Agency           │
│ Access expires: 02:00                │
├─────────────────────────────────────┤
│  Entry code                          │
│  ┌─────┬──────────────┐ ┌────────┐  │
│  │CHL- │              │ │ Search │  │
│  └─────┴──────────────┘ └────────┘  │
│   prefix    ↑ user types this        │
├─────────────────────────────────────┤
│  Result                              │
│  Entry code: CHL-A8K2                │
│  Status: ✅ Verified                  │
│  Email: j***@e******.com [Reveal]    │
│  Verified: 17:42                     │
│                                      │
│  [ Add a punter manually ]           │
│  [ Verify a punter manually ]        │
└─────────────────────────────────────┘
```

**Entry-code prefix UX.** Each activation has an optional `entryCodePrefix` (e.g. `CHL-` for the Cheltenham activation) — see V5 schema. The search input renders the prefix as a fixed, non-editable affix; the agent only types the suffix. On submit, the client concatenates `prefix + suffix` and posts the full code to `/v1/field/lookup`. Server-side `normalizeEntryCode` (§7.1) is still applied. If `entryCodePrefix` is null on the activation, the input has no affix and accepts the full code.

The same prefix UX is mirrored in the existing admin registrations table search to keep the experience consistent across surfaces.

- No table view. No pagination. No bulk export. No filters.
- "Add manually" opens a sheet (Vaul drawer): email + reason enum + notes (conditionally required when reason = OTHER) + submit.
- "Verify manually" same shape: entry code (with prefix affix) or email + reason + notes + submit.
- All forms include a hidden idempotency key generated on render.
- Success state shows a green check + the entry code; failure surfaces a structured error message.

### 6.3 `/expired`

Terminal state shown when:

- Cookie is invalid or expired
- Grant is revoked
- Soft-lock is active for writes (in which case lookup-only banner shows instead)

Copy: "Your session has ended. Reopen your invite link to resume. If you've lost it, contact <ops contact>."

### 6.4 What we Deliberately do NOT Build

- **Customer table** (single largest exposure surface — not for Phase 1).
- **Per-booth filtering** (search by entry code is sufficient).
- **CSV export** of any kind.
- **"Resend OTP" button** (the existing participant flow handles that — agents use lookup, not resend).
- **Settings, profile, theme toggle** (one-page tool; nothing to configure).

---

## 7. Domain Function Reuse

This is the integrity-critical part of the proposal. Field-app must **not** reimplement registration or verification logic.

### 7.1 Functions to Extract into `packages/domain`

From the existing `apps/activation-app/src/app/api/register/route.ts`, `verify/route.ts`, and `src/server/trpc/routers/registration.ts`:

```ts
// packages/domain/src/registration/register.ts
export async function registerParticipant(args: {
  activationId: string
  email: string
  consent: { mrqContactConsent: boolean; consentItemsAccepted: ConsentItem[] }
  ipHash: string
  userAgentHash: string
  source:
    | { kind: 'PARTICIPANT'; boothCode?: string; utm?: UtmTriple }
    | { kind: 'FIELD_AGENT'; sessionId: string; reason: FieldAgentReason; notes?: string }
  tx?: Prisma.TransactionClient
}): Promise<RegistrationResult>
// Sets `createdSource` and (when source.kind === 'FIELD_AGENT') `createdByFieldSessionId`,
// `fieldRegisterReason`, `fieldRegisterNotes`. Never touches verification columns.

// packages/domain/src/registration/verify.ts
export async function verifyParticipant(args: {
  registrationId: string
  source:
    | { kind: 'PARTICIPANT'; otp: string }
    | { kind: 'FIELD_AGENT'; sessionId: string; reason: FieldAgentReason; notes?: string }
  tx?: Prisma.TransactionClient
}): Promise<VerifyResult>
// Sets `verificationSource` and (when source.kind === 'FIELD_AGENT')
// `verifiedByFieldSessionId`, `fieldVerifyReason`, `fieldVerifyNotes`.
// Never touches creation columns.
```

Two further utilities also live in `packages/domain` so the field-app and the existing app produce identical outputs:

```ts
// packages/domain/src/entryCode/normalize.ts
/**
 * Canonicalise a user-typed entry code for lookup.
 * Trims whitespace, uppercases, strips any non-alphanumeric character.
 * Used by the field UI input handler AND the lookup endpoint server-side
 * so an extra space or hyphen never causes a "not found" miss.
 */
export function normalizeEntryCode(input: string): string

// packages/domain/src/entryCode/lookup.ts
/**
 * Find a Registration by entry code, scoped to a single activation. The
 * lookup is robust to whether the agent typed the prefix or only the suffix:
 *  - If `activation.entryCodePrefix` is set and the input does NOT start
 *    with it, the prefix is prepended before matching.
 *  - If the input already starts with the prefix, it is used as-is.
 *  - All comparisons run on the normalised form (uppercase, alnum only).
 *
 * Returns null if no row matches. Never throws on "not found" — the
 * route handler maps null to the structured "not found" response shape.
 */
export async function lookupRegistrationByEntryCode(args: {
  activationId: string
  rawInput: string
  tx?: Prisma.TransactionClient
}): Promise<Registration | null>

// packages/domain/src/email/mask.ts
/** Mask an email for display: 'jane@example.com' → 'j***@e******.com' */
export function maskEmail(email: string): string
```

Both functions write the audit row and the source-attribution columns atomically with the registration write, in a single Prisma transaction.

**The `if (source.kind === 'FIELD_AGENT')` discriminator is permitted *only* for**:

- Skipping OTP issuance/verification on register/verify
- Setting `createdByFieldSessionId` / `verifiedByFieldSessionId`
- Recording `fieldRegisterReason` / `fieldRegisterNotes` / `fieldVerifyReason` / `fieldVerifyNotes`
- Choosing the audit action name

All eligibility, consent versioning, rate-limit composition, MRQ enrichment scheduling, and `entryCode` generation are unchanged regardless of source.

### 7.2 New Invariants (proposed)

> **INVARIANT-002 · Registration creation and verification source attribution**
>
> **Files (must stay in lockstep):**
> - `packages/domain/src/registration/register.ts` — sets `createdSource` and (for field agents) `createdByFieldSessionId`, `fieldRegisterReason`, `fieldRegisterNotes`
> - `packages/domain/src/registration/verify.ts` — sets `verificationSource` and (for field agents) `verifiedByFieldSessionId`, `fieldVerifyReason`, `fieldVerifyNotes`
> - Postgres `CHECK` constraints `registration_created_source_fk_consistency` and `registration_verification_source_fk_consistency` (§3.5) — the database-level backstop
>
> **Risk if drift:** A row could lie about who created or verified it. A field-agent-created registration that ends up with `createdSource = PARTICIPANT` is undetectable in reporting and indistinguishable from a normal participant flow — destroying the audit value of the feature. Likewise an OTP-verified row with `verifiedByFieldSessionId` set would falsely claim manual verification.
>
> **Caught by:**
> 1. Postgres `CHECK` constraints reject inconsistent inserts/updates outright.
> 2. Unit tests in `packages/domain/__tests__` that assert each of the four legitimate combinations (§3.2 table) round-trips correctly.
> 3. Integration test in `apps/field-app/__tests__` that runs the full manual-verify flow against a real Postgres and asserts the resulting row matches the expected source/FK shape.

> **INVARIANT-003 · Audit log actor consistency**
>
> **Files (must stay in lockstep):**
> - `packages/audit/writeAuditLog.ts` — application-level enforcement of the (`actorType`, `actorId`, `fieldAgentSessionId`) matrix in §3.3
> - Postgres `CHECK` constraint `audit_log_actor_type_consistency` (§3.5) — the database-level backstop
>
> **Risk if drift:** An audit row that misclassifies its actor (e.g. an `ADMIN` row with no `actorId`, or a `FIELD_AGENT` row with both `actorId` and `fieldAgentSessionId` set) breaks DSAR exports, breaks the audit-log filter on the admin Field Sessions page, and breaks any future reporting that segments admin actions from field-agent actions.
>
> **Caught by:** Postgres `CHECK` constraint plus a `writeAuditLog` unit test that exercises every combination.

Both to be added to `INVARIANTS.md` when this lands.

---

## 8. What's Shared vs What's Separate (and Why)

This section answers a question that will keep coming up: "if we're sharing domain logic, why aren't we sharing UI and API routes too?"

### 8.1 What we share

| What | Where | Why |
|---|---|---|
| Prisma client + schema + migrations | `packages/db` | One source of truth for the database. Two clients drifting against the same DB is a recipe for bugs. |
| Domain logic (register, verify, etc.) | `packages/domain` | Same business rules must apply regardless of caller. INVARIANT-002 is built on this. |
| Audit writes | `packages/audit` | Single audit table; one writer ensures one shape. |
| Rate-limit primitive | `packages/rate-limit` | The atomic Lua-script `fixedWindow` is non-trivial; copy-paste invites drift. |
| HMAC helpers | `packages/crypto` | `EMAIL_HASH_HMAC_KEY` and `IP_HMAC_KEY` are platform invariants per V5 §14.4 — we hash identically across both apps or dedup breaks. |
| Redis singleton | `packages/redis` | Avoids two ioredis clients fighting over the same connection pool config. |
| Zod schemas + inferred request/response types | `packages/field-api-contract` | Field UI and field API live in the same app today, but the contract boundary documents the API for future evolution. Schemas are source of truth; types are inferred via `z.infer<>`. |
| Zod validation schemas | Co-located in `packages/domain` | A schema and the domain function it guards belong together. |

### 8.2 What we deliberately do NOT share

#### API Route Handlers

**Cannot be shared across Next.js apps.** Next.js App Router resolves routes from the filesystem of *one* app at build time. There is no `import { POST } from '@mrq/admin/app/api/...'` mechanism. Each app has its own `app/api/...` tree.

What we share instead is the **logic** the route handler invokes (`packages/domain`), the **types** (`packages/field-api-types`), and the **schemas** (Zod). The route handler itself is a thin shell:

```ts
// apps/field-app/app/api/v1/field/register/route.ts
import { z } from 'zod'
import { registerParticipant } from '@mrq/domain/registration'
import { RegisterRequestSchema } from '@mrq/field-api-contract'
import { requireFieldSession } from '@/lib/session/grant'

export async function POST(req: Request) {
  const session = await requireFieldSession(req)
  const body = RegisterRequestSchema.parse(await req.json())
  const result = await registerParticipant({
    activationId: session.activationId,
    email: body.email,
    // ...
    source: {
      kind: 'FIELD_AGENT',
      sessionId: session.id,
      reason: body.reason,
      notes: body.notes,
    },
  })
  return Response.json(result)
}
```

The handler is ~20 lines. There is no meaningful duplication to factor out.

#### UI Components

**Could** be shared via `packages/ui`. **Phase 1 ROI is low.** The field-app is genuinely tiny (3 pages, ~5 components). The admin and field apps also have very different UX (admin is desktop-first dense data tables; field is mobile-first, single-task, dim-room). Sharing components would couple two surfaces that should evolve independently.

Promote to a shared package when:

- A third consumer appears (e.g. a different vendor portal)
- The same primitive has been copy-pasted 3+ times
- A design-system overhaul makes a single source of truth worth the workspace overhead

For Phase 1: the field-app gets its own `components/` directory with copies of the shadcn primitives it actually uses (~5 of them). Tailwind tokens (`@theme inline`) are copied verbatim from `apps/activation-app/app/globals.css` to keep the look consistent. This is fine — shadcn is designed to be copy-paste-then-modify, not vendored.

### 8.3 Summary

> Share the things that are **invariants** (DB schema, domain rules, crypto, audit shape).
> Don't share the things that are **presentation** (UI, route handlers) — those are properly owned by each app and should be free to diverge.

---

## 9. Field-app Dependence on Admin-app

Because this is the load-bearing claim of Topology A, decompose it carefully.

### 9.1 At Runtime, Field-app Does NOT Call Admin-app

The field-app's request path is:

```
agent's browser
  → fieldactivation.mrq.com (Next.js, Railway service: field-app)
    → Postgres (via packages/db)
    → Redis (via packages/redis)
```

The admin-app is **not** in this path. They are sibling services on the same Railway project, not a tier hierarchy.

### 9.2 Failure Scenario Matrix

| Scenario | Field-app impact |
|---|---|
| Admin Next.js process crashes / OOMs / fails to start | **None** — different process |
| Admin app deploys a buggy build | **None** — field's build is untouched |
| Admin app hangs / GCs forever | **None** |
| NextAuth/Auth0 outage | **None** — field doesn't use NextAuth |
| Admin UI 500s on every page | **None** |
| Resend (email provider) outage | None for in-flight ops; only blocks *new* invite emails being sent |
| Postgres down | **Both apps down** |
| Redis down | **Both apps down** (rate limit + idempotency need it) |
| Railway region outage | **Both apps down** |
| DNS misconfig on `*.mrq.com` | **Both apps down** |
| Bad shared-schema migration | **Both apps potentially affected** (same DB) |
| Bad change in `packages/domain` | Affects only the apps **redeployed since the change** — each app bundles deps at build time, so an old build of field-app keeps running with the old domain code |
| Bad change in `packages/db` (Prisma) | Same — bundled at build time per app |

### 9.3 What Still Works During an Admin Outage

- Existing invite links can still be exchanged (field-app reads `FieldAccessGrant` directly from Postgres)
- Existing sessions continue working (cookie validation reads `grant.validTo` from Postgres)
- Lookups, manual register, manual verify all function
- Audit writes continue (`packages/audit` writes to Postgres)
- Soft-locks still trigger and gate writes correctly

### 9.4 What Stops Working During an Admin Outage

- **New invites cannot be issued** (admin-app is the issuer)
- **Grants cannot be revoked via UI** (DB-level revoke still possible by an engineer with DB access in an emergency)
- **The active-session monitoring page is unavailable**
- **Compliance UIs (DSAR, erasure) are unavailable** — but no manual rescue work depends on these

### 9.5 Honest Framing

Field-app is **independent of admin-app** for the *operational* path (existing-agent operations on the floor) but **shares fate** with admin-app on the *data* path (Postgres, Redis, schema migrations).

The wins this delivers:

- Most common admin-app failure modes (deploy bugs, frontend regressions, auth outages, Resend outages) **do not affect agents on the floor**.
- A Postgres or Redis outage is an organisation-wide incident, not a "did the admin team deploy bad code" incident — those are categorically different on-call concerns.

What it does **not** deliver:

- "Field works during a Postgres outage." It does not. If we ever need that, we need offline-first (IndexedDB + sync), which is a Phase 2 conversation.

---

## 10. Compliance & PII

### 10.1 Posture

External agents are **Article 28 processors**. Each `FieldAccessGrant` records the named individual + agency. A signed DPA with the agency is a **prerequisite** for issuing the first grant — the admin UI requires ticking a "DPA signed" checkbox at grant creation, and that checkbox itself is audited via `field.grant_created` metadata.

### 10.2 PII Handling

- Field-app: **no PII at rest**. Server logs strip request bodies (Pino redact rules; Sentry `beforeSend` strips `req.body`).
- Email is in transit on the wire (form submission) and visible briefly in the agent's browser form state. Acceptable; it was just spoken aloud at a booth.
- Masked-by-default in lookup results; reveal is audited per row.
- No bulk-reveal endpoint. No CSV. No copy-all.

### 10.3 Retention

The existing daily retention purge (`workers/retentionPurge.ts`) is extended:

- `FieldAccessGrant` rows past `validTo + 90 days` are deleted (cascades to sessions).
- `FieldAgentSession` rows past `validTo + 90 days` are deleted (their FKs on `Registration` are `onDelete: SetNull`, so registration history survives).
- `AuditLog` rows for `field.*` actions follow the same 2-year window as the rest of the audit log.

90 days is a working number; Compliance signs off in §13.

### 10.4 DSAR / Erasure

DSAR export must include any `Registration` rows where the participant was manually registered or verified by a field agent — this works automatically because the export keys on `emailHash`, but the export schema needs new columns `verificationSource` and `fieldAgentReason`. Erasure correctly nulls `createdByFieldSessionId` / `verifiedByFieldSessionId` via `onDelete: SetNull`, preserving audit integrity.

This is the same erasure-test pattern flagged in BACKLOG 6.3 — extending it to cover field-agent FKs is part of the build.

### 10.5 No Bootstrap Recovery

Field grants can only be created by ADMINs. There is no "bootstrap field agent" path. Lost activation → admin re-issues from `activationadmin.mrq.com`. If admin is down at that exact moment, agent has no recourse to obtain a *new* invite — accepted in §1.3 / §9.

---

## 11. Operational

### 11.1 Deployment

- New Railway service `field-app`. Same Railway project as `activation-app`, separate service.
- Build command: `pnpm turbo run build --filter=field-app...` (Turborepo handles the dependency graph; `prisma generate` runs once, before any consumer builds).
- Start command: `pnpm --filter field-app start`. **Neither app runs `prisma migrate deploy` from its start script** — see migration handling below.
- Health endpoint: `GET /api/health` returns 200 with `{ ok, version, commit }`.
- Sentry: separate Sentry project (`mrq-live-field`). DSN in env.
- Public URL: `https://fieldactivation.mrq.com`. DNS managed alongside `activationadmin.mrq.com`.

#### 11.1.1 Database Migrations — Railway Release Command

Migrations run via Railway's **Release Command** feature, not from either app's start script. Configured on the `activation-app` service (the canonical migration owner):

```toml
# railway.toml (activation-app service)
[deploy]
releaseCommand = "pnpm --filter @mrq/db migrate:deploy"
```

This runs **before new containers are spun up**. Three properties this gives us that start-script migrations don't:

1. **Exactly-once execution per deploy.** Even if `activation-app` scales to multiple replicas, the migration runs once.
2. **Atomic deploy gate.** If the migration fails, Railway aborts the deploy. Old containers stay alive serving the previous build. No half-migrated state.
3. **Decoupling from container startup.** A bad codebase deploy can't leave the DB migrated but the app crashing — if the migration succeeds but the new build fails to start, the previous build keeps running against the new schema (which must be backwards-compatible per the migration review process in V5).

The `field-app` service has **no release command**. It assumes the schema it sees is correct. Schema changes are coordinated through the `activation-app` deploy.

`packages/db/package.json`:

```json
{
  "scripts": {
    "db:generate": "prisma generate",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:create": "prisma migrate dev --create-only"
  }
}
```

Per V5 §1: never run `prisma migrate dev` or `prisma db push` against production. Always `--create-only`, review the SQL, then `migrate:deploy` via release command.

### 11.2 New Environment Variables

Added to a field-app-specific `lib/env.ts`. Field-app does **not** need most of the activation-app's keys — it has no NextAuth, no Auth0, no Resend (invite emails are sent from the activation-app side).

Required for `field-app`:

```
NODE_ENV
DATABASE_URL
REDIS_URL
EMAIL_HASH_HMAC_KEY      # shared with activation-app (same value, V5 §14.4)
IP_HMAC_KEY              # shared with activation-app (same value)
FIELD_INVITE_HMAC_KEY    # NEW — separate from INVITE_TOKEN_HMAC_KEY (admin invites)
FIELD_SESSION_HMAC_KEY   # NEW — signs the session cookie value
FIELD_HOST               # fieldactivation.mrq.com
PUBLIC_BASE_URL_FIELD    # https://fieldactivation.mrq.com
```

Optional for `field-app`:

```
SENTRY_DSN               # field-app's own DSN
FIELD_OPS_CONTACT_EMAIL  # shown on /expired
```

The `activation-app` gains one new variable: `FIELD_INVITE_HMAC_KEY` (used by the tRPC mutation that issues invites). The values are identical — both apps need to compute the same `tokenHash` for the same raw token.

`.env.example` updates land in the same PR as the `lib/env.ts` change (matching the V5 §1 rule).

### 11.3 Monitoring

- Sentry: errors and performance traces on every endpoint.
- Audit log: queryable via existing admin audit page filtered by `actorType = FIELD_AGENT`.
- New admin page: **Field Sessions** under `/admin/field` showing active sessions, recent grants, recent suspicious-exchange alerts, soft-lock status. Lives in the existing `activation-app`, not the `field-app`.

### 11.4 Failure Modes

See §9.2 for the full matrix. The two failure modes that warrant runbook entries:

- **Admin app down → need to revoke a grant urgently.** Document the DB-level revoke command (`UPDATE "FieldAccessGrant" SET "revokedAt" = NOW() WHERE id = ...`).
- **Soft-lock during a busy event window.** Document who has authority to clear, and the reconfirm UX flow.

---

## 12. Phased Delivery

Mirrors the V5 phased-delivery convention. Each phase has a checkpoint gate; do not advance without explicit approval.

### Phase 0A — Workspace move (prerequisite)

- Move existing app from `./` to `apps/activation-app/`.
- Add `pnpm-workspace.yaml` (extended) and `turbo.json`.
- Update Railway `railway.toml` build/start commands to use Turborepo filters.
- Configure Railway Release Command on `activation-app` to run `pnpm --filter @mrq/db migrate:deploy` (a no-op on first run since the schema hasn't changed yet).
- **No package extraction yet** — `src/lib/*` stays where it is.
- All existing tests pass; existing app deploys unchanged.
- Effort: **S (1 day)**.

**Checkpoint:** existing platform smoke test passes against the moved code. Railway Release Command runs successfully on the next deploy.

### Phase 0B — Shared package extraction

- Extract `packages/db` (Prisma schema + client + migration scripts).
- Extract `packages/crypto` (HMAC helpers).
- Extract `packages/redis` (singleton client + `withRedisHealth`).
- Extract `packages/audit` (`writeAuditLog`).
- Extract `packages/rate-limit` (`fixedWindow`).
- Update `apps/activation-app` imports throughout.
- Effort: **M (2 days)**.

**Checkpoint:** all existing tests still pass against the extracted packages. Audit row shape, rate-limit behaviour and HMAC outputs are bit-identical to the pre-extraction baseline.

### Phase 1 — Schema additions

- Add `FieldAccessGrant`, `FieldAgentSession` tables.
- Add `createdSource`, `verificationSource`, `createdByFieldSessionId`, `verifiedByFieldSessionId`, `fieldRegisterReason/Notes`, `fieldVerifyReason/Notes` columns to `Registration`.
- Add `actorType`, `fieldAgentSessionId` columns to `AuditLog`.
- Backfill: classify existing rows per the matrix in §3.3 and the rules in §3.2.
- After successful backfill, ship the `CHECK` constraint migrations from §3.5.
- **No domain code changes yet** — existing route handlers untouched. Schema lands first so the new columns are available before code starts using them.
- Effort: **M (2 days)**.

**Checkpoint:** participant flow is byte-identical. New columns populated correctly on every existing flow (existing audit rows show `actorType = ADMIN` or `SYSTEM`; new registrations show `createdSource = PARTICIPANT` and either `verificationSource = OTP` or `NULL`). DB constraints reject obviously-bad inserts in tests.

### Phase 2 — Domain extraction

- Extract `registerParticipant` and `verifyParticipant` into `packages/domain`.
- Extract `normalizeEntryCode` and `maskEmail` helpers.
- Refactor existing `/api/register` and `/api/verify` route handlers to call the shared functions with `source.kind === 'PARTICIPANT'`.
- Domain functions write the new columns (`createdSource`, `verificationSource`) and FKs as appropriate for the source.
- Add unit tests for all four (creation × verification source) combinations.
- Effort: **M (3 days)**.

**Checkpoint:** participant flow is still byte-identical from the user's perspective. Internally, audit rows and registration rows now go through the shared domain functions and carry source attribution. INVARIANT-002 unit tests pass; INVARIANT-003 unit tests pass.

### Phase 3 — Admin invite issuance

- New `fieldAccess` tRPC router with `create`, `revoke`, `list`, `listSessions`, `unlockSoftLock`.
- New admin UI at `/admin/field/[activationId]` for issuing/revoking grants and viewing active sessions.
- New email template `fieldInviteEmail.tsx`.
- DPA-acknowledged checkbox gate on grant creation.
- Admin UI gated by `process.env.FIELD_AGENT_UI_ENABLED === 'true'` so it stays hidden in production until Phase 4.
- Effort: **M (3 days)**.

**Checkpoint:** admin (in staging or with the flag on) can issue a grant, receive the email, see the active session list.

### Phase 4 — Field-app skeleton

- Scaffold `apps/field-app` with `proxy.ts`, `lib/env.ts`, layout, `/start`, `/`, `/expired`.
- Implement `/v1/field/session/{exchange,refresh,logout}`.
- Cookie management, risk-scoring stub (returns "low risk" always), audit writes.
- New Railway service created and deployed; **no production DNS yet** (only the internal Railway URL is reachable).
- No business endpoints yet — the page after login is just "Logged in as <name> for <activation>".
- Effort: **M (3 days)**.

**Checkpoint:** invite link from Phase 3 (on the internal Railway URL) → cookie session → branded landing page. Closing the tab and reopening keeps the agent in.

### Phase 5 — Lookup & reveal

- Implement `/v1/field/lookup`, `/v1/field/lookup-by-email`, and `/v1/field/reveal`.
- `lookup_by_email` permission flag wired through to the admin grant-creation form (default OFF).
- UI: search box (entry code primary; "search by email instead" link revealing the email input only if the session permission allows it), result card, masked email, reveal button with confirmation drawer.
- Entry-code normalisation applied client-side and server-side via `normalizeEntryCode`.
- Anti-enumeration baseline-time floor implemented in both lookup endpoints (identical timing for found / not-found).
- Effort: **M (3 days)** — was S(2) in v1.3; the +1 day reflects the email-lookup endpoint, its permission gate, and the anti-enumeration timing work.

**Checkpoint:** agent can search by entry code (any formatting). If the grant has `lookup_by_email`, agent can also search by email. Reveal records the explicit confirmation flag. Membership-probe timing test passes (found / not-found responses are statistically indistinguishable on response time).

### Phase 6 — Manual register & verify

- Implement `/v1/field/register` and `/v1/field/verify` calling shared domain functions.
- UI: drawer forms with reason enum, idempotency keys, success/error states.
- Verify endpoint accepts entry code or email (XOR validation).
- Effort: **M (3 days)**.

**Checkpoint:** end-to-end manual rescue works. Resulting registrations have correct `createdSource` / `verificationSource` / FKs / per-action reasons. Audit chain is complete. DB CHECK constraints catch any bad insert in tests.

### Phase 7 — Risk scoring, soft-locks, monitoring

- Real risk-scoring logic (UA, ASN, velocity).
- Soft-lock state machine.
- Sentry alerting wiring.
- Admin "Reconfirm to unlock" UX.
- Effort: **M (3 days)**.

**Checkpoint:** simulated abuse triggers soft-lock; admin can clear it; audit log shows the chain.

### Phase 8 — Compliance hardening & launch readiness

- DSAR/erasure verification across new tables and FKs (BACKLOG 6.3 extended).
- Retention purge extended to `FieldAccessGrant` / `FieldAgentSession`.
- **Eligibility regression test (§14.1 R2).** New file `apps/activation-app/src/server/trpc/routers/__tests__/winner.eligibility.test.ts`. Fixture inserts one standard `PARTICIPANT`/`OTP` registration and one `FIELD_AGENT`-verified registration on the same activation; runs the eligibility query (both the JS Prisma `eligibilityWhere()` form *and* the raw SQL `WHERE` form per INVARIANT-001's three-filter rule); **asserts exact count of 1** in each case. The test fails — and the deploy is blocked — if either filter regresses to include the field-agent row.
- INVARIANT-001 entry in `INVARIANTS.md` updated to add the new clause and reference R1.
- Production smoke test extended (V5 §production smoke test) to include a manual-verify rehearsal.
- DNS cutover for `fieldactivation.mrq.com`.
- `FIELD_AGENT_UI_ENABLED` flipped on in production.
- Effort: **S (1–2 days)**.

**Checkpoint:** compliance sign-off; eligibility regression test passes; smoke test passes against production field-app.

**Total effort estimate: ~3 weeks single contributor, ~2 weeks with two-up working in parallel after Phase 2.**

---

## 13. Branching & Release Plan

### 13.1 Do not fork the repo

The temptation is to fork `mrqlive-brand-activation-tool` into a separate repo so this work cannot affect production. **Reject this.** The architecture in §2 is built on a shared monorepo (Prisma client, domain functions, audit shape, crypto keys). A fork:

- Forces two diverging Prisma schemas against the same Postgres — the highest-risk class of bug we have.
- Breaks INVARIANT-002 before it's even written (the shared `register` and `verify` functions can't be shared across repos without re-introducing copy-paste drift).
- Has to be merged back eventually anyway. Fork-and-merge-later is strictly worse than branch-now: the longer the fork lives, the worse the eventual merge.

The only legitimate reasons to fork — different team, no shared data, separate open-source release — do not apply here.

### 13.2 Branching strategy

```
main                          ← production. Currently running activation-app.
└── feat/field-agent-tool     ← long-lived integration branch (optional reference)
    ├── chore/workspace-move             (Phase 0A → main)
    ├── chore/package-extraction         (Phase 0B → main)
    ├── feat/field-schema                (Phase 1 → main)
    ├── feat/domain-extraction           (Phase 2 → main)
    ├── feat/admin-field-invite          (Phase 3 → main)
    ├── feat/field-app-skeleton          (Phase 4 → main)
    └── ...                              (Phases 5–8 → main)
```

Each phase merges to `main` as its own PR. The `feat/field-agent-tool` integration branch is optional — useful for stacking work-in-progress phases or running an end-to-end staging deploy ahead of phase merges, but not the path to production. Production goes through `main`.

### 13.3 Why incremental merges to `main` are safer than a long-lived branch

| Concern | Long-lived branch | Phased merges to `main` |
|---|---|---|
| Conflicts with ongoing main-line work | Accumulate; rebase pain grows daily | Resolved at each phase boundary |
| CI/CD coverage of new code | Branch CI only | Same CI as production code |
| Reviewable PR size | One enormous final PR | 9 right-sized PRs |
| Risk of regression in `activation-app` | Discovered at merge time | Discovered at each phase, when the phase is small |
| Rollback granularity | All-or-nothing | Per-phase revert |
| Deployment of new code | All on the day of merge | Already deployed, tested under production conditions, gated off |

### 13.4 Per-phase production impact

The whole point of this plan: **most phases land code on `main` without changing user-visible behaviour.** The cutover is one event at the end.

| Phase | Lands on `main` | Production impact |
|---|---|---|
| 0A — Workspace move | Files move to `apps/activation-app/`. Add `pnpm-workspace.yaml`, `turbo.json`. | **None.** Deployed build is functionally identical. |
| 0B — Package extraction | `src/lib/*` modules extracted into `packages/*`. Imports updated. | **None.** Refactor only. |
| 1 — Schema additions | New empty tables. New columns on `Registration` and `AuditLog`. CHECK constraints applied post-backfill. | **None visible.** Existing flows populate the new columns correctly via backfill defaults. |
| 2 — Domain extraction | `register`/`verify` lifted into `packages/domain`. Existing route handlers refactored to call shared functions. | **None visible.** Behaviour is identical; internal call shape is new. |
| 3 — Admin invite issuance | `fieldAccess` tRPC router + admin UI. | **Hidden behind `FIELD_AGENT_UI_ENABLED` flag** in production. With flag on (staging only), admins can issue invites. |
| 4 — Field-app skeleton | New `apps/field-app` Railway service deployed, but `fieldactivation.mrq.com` DNS does not resolve to it. | **None.** `fieldactivation.mrq.com` is unresolvable in production DNS. Internal Railway URL works for testing. |
| 5 — Lookup & reveal | Endpoints + UI. Still no production DNS. | **None.** |
| 6 — Manual register & verify | Endpoints + UI. Still no production DNS. | **None.** Field-app traffic is staging-only. |
| 7 — Risk scoring & soft-locks | Logic + admin reconfirm UX. | **None.** |
| 8 — Compliance hardening + go live | DNS cutover for `fieldactivation.mrq.com`. Admin UI feature flag flipped on. Smoke test. | **The tool goes live.** This is the only phase that flips the user-visible switch. |

The release "event" is Phase 8 only. Everything before is invisible to production users.

### 13.5 Phase 0 coordination

Phase 0A is the only phase that touches the existing app's file paths at scale. It will conflict with any open PR against `main`. Mitigations, in order of preference:

1. **Coordinated atomic merge.** Pick a quiet day. Warn the team a week in advance. Land Phase 0A as one PR. Ask other contributors to rebase their open PRs immediately after. This is the cheapest option overall.
2. **Brief PR freeze.** If coordination is hard, ask for a half-day freeze on `main` PRs while Phase 0A merges. Freeze ends as soon as it's in.
3. **Parallel long-lived branch.** If neither (1) nor (2) is viable, do field-agent work on `feat/field-agent-tool` and rebase frequently. Accept the merge cost when Phase 0A finally lands. **Least preferred** — the longer the wait, the worse the conflict surface.

Phase 0B (package extraction) is less disruptive — it changes import paths within already-moved files, but doesn't move files again. It can land in the days after Phase 0A without a freeze.

Run the V5 production smoke test against the post-restructure build before merging each Phase 0 sub-phase. If anything regresses, the merge does not happen.

### 13.6 Local isolation: `git worktree`

For a parallel local working directory (so the existing app stays open in one terminal while field-agent work proceeds in another, without constant branch-switching):

```bash
git worktree add ../mrqlive-field-agent feat/field-agent-tool
```

Same git history, two checkouts, two branches, no extra clone. Cleanup when done:

```bash
git worktree remove ../mrqlive-field-agent
```

Prefer this over a second clone — shares the `.git` directory, sees pushes from either checkout immediately.

### 13.7 Feature flags & DNS as the gating mechanism

Two release controls do the heavy lifting:

- **Feature flag on the admin UI (Phase 3 onwards).** A simple `process.env.FIELD_AGENT_UI_ENABLED === 'true'` gate around the admin field-access page is sufficient — no flagging library needed for one switch. Default off in production, on in staging.
- **DNS cutover for `fieldactivation.mrq.com` (Phase 8).** Until DNS resolves to the new Railway service, the field-app cannot be reached by external users. Internal Railway URLs are still available for staging tests.

These two controls together mean the merge of any phase to `main` does not, by itself, expose anything to production users.

### 13.8 Rollback

Each phase is independently revertible:

- Code rollback: `git revert <phase-PR-merge-commit>` and redeploy.
- Schema rollback (Phase 1 introduces new columns and tables; Phase 2 only changes call-sites): the new columns are nullable or have safe defaults; reverting the code does not require a schema rollback. Tables added in this work are not relied on by `activation-app`'s existing flows, so leaving them in place after a code revert is safe.
- DNS rollback (Phase 8 only): repoint or remove the `fieldactivation.mrq.com` record. Field-app stops accepting external traffic in seconds.

The most painful rollback would be a bad migration in Phase 1 that affects `Registration` or `AuditLog`. Mitigations:
- Review-first migration generation per V5 (`prisma migrate dev --create-only`).
- Railway Release Command aborts the deploy on migration failure (§11.1.1) — bad migrations don't reach a running container.
- Staging soak before production.
- Documented manual rollback SQL for each migration in the PR description.
- CHECK constraints from §3.5 land in their own follow-up migration — separable from the column-adding migration so the constraints can be rolled back independently if they reject legitimate data.

### 13.9 Concrete recommendation

1. **Cut `feat/field-agent-tool` off `main`** as the integration branch.
2. **Land Phase 0A then Phase 0B to `main`** with team coordination; rebase the integration branch onto the new structure.
3. **Each subsequent phase merges to `main`** as its own PR. Use the feature flag (admin UI) and missing-DNS (field-app) as gates so production stays unchanged.
4. **Phase 8 is the only "go live" event.** Flip the feature flag, cut over DNS, run the extended smoke test.
5. **Locally,** use `git worktree` if parallel checkouts are useful.

This gives the team the isolation it wants (no production user sees field-agent code until Phase 8), the architectural integrity it needs (one repo, one schema, one audit log), and the operational safety of trunk-based development (small PRs, CI on every change, granular rollback).

---

## 14. Resolved Decisions

All Phase 1 decisions are locked. Implementation can proceed without further clarification.

### 14.1 Architectural decisions (resolved during technical review)

| # | Decision | Rationale |
|---|---|---|
| R1 | **Field-agent verifications are excluded from the winner-draw eligibility pool.** Add `WHERE verificationSource != 'FIELD_AGENT' OR verificationSource IS NULL` to V5 INVARIANT-001's eligibility filter (both the JS Prisma `eligibilityWhere()` and the raw SQL `WHERE` clauses in `pickWinners`). | The most material fraud vector in this feature: a colluding agent could manually verify mates to seed the prize pool. Rate limits, soft-locks and audit are mitigations, not the right primary defence. Field rescues are for the punter's *immediate* booth perk (branded hat, free spin), not the grand prize draw. Excluding `FIELD_AGENT` verifications from eligibility is standard anti-fraud practice. **This decision becomes part of INVARIANT-001.** |
| R2 | **Explicit eligibility regression test mandated before Phase 8 sign-off.** | The R1 filter must be locked by a test, not just a comment. The test fixture: insert one standard `PARTICIPANT`/`OTP` registration and one `FIELD_AGENT`-verified registration, run the eligibility query, **assert exact count of 1**. Lives in `apps/activation-app/src/server/trpc/routers/__tests__/winner.eligibility.test.ts`, exercises both the JS Prisma filter and the raw SQL filter (per INVARIANT-001's three-filter requirement). |
| R3 | **Migrations run via Railway Release Command on `activation-app`, not from app start scripts.** | Guarantees exactly-once execution per deploy; aborts deploy on migration failure; decouples migration from container startup. See §11.1.1. |
| R4 | **`activation-app` owns migrations; `field-app` has no Release Command.** | Single owner avoids races; field-app trusts whatever schema it sees. |
| R5 | **`field-app` gets its own Sentry project (`mrq-live-field`).** | Separate alert routing, separate quotas, easier to silence one without the other. |
| R6 | **Email-based lookup added as a separate endpoint (`/v1/field/lookup-by-email`) gated by `lookup_by_email` permission, default OFF.** Heavy rate limit (10/hour/session), distinct audit action, anti-enumeration identical-shape timing. | Closes the rescue case where the punter has lost their entry code. Re-introduces enumeration risk that V5's participant flow guarded against — the layered guardrails (permission gate, rate limit, identical-shape responses, distinct audit) keep the threat model defensible. The companion change — sending the entry code by email post-verify — is in `MRQ_LIVE_POST_VERIFY_EMAIL_PROMPT_V1.md` and ships first as a precursor. |

### 14.2 Operational decisions (resolved by stakeholders)

| # | Topic | Decision | Rationale |
|---|---|---|---|
| Q1 | DPA template + agency onboarding | **Block grant creation until the §10.1 DPA-acknowledged checkbox is implemented and ticked.** No grants issued without a signed DPA per agency. | Article 28 compliance is non-negotiable; the checkbox is a hard gate, not a UX nicety. |
| Q2 | `FieldAccessGrant` retention | **90 days post `validTo`.** | Sufficient for venue reconciliation, immediate DSARs, and incident review. Folds into the existing 14.1 retention purge. |
| Q3 | Reason enum + `OTHER` | **Five reasons as listed in §3.1.** Plus a hard rule: when reason is `OTHER`, `notes` is required and must be ≥10 characters of meaningful free text. Enforced both in the UI (notes field becomes required) and in the API Zod schema (`.refine()` rejects with a structured error). | Four named reasons cover ~99% of venue-floor incidents. `OTHER` is an escape hatch, not a blank-check skip — the compliance context must still be captured. |
| Q4 | `maxExchanges` default | **5.** | An 8–10h shift covers: initial login, accidental tab close, dead-battery device swap, venue-WiFi-to-4G switch forcing a refresh. More than 5 in a day implies credential sharing or a serious device issue that warrants admin intervention anyway. |
| Q5 | Risk-scoring thresholds | **Numbers as listed in §4.5**, paired with **frictionless one-click soft-lock clear** (added in §4.5). | Aggressive thresholds are necessary for stateless link-based auth. Legitimate bursts will happen (busload arriving, tower drop) — the system must fail secure but recover instantly. |
| Q6 | Entry-code format | **Activation `entryCodePrefix` is the source of truth.** UI shows the prefix as a fixed, non-editable affix on the search input; agent types only the suffix. Same UX in admin's existing registrations table search. Client concatenates `prefix + suffix` before submitting; server applies `normalizeEntryCode` and `lookupRegistrationByEntryCode` (§7.1) which is robust to either form. | Aligns with the existing `Activation.entryCodePrefix` schema. Cuts typing on a venue floor where an agent might process dozens of lookups in an hour. |
| Q7 | Two-admin approval for grant creation | **No — single ADMIN.** Revisit only if SecOps makes it a hard blocker. | A multi-stage approval flow needs a state machine for pending grants, async email notification, and review UI — massively complicates the release. The blast radius of a single rogue admin is already contained: every grant is audited with `createdById`, every action is rate-limited, and grants are revocable in one click. |
| Q8 | V5 + `.env.example` domain updates | **Separate cleanup PR after Phase 8.** Not part of the field-agent rollout. | Mixing config/doc updates with functional feature branches pollutes git history and risks cross-environment configuration bugs sneaking into the rollout. Atomic, scoped PRs only. |

### 14.3 Considered and explicitly deferred

**Splitting the participant flow into its own `apps/participant-app`.** Raised during this review as a natural follow-on to the monorepo restructure: if `field-app` deserves its own deployment for trust-boundary and operational reasons, the same logic could apply to participant traffic (anonymous public, different host, different load profile, different scaling needs).

**Decision: defer. Not in scope for the field-agent rollout.**

Rationale:
- V5 §2.4's single-app, host-gated design is a deliberate Phase 1 simplification, not an oversight.
- The biggest operational fate-sharing risk (a bad migration) isn't fixed by splitting — both apps would still share Postgres.
- Host-gating in `proxy.ts` already enforces the URL/cookie/session boundary; the residual benefit is *Node-process-level* isolation, which is real but bounded.
- Bundling the split with the field-agent rollout would be scope creep on an approved delivery, multiplying regression surface for an unrelated problem.

The monorepo structure being introduced in Phase 0 is naturally extension-friendly: `apps/activation-app` can later become `apps/admin-app` + `apps/participant-app` without restructuring `packages/*` or the database. This is a preserved future option, not a foreclosed one.

**Tracked in:** [`BACKLOG.md` §5.6](./BACKLOG.md), with explicit triggers that should escalate the work to active. **Do not bundle this work with any field-agent phase.** Treat it as its own initiative when one of the documented triggers fires.

---

## 15. Open Invitations to Push Back

Three places debate is expected:

1. **The monorepo restructure (Phase 0) is real cost** for what looks like a small feature. The alternative — copy-pasting `lib/audit`, `lib/rate-limit`, `lib/crypto` into the field-app — produces immediate drift and would force INVARIANT-002 to live in two places. Recommended: do the restructure.
2. **Adding `actorType` to `AuditLog` is a load-bearing change** to a table that already records production data. The migration must be reviewed by whoever authored V5 §14 before it is applied. Alternative: leave `AuditLog` alone and write field-agent actions to a parallel `FieldAuditLog` table — splits the audit story (DSAR / erasure now spans two tables), which is worse.
3. **No customer table in the field UI** is a deliberate restriction. Marketing may push back. The escalation path is: admin opens the standard registrations table on `activationadmin.mrq.com` and screen-shares with the venue lead. Field agents are for individual punter rescue, not bulk operations.

---

## 16. Glossary

- **Field agent** — an external (non-MrQ) individual working a brand activation booth, granted scoped access to support participants.
- **Field access grant** — the database record representing a named agent's authority to act on an activation, time-boxed and revocable.
- **Field session** — an active, cookie-backed login created by exchanging an invite token. Multiple sessions may exist for the same grant over time, but only one concurrently.
- **Manual register / verify** — a registration created or verified by a field agent without the OTP loop. Audit-distinguishable from the participant flow.
- **Creation source** — the discriminator on a `Registration` row indicating who created the row (`PARTICIPANT` or `FIELD_AGENT`).
- **Verification source** — the discriminator on a `Registration` row indicating who verified it (`OTP`, `FIELD_AGENT`, or `NULL` for unverified rows). Independent of creation source.
- **DPA** — Data Processing Agreement under GDPR Art. 28, signed with the agency supplying field agents.

---

## Changelog

- **v1.4 (email-lookup pass)** — incorporated the email-based-lookup rescue path discussed during review. Material changes:
  - New endpoint `POST /v1/field/lookup-by-email` (separate from `/lookup`).
  - New permission `lookup_by_email` on `FieldAccessGrant.permissions`, default OFF.
  - New audit action `field.email_lookup` (with `metadata.found` for enumeration-pattern detection).
  - New rate limit (10/hour/session) and risk-scoring threshold (>20/day → soft-lock).
  - Anti-enumeration identical-shape timing requirement on both lookup endpoints.
  - Phase 5 effort updated S→M to reflect the additional work.
  - **Precursor work** — confirmation email at verification time — split into its own document `MRQ_LIVE_POST_VERIFY_EMAIL_PROMPT_V1.md`, which ships before any phase of this proposal.
  - §14 R6 records the resolved decision.

- **v1.3 (deferral pass)** — recorded the participant-app split decision (§14.3, BACKLOG 5.6) as deferred. No engineering changes; documentation only.

- **v1.2 (stakeholder decisions pass)** — all open questions in §14 resolved by Compliance, SecOps, Marketing and Engineering. Material changes:
  - `OTHER` reason now requires `notes` ≥ 10 chars (UI + Zod refinement, §3.1, §5.1).
  - Entry-code search input shows the activation's `entryCodePrefix` as a fixed affix; agent types suffix only (§6.2). New `lookupRegistrationByEntryCode` domain helper handles either form server-side (§7.1).
  - Soft-lock clear is one-click frictionless with optional reason; repeated clears within 30 min escalate to hard-lock (§4.5).
  - Phase 8 explicitly includes the eligibility regression test asserting exact count = 1 (§12, §14.1 R2).
  - All §14.2 stakeholder decisions locked. No open questions remain for kickoff.

- **v1.1 (technical review pass)** — incorporated feedback from internal technical review. Material changes:
  - Schema: split `verificationSource` into `createdSource` + `verificationSource` with separate FKs (fixes a defect in the original — pending rows shouldn't have a verification source). Per-action reasons (`fieldRegisterReason`/`fieldVerifyReason`) replace the single `fieldAgentReason`.
  - Added §3.5 Database-level CHECK constraints. Added INVARIANT-003.
  - Added Turborepo for build orchestration (§2.2, §11.1).
  - Migrations move to Railway Release Command (§11.1.1).
  - **Field-agent verifications excluded from winner-draw eligibility pool** (§14.1 R1).
  - Reveal endpoint requires explicit `confirmation: true`.
  - Verify endpoint accepts entry code XOR email.
  - `normalizeEntryCode` and `maskEmail` lifted into `packages/domain`.
  - Phase 0 split into 0A (workspace move) and 0B (package extraction). Phase 1 split into 1 (schema) and 2 (domain extraction). Subsequent phases renumbered.
  - `packages/field-api-types` renamed to `packages/field-api-contract` to reflect Zod-schemas-first design.

---

*End of master prompt v1. To revise: bump to v2 in a new file rather than editing in place; the v1 should remain as historical reference for what was originally proposed.*

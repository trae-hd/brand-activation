# MrQ Live — Post-Verify Confirmation Email — Build Prompt v1

> **Purpose.** A complete, self-contained build prompt for adding a transactional confirmation email sent to the participant after successful OTP verification. The email contains the participant's **entry code** so they can recover it from their inbox if they close the success page. This is a small, independently valuable participant-flow improvement that ships **before** the field-agent tool (`MRQ_LIVE_FIELD_AGENT_TOOL_PROMPT_V1.md`) and reduces the rescue caseload that tool will handle.
>
> **Relationship to V5.** V5 (`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`) remains the platform constitution. This prompt is a focused addition to the participant flow; where they overlap (synchronous email pattern via Resend, British English, structured audit, Zod env validation, host-gating), V5 wins. This prompt is silent on those — it inherits them.
>
> **Why now.** Today, the participant sees their entry code only on the success page after OTP verification. If they close the tab — which they often do at a venue, on a phone, with bad signal — the code is lost. They have **no in-app recovery path** (BACKLOG 1.3). Their only escalation is the `mailto:hello@mrqlive.com` link on `/expired`, which requires human intervention. This change closes that gap by emailing the entry code at the moment of verification, transactional-receipt style.
>
> **Effort.** Single contributor, ~3 days end-to-end (revised in v1.1 to include resend logic; revised in v1.3 to add provider error classification).
>
> **Build proceeds in six phases (§7).** Each phase has a pre-flight checklist, a scoped implementation list, a verification checklist, an effort estimate, and an explicit checkpoint gate. **Stop at every checkpoint. Do not proceed without human approval.** Phase N+1 begins only on receipt of `Phase [N] approved — begin Phase [N+1]`. Any other input from the user is feedback on the current phase, not approval to advance. The phases are smaller than V5's eight because the feature scope is smaller — but the gate discipline is identical.

---

## 0. TL;DR

- **Synchronous transactional email** sent from `/api/verify` after a successful verification commits.
- **Resend on demand** via a new `/api/resend-confirmation-email` endpoint, with the existing success-page Resend button rewired to it (currently calls `/api/register` and silently no-ops for verified users — a small lie this work makes honest).
- **Same Resend pattern** as the existing OTP send — 5s timeout, one retry, but failure does **not** fail the user-facing request (the user already has their code on the success page).
- **One nullable column** added to `Registration` (`confirmationEmailSentAt`) for delivery tracking and DSAR completeness.
- **One new email template** (`entryCodeConfirmationEmail.tsx`) rendering both verify-time and resend variants from a `cause` prop.
- **One new optional env var** (`SUPPORT_EMAIL`); reuses `RESEND_API_KEY`, `EMAIL_FROM`.
- **Three new audit actions** (`participant.confirmation_email_sent`, `participant.confirmation_email_failed`, `participant.resend_rate_limited`) with a `cause: 'verify' | 'resend'` discriminator.
- **Anti-enumeration: identical-shape 202 responses** on the resend endpoint regardless of whether the email matches a VERIFIED row, with a baseline-time floor for timing-indistinguishability.
- **Closes BACKLOG 1.3.** Reduces field-agent rescue caseload before that tool ships.
- **Legal basis: transactional / contract performance.** Same basis as the OTP email itself; no new consent required.

---

## 1. Purpose & Scope

### 1.1 Problem

A participant scans a QR at a booth, registers, receives an OTP by email, verifies. On verification, they land on the success page which shows their entry code. They:

1. Glance at it.
2. Get distracted by the venue / their friends / the queue / a low-signal tab refresh.
3. Close the page.
4. Have no record of their entry code anywhere.

When they later return to the booth to claim their reward — or are asked their entry code by a staff member — they cannot produce it. Today this is irrecoverable in-app: there is no `POST /api/recover-entry-code` endpoint, no "resend my code" link. The only recovery path is human escalation via `mailto:hello@mrqlive.com`.

### 1.2 In Scope (Phase 1)

- New synchronous Resend send in `/api/verify` after the verification transaction commits.
- New React Email template `entryCodeConfirmationEmail.tsx` matching MrQ Live branding.
- New nullable column `Registration.confirmationEmailSentAt` to track the most recent successful send.
- **Resend support: new endpoint `POST /api/resend-confirmation-email` and rewiring of the existing success-page Resend button.** The existing button on the success page (gated by `Activation.successShowResend`) currently calls `/api/register`, which no-ops for verified users — visually claims "Sent!" but actually does nothing. This work makes that button finally do what it claims.
- Two new audit actions plus admin filter support on the existing audit log page. Both carry a `metadata.cause: 'verify' | 'resend'` discriminator so reporting can distinguish initial confirmations from on-demand resends.
- Failure handling: log to audit on send failure but **do not** roll back the verification or surface the failure to the participant.
- Tests covering: happy path, send-failure path, idempotency under retry, resend rate-limit, anti-enumeration response shape on resend, schema constraint behaviour.

### 1.3 Out of Scope

- A `POST /api/recover-entry-code` endpoint (BACKLOG 1.3 was sketching this; the post-verify email + the resend button close the underlying need without an additional endpoint).
- SMS confirmation. Email-only per V5 §1.2.
- Marketing content, upsell, unsubscribe footer (this is transactional — none of those apply).
- Webhooks from Resend for delivery confirmation (`confirmationEmailSentAt` records *that we dispatched*, not *that it was delivered* — Resend's own dashboard is the delivery oracle).
- Resend on a different email address (the punter typed wrong on registration). That's a manual-rescue case for the field-agent tool (`MRQ_LIVE_FIELD_AGENT_TOOL_PROMPT_V1.md`), not a self-service flow.

---

## 2. Architecture

### 2.1 Where the send happens

The send is invoked from `apps/activation-app/src/app/api/verify/route.ts` immediately after the verification Prisma transaction commits successfully. It is **inside the request lifecycle** but **outside the transaction** — we do not want to roll back a successful verification because of an email-send failure.

Flow:

```
1. POST /api/verify validates body (Zod)
2. consumeOtp() against Redis (constant-time)
3. Prisma transaction:
     a. Update Registration.status -> VERIFIED, set verifiedAt, generate entryCode
     b. Write AuditLog (action: participant.verified)
4. Transaction commits.
5. Call sendEntryCodeConfirmation() — synchronous, awaited, with 5s timeout + 1 retry.
6. If send succeeds: update Registration.confirmationEmailSentAt = now; audit participant.confirmation_email_sent.
7. If send fails after retry: audit participant.confirmation_email_failed; do NOT throw to the user.
8. Return 200 to the participant (with entryCode in the response body, as today).
```

The participant's experience is **unchanged** on the happy path — they still see the success page with the entry code. The email is purely additive.

### 2.2 The `EmailProvider` interface

Extend the existing interface at `apps/activation-app/src/lib/email/provider.ts`:

```ts
export interface EmailProvider {
  sendOtp(args: { to: string; otp: string; activationName: string }): Promise<void>
  sendInvite(args: { to: string; inviteUrl: string; expiresAt: Date }): Promise<void>
  sendPasswordReset(args: { to: string; resetUrl: string; expiresAt: Date }): Promise<void>

  // NEW
  sendEntryCodeConfirmation(args: {
    to: string
    entryCode: string
    activationName: string
    activationEndsAt: Date
    supportEmail: string
  }): Promise<void>
}
```

Implement on `ResendEmailProvider` at `apps/activation-app/src/lib/email/resend.ts`. Render the React Email template via `@react-email/render`. Same 5s timeout + one retry pattern as `sendOtp` — extract a shared `sendWithRetry()` helper if not already present.

### 2.3 Failure handling

| Failure | Action |
|---|---|
| Resend returns 4xx (bad email, suppressed) | Audit `participant.confirmation_email_failed` with `metadata.reason: 'rejected'`. Do not retry. Do not fail user request. |
| Resend returns 5xx or times out (first attempt) | Retry once after a short backoff. |
| Both attempts fail | Audit `participant.confirmation_email_failed` with `metadata.reason: 'transient'`. Do not fail user request. |
| Network error during send call | Same as 5xx — one retry, then audit-and-continue. |
| `confirmationEmailSentAt` update fails after a successful send | Audit `participant.confirmation_email_send_recorded_failed` (rare; Postgres back-pressure). Send cannot be reversed; the row exists in the DB but lacks the timestamp. Acceptable. |

The user-facing `/api/verify` response **always** returns 200 on a successful verification, regardless of email send outcome. The entry code is in the response body either way.

### 2.4 What we do NOT do

- **No queue.** V5 §10 chose synchronous email sending; we follow the same pattern. A queue is BACKLOG 5.1 and is the right answer if `/api/verify` p95 latency starts hurting verification rates — but not yet.
- **No webhook handling.** Resend's delivery webhooks are out of scope. `confirmationEmailSentAt` records dispatch, not delivery.
- **No fire-and-forget.** The send is awaited so the audit row reflects the outcome by the time the response returns. This avoids a race where the user retries `/api/verify` (which is idempotent on `VERIFIED` rows) before the first send completes.

### 2.5 Resend: new endpoint and existing-button rewire

#### Background — what's there today

The participant success page (`apps/activation-app/src/app/(participant)/[activationSlug]/success/page.tsx`) renders a `SuccessSessionData` client island that, when `Activation.successShowResend` is true, surfaces a **Resend** button. Today that button calls `POST /api/register` with the participant's stored `{ activationId, email, consentVersion }` (`src/components/participant/SuccessSessionData.tsx`). For a verified email, `/api/register` no-ops via the V5 §8 anti-enumeration path: the button optimistically flips to "Sent!" but no email actually goes out. The success-page copy *"We've sent a confirmation to <email>"* is also currently inaccurate — no such email is sent today.

This Phase 1 work makes both true: the initial confirmation email is sent on verify, **and** the Resend button actually resends it.

#### New endpoint

```
POST /api/resend-confirmation-email
Body: { activationId, email, consentVersion }
Returns: 202 { ok: true } — always, regardless of internal state
```

Lives at `apps/activation-app/src/app/api/resend-confirmation-email/route.ts`. Host-gated to the participant host in `proxy.ts` alongside `/api/register` and `/api/verify`.

Server-side flow:

1. Zod-validate the body. On invalid input, return 400 with the structured error shape.
2. Apply two rate limits (atomic `fixedWindow` per V5 §8.4):
   - **Per-IP:** `resend:ip:{ipHash}` — 10 / 5 min. Catches blanket scraping.
   - **Per-(activation, email-hash):** `resend:email:{activationId}:{emailHash}` — 3 / 1 hour. Caps how often a given participant can request a resend.
3. Look up the `Registration` by `(activationId, emailHash)`.
4. If a row exists **and** is `VERIFIED` **and** has a non-null `entryCode`, send the confirmation email synchronously (5s timeout, one retry — same `sendWithRetry` helper as the verify-time send).
5. On success: update `Registration.confirmationEmailSentAt = now`. Audit `participant.confirmation_email_sent` with `metadata.cause = 'resend'`.
6. On send failure: audit `participant.confirmation_email_failed` with `metadata.cause = 'resend'` and `metadata.reason`. Do not retry beyond the one in-line retry. Do not surface the failure to the participant — same posture as the verify-time send.
7. **Always** return `202 { ok: true }`, regardless of whether step 3 found a row or step 4 succeeded. **Anti-enumeration is non-negotiable here** — leaking "we found a verified row for this email" via response shape or timing would be an enumeration oracle on the verified-participants set. Identical 202 means the attacker learns nothing.
8. Hit a baseline-time floor (~150ms) before responding so found / not-found / send-failed responses are timing-indistinguishable.

#### Rewire the existing button

`SuccessSessionData.tsx`'s `handleResend()` currently posts to `/api/register`. Change it to post to `/api/resend-confirmation-email` with the same body shape. The optimistic "Sent!" UX stays the same. No other UI changes needed — the existing copy *"We've sent a confirmation to <email>"* and the existing button label become honest.

#### Why a separate endpoint, not overload `/api/register`

Considered making `/api/register` send the confirmation email when called for a verified row. Rejected because:

- `/api/register` is the OTP-issue endpoint. Conflating "verify-an-unknown-email" (issues OTP, rate-limited for first contact) with "resend-to-verified-email" (sends entry-code receipt, rate-limited for harassment) entangles two flows with materially different threat models.
- The audit action becomes ambiguous (`participant.otp_issued` vs `participant.confirmation_email_sent` from the same endpoint).
- Future evolution is harder — separate endpoints can change independently.

---

## 3. Email Template

### 3.1 From / Subject

| Field | Value |
|---|---|
| From | `EMAIL_FROM` (existing env, unchanged) |
| Subject | `Your entry code for {activationName}` |
| Reply-To | Configured support email (`SUPPORT_EMAIL` env var; see §6.2) |

### 3.2 Copy

British English. Plain, transactional. No marketing voice. No tracking pixels, no UTM-tagged links, no unsubscribe footer (none required for transactional mail).

The same template renders both the verify-time send and the resend; one optional line at the top signals which it is so a participant who clicked Resend doesn't get confused. The template accepts a `cause: 'verify' | 'resend'` prop.

```
Subject: Your entry code for {activationName}

Hi,

{cause === 'resend' ? "Here's your entry code again, as requested." : "You're registered for {activationName}. Here's your entry code:"}

  {entryCode}

Show this at the booth to claim your reward. Keep this email — it's the only place you'll find your code if you close the page.

The activation runs until {activationEndsAt formatted Europe/London}.

Need help? Reply to this email or contact {supportEmail}.

— The MrQ Live team
```

The HTML rendering uses the existing React Email scaffolding under `apps/activation-app/src/lib/email/templates/`. Mirror the style of `otpEmail.tsx`. The entry code itself should be:

- Centred
- Larger font (e.g. 32px)
- Monospace (`font-family: ui-monospace, ...`)
- Surrounded by enough whitespace to be obviously the important thing in the email
- Selectable / copyable (no images, no canvas)

A plaintext alternative is rendered automatically by React Email; ensure the entry code is on its own line for easy parsing.

**Layout differences between variants (approved retrospectively in v1.5).** The verify variant uses a two-line opening — a bold heading + a lighter subheading. The resend variant **collapses to a single bold heading line and suppresses the subheading entirely**, on the rationale that the resend message is informationally less important (the participant has been here before) and the resend copy is already a complete sentence with a comma — a subheading would be redundant. The body, entry-code panel, and footer below the heading are identical across both variants.

### 3.3 What the email does NOT contain

- No participant's name (we don't collect one).
- No marketing content, no upsell, no "join MrQ" CTA.
- No personalised tracking link.
- No social media links.
- No "unsubscribe" link (transactional mail; would actively confuse the recipient).
- No QR code (the entry code is the artefact, not a re-scannable QR).
- No reference to the booth code, UTM source, or any internal attribution data.

---

## 4. Data Model

### 4.1 Schema Change

One nullable column on `Registration`:

```prisma
model Registration {
  // ... existing fields ...

  /// Set when the post-verify confirmation email has been successfully
  /// dispatched via Resend. Null for:
  ///   - PENDING / EXPIRED rows (never verified)
  ///   - VERIFIED rows that predate this feature (no backfill)
  ///   - VERIFIED rows where the dispatch failed
  /// "Sent" here means Resend accepted the request, NOT that the email
  /// was delivered to the inbox. Delivery tracking is via Resend's dashboard.
  confirmationEmailSentAt DateTime?
}
```

**No backfill of historical data.** Pre-existing VERIFIED rows keep `confirmationEmailSentAt = NULL`. They didn't get an email at the time and won't be retroactively emailed (compliance: re-emailing months later would surprise participants).

### 4.2 Migration

Single Prisma migration: `add_confirmation_email_sent_at_to_registration`.

```sql
ALTER TABLE "Registration"
  ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);
```

Nullable, no default, no index. The column is for record-keeping and DSAR completeness, not for query filtering. If a future feature needs to query "registrations not yet emailed," add an index then.

Generated via `pnpm prisma migrate dev --create-only` then reviewed per V5 §1. Applied via Railway Release Command on the activation-app service.

### 4.3 DSAR / Erasure

`confirmationEmailSentAt` is a date, not PII. The DSAR export at `src/app/api/admin/dsar/export/route.ts` should include this column for completeness — closes part of the gap flagged in BACKLOG 6.2.

Erasure: the column nulls out automatically with the row (no special handling).

---

## 5. Audit Actions

### 5.1 Pre-existing action this prompt formalises

The verification-success audit row already implied by §2.1's flow:

```
participant.verified                # written inside the verify Prisma transaction
```

This row may or may not be written by the existing `/api/verify` route handler today — implementations differ across versions. **This prompt requires that it is written.** If the existing handler does not write it, Phase 2 adds it. If it does, Phase 2 leaves it untouched. Metadata schema:

```ts
// participant.verified
metadata: {
  emailHash: string                // HMAC of verified email
  entryCode: string | null         // generated entry code (null if activation has no entryCodePrefix)
}
```

Written **inside** the verification transaction, before the email send, so the audit row commits atomically with the status transition. Same row attributes as the new actions below (`category: ADMIN`, `actorId: null`, `targetType: 'Registration'`, `targetId: <registration.id>`, `ipHash`).

### 5.2 New actions

Two new actions for the email-send outcome:

```
participant.confirmation_email_sent
participant.confirmation_email_failed
```

Plus one rate-limit signal (closes BACKLOG 4.3 for these endpoints):

```
participant.resend_rate_limited
```

Metadata schema:

```ts
// participant.confirmation_email_sent
metadata: {
  emailHash: string           // HMAC of recipient email
  resendMessageId: string     // Resend's message ID for cross-referencing in their dashboard
  cause: 'verify' | 'resend'  // distinguishes the initial send from on-demand resends
}

// participant.confirmation_email_failed
metadata: {
  emailHash: string
  reason: 'rejected' | 'transient'   // populated by the provider; classifier landed in Phase 3
  attempts: 1 | 2
  cause: 'verify' | 'resend'
  lastError?: string                 // truncated to 200 chars; never includes PII
}

// participant.resend_rate_limited
metadata: {
  emailHash: string
  scope: 'ip' | 'activation_email'   // which limiter denied
}
```

All rows have:

- `category: ADMIN` for `participant.confirmation_email_*`. `category: SECURITY` for `participant.resend_rate_limited`.
- `actorId: null` (sends are system-initiated, not admin-initiated). **Do not** set an `actorType` field — the column does not exist in the current `AuditLog` schema. See the convention note below.
- `targetType: 'Registration'`, `targetId: <registration.id>` for sent/failed rows. For rate-limit rows where the registration may not exist (anti-enumeration), `targetType: 'Activation'`, `targetId: <activationId>`.
- `ipHash: <participant's hashed IP from the request>`

The admin audit page at `/admin/audit` should add a filter for the new actions; this is a small UI tweak, not a new page.

**Actor-type convention (pre-field-agent-Phase-1).** The current `AuditLog` schema has no `actorType` column. That column is added by **Phase 1 of `MRQ_LIVE_FIELD_AGENT_TOOL_PROMPT_V1.md`**, which ships *after* this prompt. Until then, the convention is:

| `actorId` | Meaning |
|---|---|
| Set | Admin-initiated action (existing convention from V5) |
| `NULL` | System-initiated action (this prompt's confirmation-email writes; existing convention from V5 for cron / scheduler / system rows) |

The field-agent project's Phase 1 backfill matrix (§3.3 of that prompt) explicitly handles this: rows with `actorId IS NULL` backfill to `actorType = 'SYSTEM'`. The audit rows written by this prompt will be retroactively classified at no extra cost when the column lands.

**Do not** add an `actorType` column ahead of the field-agent project — the column ownership belongs there, and adding it twice is a guaranteed migration conflict.

---

## 6. Compliance, Legal Basis, and Configuration

### 6.1 Legal Basis (GDPR Art. 6)

The confirmation email is **transactional** — necessary to perform the contract / legitimate interest in providing the registered service. Same legal basis as the OTP email itself, which is sent without explicit "agree to receive emails" consent because it is a necessary part of the verification flow.

This is **not** marketing. No `mrqContactConsent` check is required for it; the email goes to every successfully verified registration regardless of marketing preferences.

If a participant has been added to the existing `EmailSuppression` table (e.g. they bounced a previous OTP), Resend's own suppression handling will reject the send. This will surface as `participant.confirmation_email_failed` with `reason: 'rejected'`. Acceptable.

### 6.2 New Configuration

One new optional environment variable for the support email reply-to:

```
SUPPORT_EMAIL=hello@mrqlive.com   # optional; falls back to EMAIL_FROM if absent
```

Added to `apps/activation-app/src/lib/env.ts` as `z.string().email().optional()`. Documented in `.env.example` in the same PR.

### 6.3 Retention

Inherits the existing `Registration` retention from V5 §14.1 — purged when the surrounding row is purged. No new retention rule needed.

Audit rows for the two new actions follow the existing 2-year audit-log retention.

---

## 7. Phased Delivery

Mirrors the V5 phased-delivery convention, scaled to this feature's scope. Each phase has a pre-flight checklist, a scoped implementation list, a verification checklist, an effort estimate, and an explicit checkpoint gate. **Stop at every checkpoint.** Phase N+1 begins only on receipt of `Phase [N] approved — begin Phase [N+1]`. Any other input is feedback on the current phase.

### Phase 1 — Schema and provider scaffolding

**Pre-flight:**
- [ ] V5 production smoke test passes against `main` HEAD.
- [ ] A clean local checkout builds, lints, typechecks, and tests pass.
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` are set in the local `.env.local` and a Resend sandbox inbox is available for manual verification.

**Implementation:**
- New migration `add_confirmation_email_sent_at_to_registration` adding the nullable column per §4.1. Generated via `pnpm prisma migrate dev --create-only`; SQL reviewed; then applied locally.
- New optional env var `SUPPORT_EMAIL` added to `apps/activation-app/src/lib/env.ts` and `.env.example`.
- Extend the `EmailProvider` interface at `apps/activation-app/src/lib/email/provider.ts` with `sendEntryCodeConfirmation()` per §2.2.
- Implement on `ResendEmailProvider` at `apps/activation-app/src/lib/email/resend.ts` (initial implementation supports `cause: 'verify'` only; `'resend'` variant added in Phase 4).
- Create `entryCodeConfirmationEmail.tsx` at `apps/activation-app/src/lib/email/templates/` with the verify-time copy from §3.2.
- Unit tests: template renders correct subject, entry code, and Europe/London-formatted end date; plaintext alternative contains the entry code; provider calls Resend with correct args; provider retries once on transient failure; provider throws after both attempts fail.

**Verification checklist:**
- [ ] `pnpm prisma migrate status` shows the new migration applied.
- [ ] `Registration.confirmationEmailSentAt` is queryable and accepts NULL.
- [ ] `pnpm test` passes including the new template and provider tests.
- [ ] Manually invoking `provider.sendEntryCodeConfirmation()` in a REPL produces an email in the Resend sandbox with the expected subject and content.
- [ ] No callers of the new method exist yet (verified by grep). Phase 1 is scaffolding only.

**Effort:** ~half day.

**Checkpoint:** await `Phase 1 approved — begin Phase 2`.

---

### Phase 2 — Verify-time send wiring

**Pre-flight:**
- [ ] Phase 1 approved and merged.
- [ ] No regressions in the existing participant verify flow on the local build.

**Implementation:**
- Update `apps/activation-app/src/app/api/verify/route.ts` per §2.1's flow.
- **Inside** the verification Prisma transaction (after the status transition to `VERIFIED` and entry-code generation), write the `participant.verified` audit row per §5.1. If the existing handler already writes this row, leave it untouched and verify it conforms to the §5.1 metadata shape; if not, add it. The audit write commits atomically with the status transition.
- **After** the transaction commits, call `provider.sendEntryCodeConfirmation()` (cause `'verify'`).
- On send success: update `Registration.confirmationEmailSentAt = now` and write `participant.confirmation_email_sent` audit row with `metadata.cause = 'verify'` and `metadata.resendMessageId`.
- On send failure (post-retry): write `participant.confirmation_email_failed` audit row with `metadata.cause = 'verify'`. **Do not** re-throw; the participant request returns 200 regardless. Note: `metadata.reason` is acceptable as a placeholder string in this phase — Phase 3 lifts the provider to classify rejected vs transient.
- Audit rows use `actorId: null` per the §5 actor-type convention. **Do not** add an `actorType` field.
- Tests in `apps/activation-app/src/app/api/verify/__tests__/verify.test.ts`:
  - happy path: verify success → `participant.verified` row written → email sent (cause=verify) → `confirmationEmailSentAt` set → `participant.confirmation_email_sent` row written
  - email failure path: verify success → `participant.verified` written → email fails → `participant.confirmation_email_failed` written → response still 200
  - idempotent re-verify of an already-VERIFIED row does NOT re-send the email and does NOT write a duplicate `participant.verified` row (preserves V5's anti-enumeration design)

**Verification checklist:**
- [ ] Full participant flow on local: register → receive OTP → verify → success page renders → email arrives in Resend sandbox.
- [ ] Audit log shows exactly one `participant.verified` and one `participant.confirmation_email_sent` row per successful verification.
- [ ] Re-submitting `/api/verify` for the same `(activationId, email)` does not produce a second of either row.
- [ ] Mocked Resend failure in the test suite produces a `participant.confirmation_email_failed` row but the verify endpoint still returns 200.
- [ ] DSAR export includes the new `confirmationEmailSentAt` column on the participant's row.
- [ ] No timing regression in `/api/verify` p95 in local benchmarking (acceptable: +50–250ms from the synchronous send).

**Effort:** ~half day.

**Checkpoint:** await `Phase 2 approved — begin Phase 3`.

---

### Phase 3 — Provider error classification + return-shape symmetry

**Pre-flight:**
- [ ] Phase 2 approved and merged.
- [ ] Resend's API error documentation has been read; HTTP status code semantics confirmed.

**Implementation:**
- Update the shared `sendWithRetry()` helper (or each method individually if no helper exists yet) to inspect the Resend response on failure and classify into one of two reasons:
  - `'rejected'` — non-retryable client errors. HTTP 4xx (e.g. invalid email, account-suppressed recipient, validation error). Do not retry.
  - `'transient'` — retryable server / network errors. HTTP 5xx, fetch timeout, network reset. One retry then give up.
- **Failure return shape:** `{ ok: false, reason: 'rejected' | 'transient', attempts: 1 | 2, lastError: string }`. `lastError` is truncated to 200 chars and never includes the recipient email or any other PII.
- **Success return shape (symmetric across all four methods):** `{ ok: true, messageId: string }`. This applies to `sendOtp`, `sendInvite`, `sendPasswordReset`, **and** `sendEntryCodeConfirmation` — all four. The change is purely additive (existing callers only inspect `ok`); the symmetric shape unlocks future audit upgrades (e.g. recording `messageId` on OTP and invite sends to cross-reference Resend's dashboard) as one-line metadata changes rather than provider-touching changes.
- Backfill the audit-row writers in `/api/verify` (and any other current call site) to pass `reason` from the provider's return value into `metadata.reason` instead of hardcoding `'transient'`.
- Tests in `apps/activation-app/src/lib/email/__tests__/resend.test.ts` (extending the existing suite):
  - mocked 400/422 → `reason: 'rejected'`, `attempts: 1`, no retry attempted
  - mocked 500 → `reason: 'transient'`, `attempts: 2`, one retry attempted
  - mocked network timeout → `reason: 'transient'`, `attempts: 2`
  - mocked 200 on retry → `{ ok: true, messageId, ... }`, `attempts: 2`
  - All four methods (`sendOtp`, `sendInvite`, `sendPasswordReset`, `sendEntryCodeConfirmation`) return `messageId` on success.
- Update the verify-suite test for the failure path to assert the audit row's `metadata.reason` reflects the mocked Resend response class.

**Knock-on effect (intentional, document in PR description):** The existing audit actions `user.invite.send_failed` and `user.password_reset.send_failed` previously recorded `metadata.reason: 'send-failed'` (a placeholder). After this phase, they record `'rejected' | 'transient'` — the field name is unchanged, the values become more accurate. A grep of the codebase confirms no live consumer hardcodes `'send-failed'` (only V4/V5 prompt examples in `src/resource/` reference the legacy string), so nothing breaks. Mention this explicitly in the PR description so reviewers understand the scope.

**Verification checklist:**
- [ ] All four resend-suite classification tests pass.
- [ ] All four provider methods return `messageId` on success.
- [ ] Mocked 4xx in the verify suite produces an audit row with `metadata.reason: 'rejected'` and `metadata.attempts: 1`.
- [ ] Mocked 5xx in the verify suite produces an audit row with `metadata.reason: 'transient'` and `metadata.attempts: 2`.
- [ ] No 4xx response triggers a retry (verified by counting Resend mock invocations).
- [ ] `lastError` content reviewed: ≤200 chars, no PII, useful for debugging.
- [ ] Grep confirms no live code path hardcodes `'send-failed'` as a `metadata.reason` value (existing references are documentation-only). PR description notes the audit-row improvement on `user.invite.send_failed` and `user.password_reset.send_failed`.

**Effort:** ~half day. Symmetric success returns are 4 one-line changes plus 4 test assertions; immaterial to the budget.

**Checkpoint:** await `Phase 3 approved — begin Phase 4`.

---

### Phase 4 — Resend endpoint with anti-enumeration

**Pre-flight:**
- [ ] Phase 2 approved and merged.
- [ ] Verify-time send is producing emails reliably in staging.

**Implementation:**
- New route handler `apps/activation-app/src/app/api/resend-confirmation-email/route.ts` per §2.5.
- `proxy.ts` updated to host-gate the new route to the participant host alongside `/api/register` and `/api/verify`.
- Two-tier rate limit using the existing `fixedWindow` primitive:
  - `resend:ip:{ipHash}` — 10 / 5 min
  - `resend:email:{activationId}:{emailHash}` — 3 / 1 hour
- Lookup by `(activationId, emailHash)`; if VERIFIED with non-null `entryCode`, send (cause `'resend'`); else no-op.
- Always return `202 { ok: true }`, regardless of internal state. Anti-enumeration is non-negotiable.
- Baseline-time floor (~150ms) on every code path so found / not-found / rate-limited responses are timing-indistinguishable.
- New audit action `participant.resend_rate_limited` with `metadata.scope: 'ip' | 'activation_email'`.
- Tests in `apps/activation-app/src/app/api/resend-confirmation-email/__tests__/resend.test.ts` covering all the cases listed in §10.

**Verification checklist:**
- [ ] All resend-suite tests pass, including the timing-floor assertion (found / not-found / rate-limited within 50ms of each other).
- [ ] Rate-limit table populated correctly: 10/5min per IP, 3/hour per (activation, email-hash).
- [ ] `participant.resend_rate_limited` audit rows produced when limits hit.
- [ ] Hitting the endpoint with a non-existent email returns 202 and writes no `_sent` or `_failed` audit row.
- [ ] Hitting the endpoint with a VERIFIED email produces a real email with the placeholder verify-variant copy (resend variant arrives in Phase 5).
- [ ] Existing success-page Resend button is **not yet rewired** — verified by grep that `SuccessSessionData.tsx` still posts to `/api/register`. UI rewire is Phase 5.
- [ ] Failure rows from this endpoint use the structured `metadata.reason` from Phase 3's classifier — not hardcoded `'transient'`.

**Effort:** ~1 day (the largest phase — anti-enumeration timing work and the rate-limit composition need care).

**Checkpoint:** await `Phase 4 approved — begin Phase 5`.

---

### Phase 5 — Template resend variant + UI rewire

**Pre-flight:**
- [ ] Phase 4 approved and merged.
- [ ] Resend endpoint is producing emails reliably in staging.
- [ ] Marketing has signed off on the resend-variant copy in §3.2.

**Implementation:**
- Update `entryCodeConfirmationEmail.tsx` to accept `cause: 'verify' | 'resend'` prop. Render the alternate headline ("Here's your entry code again, as requested.") when `cause === 'resend'`. Body otherwise identical.
- Update the resend route handler to pass `cause: 'resend'` to the provider.
- Rewire `SuccessSessionData.tsx` (`handleResend()`) from `POST /api/register` to `POST /api/resend-confirmation-email` with the same body shape (`{ activationId, email, consentVersion }`).
- Tests in `apps/activation-app/src/components/participant/__tests__/SuccessSessionData.test.tsx`:
  - Resend button POSTs to `/api/resend-confirmation-email` (NOT `/api/register`)
  - Button surface state cycles: idle → "Sending…" → "Sent!" → idle (on subsequent click)
- Update template tests to cover both `cause: 'verify'` and `cause: 'resend'` rendering.

**Verification checklist:**
- [ ] Both template tests pass for both `cause` values.
- [ ] Local manual UI test: complete a verification → click Resend on the success page → second email arrives with the "again, as requested" headline; audit row carries `cause: 'resend'`.
- [ ] Click Resend three more times → 4th attempt is rate-limited, button shows "Sent!" optimistically (UX unchanged), but no email sent and `participant.resend_rate_limited` audit row written.
- [ ] No callers of `/api/register` from `SuccessSessionData.tsx` remain (grep verified).
- [ ] Existing OTP-resend flow on the `/verify` page still calls `/api/register` correctly (regression check — that flow is unchanged).

**Effort:** ~half day.

**Checkpoint:** await `Phase 5 approved — begin Phase 6`.

**Retrospective notes (from Phase 5 v1.5 review):**
- The resend variant collapsed visual layout (single bold heading, no subheading) is approved retrospectively. Captured in §3.2.
- `EmailProvider.sendEntryCodeConfirmation` makes `cause` a **required** arg, with destructuring defaults at the implementation level for React Email's preview tool. All four success-shape symmetric methods (`sendOtp`, `sendInvite`, `sendPasswordReset`, `sendEntryCodeConfirmation`) return `{ ok: true, messageId }` after Phase 3.
- New component-test infrastructure landed: `@testing-library/react`, `@testing-library/user-event`, `happy-dom` added as dev deps. Conventions captured separately (see methodology entry filed at v1.5 time).
- Negative-assertion fragility on template tests is a known concern (React's `<!-- -->` interpolation markers). Mitigation captured in §10.

---

### Phase 6 — Compliance hardening and production rollout

**Pre-flight:**
- [ ] Phase 5 approved and merged.
- [ ] Compliance has reviewed the email copy (verify and resend variants).
- [ ] Ops has confirmed `SUPPORT_EMAIL` value for production.
- [ ] Resend production sender domain DKIM/SPF verified.

**Implementation:**
- Add a filter on the existing `/admin/audit` page for the three new audit actions (`participant.confirmation_email_sent`, `participant.confirmation_email_failed`, `participant.resend_rate_limited`).
- Confirm DSAR export at `apps/activation-app/src/app/api/admin/dsar/export/route.ts` includes the new `confirmationEmailSentAt` column (closes part of BACKLOG 6.2).
- Extend the V5 production smoke test (`docs/RUNBOOK.md`) to include:
  - Step: register a test email, verify, confirm a confirmation email arrives.
  - Step: click Resend, confirm a second email arrives with the alternate headline.
- Update `docs/RUNBOOK.md` with a brief note on the new audit actions and how to query them when investigating support tickets.

**Verification checklist:**
- [ ] Extended smoke test passes against staging.
- [ ] **Cross-client visual review of the resend variant** — open the resend email in at least: Gmail web, Gmail iOS app, Outlook web. Confirm the collapsed-heading layout (§3.2) renders correctly. The verify variant has been in production since Phase 2, so no re-check is needed for that one. Take screenshots; attach to the Phase 6 PR description.
- [ ] Admin audit page filters work for the three new audit actions.
- [ ] DSAR export includes `confirmationEmailSentAt` for at least one VERIFIED row.
- [ ] Production deploy via Railway Release Command applies the migration successfully.
- [ ] Within 1 hour of production deploy: extended smoke test passes against `live.hqmops.com`. Resend dashboard shows healthy delivery rate (no spike in bounces or rejections relative to the existing OTP send).
- [ ] BACKLOG 1.3 marked as closed in `BACKLOG.md`.

**Rollback:**
- Code: `git revert` the relevant phase PRs and redeploy.
- Migration: `confirmationEmailSentAt` is nullable with no default; reverting the code does not require a schema rollback. The column can sit unused indefinitely with no functional impact.
- DNS / feature-flag rollback: not applicable — the change is additive on the existing participant host.

**Effort:** ~half day attended deploy + monitoring.

**Checkpoint:** await `Phase 6 approved — feature complete`. Update `MEMORY.md` / status report; close BACKLOG 1.3.

---

**Total effort: ~3 days across the six phases.** Each phase is independently reviewable, independently testable, and produces working code that can sit on `main` indefinitely without harm if the next phase is delayed.

---

## 8. Resolved Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Synchronous send, audit-and-continue on failure.** | User has their code on the success page; email is a recovery aid, not a critical path. Failing the verify because email failed would be a worse user experience. |
| D2 | **Resend on demand IS in Phase 1 (revised v1.1).** New endpoint `/api/resend-confirmation-email`, two-tier rate limit (10/5min per IP, 3/hour per activation+emailHash), identical-shape 202 response regardless of internal state, baseline-time floor for anti-enumeration. Existing success-page button rewired from `/api/register` (which currently no-ops for verified users) to the new endpoint. | The existing `successShowResend` flag and visible Resend button on the success page mean a half-feature was unacceptable: shipping the verify-time email without resend would leave the existing UI lying to users (button says "Sent!" but does nothing for verified rows). The anti-enumeration concern is addressable with standard primitives (rate limit + identical-shape 202 + timing floor) that the platform already uses elsewhere. |
| D3 | **No backfill of historical VERIFIED rows.** | Re-emailing entry codes weeks/months after the original verification would surprise participants and trigger spam complaints. Compliance leans against. |
| D4 | **Transactional legal basis, no marketing consent check.** | Same basis as the OTP email; no new consent flow. |
| D5 | **`SUPPORT_EMAIL` is a separate env var with fallback to `EMAIL_FROM`.** | Lets ops route reply-to to a monitored inbox without touching the from address. |
| D6 | **Closes BACKLOG 1.3 in lieu of a `/api/recover-entry-code` endpoint.** | Prevention is better than recovery; the email IS the recovery artefact. |

---

## 9. Open Questions / Decisions Needed Before Kickoff

| # | Question | Owner | Default if undecided |
|---|---|---|---|
| 1 | Final email copy sign-off | Marketing | Copy in §3.2 as written |
| 2 | `SUPPORT_EMAIL` value for production | Ops | `hello@mrqlive.com` (current `mailto:` target on `/expired`) |
| 3 | Should we add a "view entry code online" link in the email? | Marketing + Engineering | **No** for Phase 1 — would require a tokenised endpoint. Revisit if support asks. |
| 4 | Add an index on `confirmationEmailSentAt` for "find rows where email failed" queries? | Engineering | **No** — column is for record-keeping. Add an index when a feature actually needs to query it. |

---

## 10. Testing

Required tests in the PR:

```
apps/activation-app/src/lib/email/__tests__/entryCodeConfirmationEmail.test.ts
  - renders correct subject for an activation
  - renders entry code in <code> element
  - includes activation end date in Europe/London
  - plaintext alternative contains the entry code
  - cause: 'verify' renders the initial-confirmation headline
  - cause: 'resend' renders the "again, as requested" headline

apps/activation-app/src/lib/email/__tests__/resend.test.ts
  - sendEntryCodeConfirmation calls Resend with correct args
  - retries once on transient failure
  - throws after both attempts fail (caller catches)

apps/activation-app/src/app/api/verify/__tests__/verify.test.ts
  - happy path: verify success → email sent (cause=verify) → confirmationEmailSentAt set → audit row written
  - email failure path: verify success → email fails → audit failure row → response still 200
  - idempotent re-verify of an already-VERIFIED row does NOT re-send the email

apps/activation-app/src/app/api/resend-confirmation-email/__tests__/resend.test.ts
  - happy path: VERIFIED row + within rate limits → email sent (cause=resend) → 202
  - PENDING row + within rate limits → 202 returned, NO email sent (anti-enumeration)
  - non-existent email + within rate limits → 202 returned, NO email sent
  - past per-IP limit (10/5min) → 202 returned, audit participant.resend_rate_limited (scope=ip), NO email sent
  - past per-(activation, emailHash) limit (3/hour) → 202 returned, audit participant.resend_rate_limited (scope=activation_email), NO email sent
  - response timing: found, not-found, and rate-limited paths are statistically indistinguishable (within 50ms tolerance) — the timing-floor test
  - resend Resend 5xx (mocked) → audit participant.confirmation_email_failed (cause=resend) → 202 still returned

apps/activation-app/src/components/participant/__tests__/SuccessSessionData.test.tsx
  - Resend button POSTs to /api/resend-confirmation-email (NOT /api/register)
  - Button surface state cycles: idle → "Sending…" → "Sent!" → idle (on subsequent click)
```

Two anti-enumeration tests are non-negotiable:

1. **The verify-suite re-verify test.** V5's anti-enumeration design means `/api/verify` returns identical-shape responses for "wrong OTP" and "already verified". The new code must not break that — and must not double-send the email if the participant retries verify.
2. **The resend-suite timing-floor test.** Found, not-found, and rate-limited paths must respond in statistically indistinguishable time. The implementation enforces this with a `Promise.all([work, sleep(150)])` floor on every request.

### 10.1 Template-variant test technique — React HTML comment markers

When asserting on rendered template HTML, **do not write matchers that span a JSX-interpolation boundary.** React inserts HTML comment markers (`<!-- -->`) between adjacent text and `{interpolatedValue}` boundaries to support hydration. So this:

```tsx
<Heading>You're registered for {activationName}</Heading>
```

renders as:

```html
<h1>You're registered for <!-- -->Wembley Live Test</h1>
```

Which means a contiguous-string matcher like `expect(html).toContain("registered for Wembley Live Test")` **fails** even though the rendered output is visually correct.

The right pattern: pick a unique discriminator phrase that lives entirely within a single text run, with no interpolation inside it. For this template:

| Variant | Discriminator (does NOT span an interpolation) |
|---|---|
| `cause: 'verify'` | `"registered for"` |
| `cause: 'resend'` | `"again, as requested"` |

Both are unique to their variant and contiguous in the source — neither breaks under React's marker injection. Avoid:

- Regex matchers that explicitly accommodate `<!-- -->` markers — couples the test to React internals; breaks when React's marker format changes.
- Switching to `react-dom/server`'s `renderToStaticMarkup` to bypass markers — tests then exercise a different code path than ships.

Plaintext assertions are exempt: the plaintext renderer builds a flat string with template literals, no JSX, so contiguous matching works. Keep tighter assertions on plaintext where useful.

---

## 11. Glossary

- **Entry code** — the per-registration code generated at OTP verification when the activation has an `entryCodePrefix`. Stored on `Registration.entryCode`. Shown to the participant on the success page and (after this change) emailed to them.
- **Transactional email** — an email necessary to provide the service the participant signed up for, sent under contract-performance / legitimate-interest legal basis. Distinct from marketing email, which requires explicit consent.
- **Confirmation email** — the post-verify email defined in this prompt. Synonymous with "receipt email" in colloquial usage.

---

## 12. Changelog

- **v1.5 (Phase 5 retrospective pass)** — five updates from the Phase 5 review:
  - **§3.2 layout decision formalised.** The resend variant's collapsed visual layout (single bold heading, no subheading) is approved retrospectively. Reasoning: the resend message is informationally less important and the resend copy is already a complete sentence with a comma; a subheading would be redundant.
  - **§7 Phase 5 retrospective notes block** added inline so future maintainers can see what was decided in-flight (cause as required arg, success-shape symmetry, component-test infrastructure, negative-assertion fragility note).
  - **§7 Phase 6 verification list** gains an explicit cross-client visual review item (Gmail web, Gmail iOS, Outlook web) for the resend variant. The verify variant has been in production since Phase 2, so doesn't need a re-check.
  - **New §10.1** capturing the React HTML comment marker (`<!-- -->`) finding from Phase 5's testing work. Documents the contiguous-discriminator pattern for future template-variant tests so the next person doesn't re-litigate it.
  - **Two BACKLOG entries filed** alongside this prompt update: §5.7 (Sentry peer-dep version mismatch with Next 16, P3/S) and a methodology-page entry establishing the React component-testing convention.

- **v1.4 (Phase 3 mid-flight pass)** — two adjustments raised by the engineer mid-Phase-3, both folded into the same PR rather than deferred:
  - **Symmetric success return shape across all four `EmailProvider` methods.** `sendOtp`, `sendInvite`, `sendPasswordReset`, and `sendEntryCodeConfirmation` all return `{ ok: true, messageId: string }` on success. Purely additive (existing callers ignore the new field); unlocks future audit upgrades — recording `messageId` on OTP and invite sends becomes a one-line metadata change rather than a provider refactor. Phase 3 implementation list and verification checklist updated.
  - **Audit-metadata drift on `user.invite.send_failed` and `user.password_reset.send_failed`** documented as an expected knock-on of the classifier. Field name (`reason`) unchanged; values change from the placeholder `'send-failed'` to the accurate `'rejected' | 'transient'`. Grep of `src/` confirms no live consumer hardcodes `'send-failed'` — only the V4/V5 prompt documentation references the legacy string. Phase 3 PR description must call this out for reviewers. No live consumer change required.

- **v1.3 (Phase 2 retrospective pass)** — three corrections from observations during Phase 2 implementation:
  - **§5 actor-type convention.** Removed `actorType: SYSTEM` from the audit-row spec; the column does not exist in the current `AuditLog` schema. Added an explicit "actor-type convention" subsection: `actorId: null` is the system-row marker until the field-agent project's Phase 1 introduces the `actorType` column (the field-agent prompt's backfill matrix already classifies these rows as `SYSTEM` retroactively). Do not add the column ahead of the field-agent project.
  - **§5.1 `participant.verified` row formalised.** Added an explicit subsection promoting `participant.verified` from "implied by §2.1's flow" to a required audit row in this prompt's scope. Phase 2's implementation list now spells it out: written inside the verification transaction, before the email send, with a defined metadata schema. Idempotent re-verify must not write a duplicate.
  - **New Phase 3 — Provider error classification.** Inserted between the previous Phase 2 (verify-time send) and Phase 3 (resend endpoint, now Phase 4). The provider must classify Resend errors into `'rejected'` (4xx, no retry) and `'transient'` (5xx / network, one retry) and return the discriminator so audit rows carry the correct `metadata.reason`. Old Phases 3, 4, 5 renumbered to 4, 5, 6. Phase count in front matter updated five → six. Total effort bumped from 2.5–3 days to ~3 days.

- **v1.2 (phased-delivery conformance pass)** — restructured §7 to match the V5 / field-agent canonical phased-delivery shape. Five phases (Schema/scaffolding → Verify-time send → Resend endpoint → Template variant + UI rewire → Compliance + rollout), each with its own pre-flight checklist, scoped implementation list, verification checklist, effort estimate, and explicit `Phase [N] approved — begin Phase [N+1]` checkpoint gate. Front matter updated to declare the phase count and gate discipline. No engineering scope change — the same work, phased and gated for reviewability.

- **v1.1 (resend pass)** — added the resend-on-demand endpoint and rewired the existing success-page Resend button after discovering the existing button calls `/api/register` (which no-ops for verified users). Material changes:
  - New endpoint `POST /api/resend-confirmation-email` (§2.5).
  - Two-tier rate limit: 10/5min per IP, 3/hour per (activation, emailHash) (§2.5).
  - Anti-enumeration: identical 202 response + baseline-time floor (§2.5, §10).
  - Email template gains a `cause: 'verify' | 'resend'` prop and a different headline per variant (§3.2).
  - New audit action `participant.resend_rate_limited`. Existing `_sent` and `_failed` actions gain `cause` metadata (§5).
  - `SuccessSessionData.tsx` rewired from `/api/register` to the new endpoint (§2.5).
  - Decision D2 reversed (was: "no resend in Phase 1"; now: "resend in Phase 1").
  - Phase 1 effort revised from ~1.5–2 days to ~2.5–3 days (§7).
  - Test suite expanded with the resend-endpoint cases and the timing-floor assertion (§10).

- **v1.0** — initial prompt. Self-contained scope. Ships ahead of the field-agent project (`MRQ_LIVE_FIELD_AGENT_TOOL_PROMPT_V1.md`) to reduce that tool's rescue caseload.

---

*End of prompt v1. Treat as the canonical spec for this feature. To revise: bump to v2 in a new file rather than editing in place.*

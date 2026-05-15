# MrQ Live Activation Platform — Operations Runbook

## Railway Cron Schedules

Two cron jobs are configured as sibling services in Railway. Neither is a long-lived process — each spins up, runs, and exits.

```
# Daily retention purge (registrations past activation lifecycle, audit logs,
# password tokens). 03:00 UTC.
0 3 * * *    pnpm tsx workers/retentionPurge.ts

# Hourly PENDING sweep (abandoned registrations older than 24h). At minute 7
# to avoid clashing with top-of-hour load.
7 * * * *    pnpm tsx workers/pendingPurge.ts
```

Both scripts read `DATABASE_URL` from the Railway secret store. If either fails, stderr lands in Railway logs; a manual re-run is the recovery. The two are deliberately separate scripts so a failure in one does not block the other.

---

## Procedures

### DSAR (Data Subject Access Request)

1. Receive the DSAR request from Compliance with a ticket reference (e.g. `DSAR-2024-001`).
2. Log into the admin console at `https://admin.mrqlive.co.uk`.
3. Navigate to **Admin → DSAR** (`/admin/dsar`). This page is ADMIN-only; MEMBERs cannot access it.
4. Enter the participant's email address and the request reference from step 1.
5. Click **Search**. The page shows the registration count and which activations they belong to.
6. If registrations are found, click **Download DSAR CSV**. The download triggers the export and writes an `AuditLog` row (`action = "dsar.fulfilled"`, `metadata.rowCount`, `metadata.requestRef`). If no registrations are found, the page surfaces "No registrations found" — no download is required, but the search itself is recorded in the audit log automatically when you click Download (even for zero rows).
7. Deliver the CSV to the data subject via your Compliance-approved channel. Do not send it by email directly.

**Note:** The right to rectification is not in scope — registrations capture only email, booth, and UTM parameters. Correcting these post hoc would invalidate the audit trail.

---

### Erasure (Right to Be Forgotten)

1. Receive the erasure request from Compliance with a ticket reference (e.g. `ERASURE-2024-001`).
2. Log into the admin console at `https://admin.mrqlive.co.uk`.
3. Navigate to **Admin → Erasure** (`/admin/erasure`). This page is ADMIN-only.
4. Enter the participant's email address and the request reference.
5. Click **Preview erasure**. The page shows how many registrations will be deleted and which activations they belong to.
6. Review the preview. Enter a free-text reason (e.g. "Data subject requested erasure per Art. 17 GDPR") and type the confirmation phrase `ERASE PARTICIPANT DATA` exactly.
7. Click **Confirm erasure**. The server validates the typed phrase independently of the client — dropping the client-side check does not bypass the server guard.
8. On success the page shows the count of erased registrations and the request reference. The `AuditLog` row (`action = "erasure.fulfilled"`) is written atomically **before** the deletion so a post-erasure audit query proves the action occurred.
9. `AuditLog` entries referencing the participant by `emailHash` are **not** erased. Audit log retention is governed by the two-year window in §14.1. This is permitted under GDPR Art. 17(3)(e).

---

### Resend API Key Rotation

1. In the Resend dashboard, create a new API key with the same send permissions as the current one.
2. In Railway's secret store, update `RESEND_API_KEY` to the new key.
3. Trigger a redeploy (or Railway will pick it up on the next deploy).
4. Verify a test email sends successfully.
5. Revoke the old key in the Resend dashboard.

**When to rotate:** Any team-member offboarding; any suspected key compromise.

---

### HMAC Key Rotation

All HMAC keys in Phase 1 are non-rotating by design (see §14.4). Rotating them has different consequences per key:

| Key | Consequence of rotation | Safe to rotate? |
|-----|------------------------|-----------------|
| `EMAIL_HASH_HMAC_KEY` | Existing `emailHash` values become stale; dedup and right-to-erasure-by-hash break | No — requires a full re-hash migration |
| `IP_HMAC_KEY` | Existing `ipHash`/`userAgentHash` become stale | Yes — only affects future lookups |
| `OTP_HMAC_KEY` | In-flight OTPs (10-min TTL) are invalidated | Yes — participants retry registration |
| `PENDING_TOKEN_SECRET` | In-flight registration→verify hops are invalidated | Yes — participants retry registration |
| `INVITE_TOKEN_HMAC_KEY` | In-flight invite links are invalidated | Yes — ADMIN re-issues from Users page |
| `RESET_TOKEN_HMAC_KEY` | In-flight password reset links are invalidated | Yes — participant re-requests reset |

To rotate a safe key: update the value in Railway's secret store and redeploy. Inform affected users to retry their in-progress action.

To rotate `EMAIL_HASH_HMAC_KEY` (not done in Phase 1): requires a database migration that recomputes `emailHash` for every `Registration` row using the new key before the old key is removed.

---

### Sign Out All Admins

Rotating `NEXTAUTH_SECRET` invalidates all active admin sessions.

1. Generate a new secret: `openssl rand -base64 48`
2. Update `NEXTAUTH_SECRET` in Railway's secret store.
3. Redeploy. All admins are signed out immediately.
4. Notify the team to re-authenticate.

**When to use:** Suspected session compromise; any time the entire admin team needs to re-authenticate (e.g. after a security incident).

---

### Bootstrap Admin Recovery

If the first admin account is lost and no other ADMIN exists:

1. Set `BOOTSTRAP_ADMIN_EMAIL` in Railway's environment variables to the email of the new admin.
2. Run the seed script: `pnpm prisma db seed` (or trigger it via Railway's Run command on the app service).
3. The seed creates a fresh invite link and logs the URL to stdout. Copy the URL from Railway's deploy logs.
4. The invited user completes onboarding via the invite link.
5. Remove `BOOTSTRAP_ADMIN_EMAIL` from Railway's environment after first use.

**Note:** Re-running the seed against an existing database is safe — the seed is idempotent and only creates the invite if no ADMIN users exist.

---

## Environment Variables

All variables are validated by `lib/env.ts` at boot. A missing variable crashes the process before serving traffic.

See `src/resource/MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md` §15 for the full list and notes. Key production values:

| Variable | Where | Notes |
|----------|-------|-------|
| `NEXTAUTH_URL` | Railway admin service | `https://admin.mrqlive.co.uk` |
| `PUBLIC_BASE_URL` | Railway admin service | `https://mrqlive.co.uk` |
| `PARTICIPANT_HOST` | Railway admin service | `mrqlive.co.uk` |
| `ADMIN_HOST` | Railway admin service | `admin.mrqlive.co.uk` |
| `BOOTSTRAP_ADMIN_EMAIL` | Railway admin service | One-shot; remove after first deploy |

---

## Production Smoke Test

After each production deploy, run the following against `https://mrqlive.co.uk`:

1. Create a test activation in the admin console with status `LIVE`. The activation must have an `entryCodePrefix` set so an entry code is generated at verification time (steps 4 and 5 require it).
2. Register with a test email address via the participant landing page.
3. Retrieve the OTP from the Resend dashboard (or the test inbox) and verify.
4. **Confirm the post-verify confirmation email arrives in the test inbox.** The subject reads `Your entry code for <activation name>`. The body contains the entry code on its own line. Audit log: one `participant.verified` row + one `participant.confirmation_email_sent` row with `metadata.cause = "verify"` and a Resend `messageId`.
5. **Click "Resend" on the success page.** A second email arrives with the headline *"Here's your entry code again, as requested."* (the resend variant — single-line heading, no subheading). Audit log: a second `participant.confirmation_email_sent` row with `metadata.cause = "resend"`.
6. **Click Resend three more times.** The 4th attempt is rate-limited (per-`(activationId, emailHash)` cap is 3/hour). The button still optimistically reads "Sent!" but no email goes out. Audit log: a `participant.resend_rate_limited` row with `metadata.scope = "activation_email"`.
7. Confirm the `LiveCounter` on the dashboard increments to 1 verified.
8. Download the registrations CSV and confirm the test row is present.
9. Navigate to **Admin → Erasure** and erase the test email. Confirm the audit log entry.

This rehearses the full GDPR loop, the post-verify email send + resend flow, and the rate-limit / anti-enumeration audit trail. It confirms email delivery is working on production for both the OTP and the entry-code confirmation.

---

## Audit Actions Added by the Post-Verify Email Feature

Three new audit actions support the post-verify confirmation-email flow. Useful when investigating support tickets ("I never got my entry code", "I got two", "the resend button isn't working"):

| Action | Category | When written | `metadata` shape |
|---|---|---|---|
| `participant.confirmation_email_sent` | `ADMIN` | Resend accepted a send (verify-time OR on-demand resend) | `{ emailHash, resendMessageId, cause: "verify" \| "resend" }` |
| `participant.confirmation_email_failed` | `ADMIN` | Send failed after the in-line retry policy ran | `{ emailHash, reason: "rejected" \| "transient", attempts: 1 \| 2, cause: "verify" \| "resend", lastError? }` |
| `participant.resend_rate_limited` | `SECURITY` | The resend endpoint denied a request via either rate limit | `{ emailHash, scope: "ip" \| "activation_email" }` |

All three rows have `actorId: NULL` (system-initiated) and an `ipHash` from the request. The `_sent`/`_failed` rows target `Registration`; the `_rate_limited` row targets `Activation` (the registration may not exist on the rate-limit path).

### Investigating "I never got my email" tickets

1. Get the participant's `emailHash`: `SELECT "emailHash" FROM "Registration" WHERE email = '<plaintext>'` from the admin Postgres console (or use **Admin → Audit** with the email-hash printed in the participant's user-management view).
2. Search the audit log: `SELECT action, metadata, "createdAt" FROM "AuditLog" WHERE "metadata"->>'emailHash' = '<hash>' ORDER BY "createdAt" DESC LIMIT 20;`
3. Look for the most recent `participant.confirmation_email_sent` (success) or `_failed` row. If `_failed`, `metadata.reason` tells you whether it was rejected (4xx — bad domain, suppressed) or transient (5xx — Resend outage); `metadata.lastError` carries the truncated provider error.
4. Cross-reference the `metadata.resendMessageId` against the Resend dashboard for delivery status.

### Investigating rate-limit complaints

1. Same hash lookup as above.
2. `… WHERE action = 'participant.resend_rate_limited' AND "metadata"->>'emailHash' = '<hash>'` shows every denial with `metadata.scope` indicating which limiter fired (`ip` for blanket scraping; `activation_email` for the per-`(activationId, emailHash)` cap).

---

## HMAC Key Rotation

The four hashing keys — `EMAIL_HASH_HMAC_KEY`, `IP_HMAC_KEY`, `USER_AGENT_HMAC_KEY`, `OTP_HMAC_KEY` — and the four token-signing secrets — `PENDING_TOKEN_SECRET`, `INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY`, `PREVIEW_TOKEN_SECRET` — have independent rotation postures. **Do not rotate the email key casually**: it underpins the `(activationId, emailHash)` dedup invariant (§5.1) and the right-to-erasure-by-hash flow (§14.3). The IP / UA / OTP / token keys can be rotated freely.

### When to rotate

- **Routine:** every 12 months as part of the annual key-hygiene review.
- **Forced:** any time a key may have leaked (audit log dump exposed, env-var snapshot in an error report, ex-engineer with prod access).

### Rotation procedure — token-signing keys (low risk)

`PENDING_TOKEN_SECRET`, `INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY`, `PREVIEW_TOKEN_SECRET`, `OTP_HMAC_KEY`:

1. Generate a new key: `openssl rand -hex 32`.
2. In Railway, update the env var. Deploy.
3. Outstanding tokens issued under the old key will become invalid. For OTP / pending tokens this is fine (10-minute TTL — affected users just re-register). For invite / reset tokens (24h TTL), notify the team and re-send any pending invites the next day.

### Rotation procedure — IP / UA hash keys (medium risk)

`IP_HMAC_KEY`, `USER_AGENT_HMAC_KEY`:

1. Existing `ipHash` / `userAgentHash` values in `AuditLog` and `Registration` were computed with the old key — they remain valid as opaque correlation IDs for past data, but new writes will use the new key and won't match historical rows.
2. Generate a new key, update Railway, deploy.
3. Document the rotation timestamp in this runbook so future audit-log forensics know the discontinuity point.

### Rotation procedure — email hash key (high risk, manual data migration)

`EMAIL_HASH_HMAC_KEY`:

> ⚠️ Rotating this key without re-hashing breaks dedup and erasure. Do not rotate in production without scheduled downtime and a tested migration script.

1. Schedule a maintenance window — registrations must be paused (set all LIVE activations to PAUSED via admin UI).
2. Generate the new key but **do not** swap it in yet.
3. Write a one-shot script in `workers/` that reads every `Registration` row, recomputes `emailHash` from `email` using the new key (`HMAC-SHA256(new_key, lower(email))`, hex output), and writes it back inside a single transaction per row. The same script must update every `AuditLog.metadata->>'emailHash'` value where present — use the `(action, createdAt)` index to walk in time-ordered batches of 1000.
4. Run the script against a staging clone first. Verify row counts and a spot-check of erasure SQL (§14.3) still resolves rows after the migration.
5. In production: take a fresh DB snapshot, run the migration, swap the env var, re-deploy.
6. Re-enable activations.

### Audit-log row to write

After any rotation, write an audit row by hand from the admin Postgres console so future ops know it happened:

```sql
INSERT INTO "AuditLog" (id, category, action, "actorId", "targetType", "targetId", metadata, "createdAt")
VALUES (gen_random_uuid(), 'SECURITY', 'system.key_rotated', NULL, 'Env', NULL,
        jsonb_build_object('key', 'EMAIL_HASH_HMAC_KEY', 'reason', 'routine_12_month'),
        now());
```

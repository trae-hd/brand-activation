# MrQ Live Activation Platform (Lite) — Master Build Prompt (v1)

> **Purpose.** This document is a complete, self-contained prompt for building the MrQ Live Activation Platform — a single Next.js application deployed to Railway, serving a participant registration surface and an admin console gated by host-aware routing. Hand this to any capable AI coding assistant and it will produce a working application without requiring clarification. Read every section before writing a single line of code.
>
> **Relationship to the V3 prompt.** This is a deliberate, scoped simplification of `MRQ_LIVE_ACTIVATION_MASTER_PROMPT_V3.md`. The V3 document remains the reference for any feature deferred from Phase 1; this document is the single source of truth for what we are building now. Where they disagree, this document wins.
>
> **Framework.** **Next.js 16** (App Router). The middleware entry point is `proxy.ts` and exports a function named `proxy` — both file and export were renamed in Next.js 16. Next.js 16 also makes request APIs (`params`, `searchParams`, `cookies()`, `headers()`) asynchronous — pages and route handlers must `await` these. See §18 for the migration gotchas.
>
> **Build proceeds in eight phases (§17).** Each phase has a pre-flight checklist, a scoped implementation list, a verification checklist, an effort estimate, and an explicit checkpoint gate. **Stop at every checkpoint. Do not proceed without human approval.** Phase N+1 begins only on receipt of `Phase [N] approved — begin Phase [N+1]`.
>
> **Explicit simplifications versus V3.** No separate worker process; OTP email sends synchronously via Resend. No BullMQ. No PgBouncer. No AES-GCM email encryption at rest in Phase 1 (deferred to Phase 2 — see §14). No 5-tier capability matrix; ADMIN and MEMBER only. No PagerDuty / Slack alert matrix; Sentry-only observability. No pre-warm or scheduler reconciliation. No token-bucket rate limiter; a simple Redis fixed-window limiter. No suppression list table; Resend's own suppression handling is sufficient. No DSAR / erasure UI pages; the procedure is documented and run manually against the database. Phase 1 banner system is dropped.

---

## 1. System Instructions & Behavioural Rules

You are a senior full-stack engineer with deep Next.js (App Router), TypeScript, Prisma, NextAuth, Tailwind v4, Tiptap, and Redis experience, building a customer-facing product that handles real PII at marketing-event scale. Follow these rules without exception:

- **Authority order.** When unsure, re-read the spec rather than improvising. The constitution wins over the source spec; the spec wins over training-data intuition. The "constitution" is this document; the "source spec" is the V3 prompt where it covers a topic this document defers to. If a decision is not covered anywhere, surface it as a question. Do not pick a default.
- **Stop at every checkpoint.** After completing a phase, summarise what was built, walk through the verification checklist, and wait for explicit human approval phrased exactly as `Phase [N] approved — begin Phase [N+1]`. Any other input from the user is feedback on the current phase, not approval to advance.
- **British English in app code, user copy, comments, and audit messages.** `colour` not `color`, `behaviour` not `behavior`. **Exception:** platform identifiers and library APIs are kept verbatim — CSS keywords (`color`), React props, and other foreign tokens are used as the platform defines them.
- **TypeScript strict mode. No `any`. No `@ts-ignore`. No `@ts-expect-error` without an inline rationale and a tracking comment.** Discriminated unions and exhaustive `switch` for state-machine code (activation status, registration status, role checks).
- **All Route Handler inputs validated with Zod at the route boundary.** All tRPC procedure inputs validated with Zod via `.input(...)`. Validation failures return a structured error response and are logged.
- **No direct `process.env` access in application code.** All environment variables flow through the Zod-validated `lib/env.ts`. Adding a new env var requires updating `lib/env.ts`, `.env.example`, and the env table in §15 — in the same change. **Bootstrap exception:** `prisma/seed.ts` and `app/instrumentation.ts` read `process.env` directly because they execute before `lib/env.ts` is importable. These two files are the only permitted exception.
- **No barrel files.** Import from the file that defines the symbol, not from an `index.ts` re-export.
- **Server components by default.** Use React Server Components for all pages and layouts. Only mark a component `'use client'` when it needs state, effects, refs, browser APIs, or event handlers.
- **`proxy.ts` exports a function named `proxy`.** Next.js 16 renamed both the middleware file (`middleware.ts` → `proxy.ts`) and the exported function (`middleware` → `proxy`). The export is `export function proxy(req: NextRequest)`. Using the old `middleware` name will silently not run.
- **NextAuth callbacks require TypeScript module augmentation.** `types/next-auth.d.ts` extends `JWT` with `adminUserId`, `role`, and `active`, and extends `Session.user` similarly. Without this file, the `jwt`/`session` callbacks in §7.1 do not typecheck under strict mode and the agent will reach for `as any`. See §7.1.
- **No `fetch` defaults — explicit cache control.** Every `fetch` call must specify `cache` or `next.revalidate` explicitly. Server components that read activations from Postgres do so via `unstable_cache` with explicit `revalidate` and activation-scoped `tags`.
- **Tailwind v4: no `tailwind.config.ts` theme extension.** Design tokens belong in `globals.css` under `@theme inline` (§3.3). Never add `theme.extend`, `theme.colors`, or font definitions to `tailwind.config.ts` — its only role is content paths and plugins. AI agents have a strong training bias toward v3 patterns; resist it.
- **PII handling.** Never log raw email, IP, or user-agent. `emailHash`, `ipHash`, `userAgentHash` only. Never include PII in error messages returned to participants. The `email` column on `Registration` stores plaintext for now (encryption deferred to Phase 2 — see §14.0); compensating controls are strict DB access (Railway role separation) plus tiered retention purges.
- **Time is UTC at rest, Europe/London at the boundary.** All `DateTime` columns store UTC. All admin and participant displays are Europe/London (BST/GMT). Conversion happens at render, never in the database.
- **Migrations are reviewed before generation.** Run `prisma migrate dev --create-only` first; review the generated SQL; then apply. Never run `prisma migrate dev` or `prisma db push` against a database with real data.
- **The Tiptap node/mark allowlist is governed code, not configuration (§9.2).** Adding new block types requires a code change. The same Tiptap instance powers the activation **content** field (loose allowlist) and the **consent notice** field (tighter allowlist). Use the right one for each.
- **Redis is a hard dependency.** OTP storage, rate limiting, and the registration pending-token cache all require Redis. If Redis is unavailable, the participant flow halts and surfaces a maintenance state via a centralised `withRedisHealth` wrapper that short-circuits to a 503 before any validation or query work happens (§8.8). Do not implement a silent in-process fallback.
- **Per-IP rate limit is global. Per-email is per-activation.** A per-IP limit scoped to a single activation lets an attacker spread across activations to bypass the limit. The IP key in Redis does not include `activationId`. The email-hash key does.
- **Never leak registration status via response shape.** `/api/register` responds identically for fresh registrations, already-verified registrations, and resends: `202 { pendingToken }`. `/api/verify` returns identical "code accepted or wrong" shapes regardless of underlying registration state. Branching the response on internal state creates an enumeration oracle (§8.6).
- **Constant-time HMAC comparison.** OTP verification uses `crypto.timingSafeEqual` on equal-length buffers, never string equality. Buffer-length parity must be verified before the comparison call (§8.7).
- **Email sending is synchronous in Phase 1.** The Resend call happens inside the request lifecycle of `/api/register`, with a 5-second timeout and one retry. If both attempts fail, the registration row is rolled back and the response is 503. There is no queue. See §10.
- **Output format expectations.** When asked to produce code, produce full files (not diffs unless explicitly requested), commit-ready, with real imports, real type names, no `<...>` placeholders. Half-handlers are worse than none — they imply the rest is "obvious."

---

## 2. Project Context

### 2.1 Core Concepts

Participants scan a QR code at a booth, land on a per-activation registration page, enter their email, accept the consent notice, receive a six-digit OTP by email, verify, and are recorded as registered against that activation. Registrations feed downstream marketing systems (out of scope for Phase 1 — exposed via CSV export only).

**Glossary:**

- **Activation** — a public-facing event landing page tied to a real-world marketing activation at a venue. Has a slug, dates, a designed landing page (Tiptap content), a consent notice, and a list of booths.
- **Booth** — a physical QR-code-bearing scan point at the venue. Each booth has a `code` (used as a UTM-like attribution parameter on the landing URL).
- **Registration** — a participant's record of intent to register against an activation. Goes through `PENDING → VERIFIED` (or `PENDING → EXPIRED` if the OTP isn't entered in time).
- **Consent notice** — the privacy / data-use copy a participant must explicitly accept before submitting their email. Stored on the Activation, versioned by content hash; the version is snapshotted onto each Registration so we have evidence of what was accepted.
- **Pending token** — an opaque, signed token returned by `/api/register` and required by `/api/verify`. Carries the registration ID; never the email.

**The activation lifecycle:**

```
DRAFT → SCHEDULED → LIVE → ENDED
```

- `DRAFT`: editable; not visible on the public host.
- `SCHEDULED`: locked from edit (with ADMIN-only typed-phrase override); visible behind a "not yet open" state if a participant lands early.
- `LIVE`: registrations accepted; counter increments visible on dashboard.
- `ENDED`: registrations refused with a "this event has ended" state; data retained per §14.

The transition `DRAFT → SCHEDULED` is gated by `legalApproved` (an ADMIN-only flag set after the consent notice has been reviewed). Reverse transitions (`SCHEDULED → DRAFT`, `LIVE → SCHEDULED`, `ENDED → LIVE`, `ENDED → SCHEDULED`) are ADMIN-only with typed-phrase confirmation and a mandatory free-text reason — see §9.5.

**Two surfaces, one app, gated by host:**

- **Participant** (`https://mrqlive.co.uk/<activation-slug>?booth=<code>&utm_*`): anonymous, mobile-first, no admin chrome.
- **Admin** (`https://admin.mrqlive.co.uk/`): Google Workspace SSO, desktop-first.

### 2.2 In Scope

- Single Next.js (App Router) application, deployed to Railway.
- Participant flow: landing, register (email + consent), verify (six-digit OTP), success / expired / ended states, mobile autofill, graceful loss-of-connection.
- Admin console: activation builder with Tiptap (constrained schema for both content and consent notice), activation list, dashboard with live counter per activation, registrations table with CSV export, audit log viewer, user management.
- Auth: Google Workspace SSO and email + password (both gated by `@mrq.com` domain) via NextAuth; ADMIN and MEMBER roles only (§7.2). Invite-only provisioning (§7.7).
- Email: Resend, called synchronously from `/api/register` and from the invite/reset flows, behind a thin provider interface so Postmark can be swapped in later.
- OTP storage: Redis with TTL — no `OtpAttempt` table.
- Rate limiting: Redis fixed-window per IP and per email-hash + activation; same primitive applied to forgot-password.
- Observability: Sentry for error tracking; structured `console.log` for everything else.
- **Compliance UI:** ADMIN-only Data Subject Access Request (DSAR) and right-to-erasure pages (§14.2 / §14.3). Both run via dedicated tRPC procedures with full audit trails.
- QR code generation: per-booth PNG download from the activation page; no separate QR service.

### 2.3 Out of Scope (Phase 1)

- AES-GCM email encryption at rest, key versioning, key rotation runbook (deferred to Phase 2 — see §14.0).
- Capability matrix beyond ADMIN / MEMBER (no TECH_LEAD, SUPER_ADMIN, CAMPAIGN_MANAGER, COMPLIANCE roles).
- BullMQ, separate worker process, Redis as a queue.
- PgBouncer; Railway's managed Postgres connection pooling is sufficient at this scale.
- PagerDuty, Slack alert matrix, full §13 alert table from V3.
- Pre-warm jobs, scheduler reconciliation, capacity-aware circuit breakers.
- Suppression list table (Resend handles its own bounce/complaint suppression for Phase 1).
- Postmark migration (interface ready; switch is a follow-up).
- Service worker / IndexedDB / installable PWA (graceful offline only — see §8.5).
- Read replica.
- Custom HTML block in Tiptap, mobile-first admin layout, A/B testing, i18n, SMS OTP, cross-activation analytics, participant session tokens, Phase 2 prize-draw integration, Phase 1 banner system.

### 2.4 Architectural Posture

- **Next.js App Router**, deployed as a single service. Both surfaces live in the same app; the host header gates which paths are reachable.
- **Participant surface uses Route Handlers** (`app/api/.../route.ts`). Anonymous, Zod-validated, structured error responses. tRPC is forbidden in the participant surface.
- **Admin surface uses tRPC** — typed end-to-end, capability-aware procedures, matches hq-mono convention. Even though we have only two roles, the tRPC procedure shape is identical to hq-mono's so a future merge is mechanical.
- **Postgres** — durable state (`Activation`, `Booth`, `Registration`, `AdminUser`, `AuditLog`).
- **Redis** — ephemeral state (OTP storage with TTL, rate-limit counters, pending tokens for register→verify hop).
- **Email synchronous in-route** — no queue. See §10 for the rationale and the migration path to a queue.

### 2.5 Railway Service Count

Three Railway resources: `activation-app` (Next.js) plus two managed add-ons, `postgres` and `redis`. No worker. No PgBouncer. See §3.1.

---

## 3. Structural Architecture

### 3.1 Railway Topology

```
Railway Project: mrq-live-activation
  ├── activation-app    (Next.js 16, App Router)
  ├── postgres          (managed add-on)
  └── redis             (managed add-on)
```

App connects to Postgres via Railway's `DATABASE_URL`. App connects to Redis via Railway's `REDIS_URL`. All inter-service traffic is on Railway private DNS.

Sentry is an external service (`SENTRY_DSN` env var); Resend is an external service (`RESEND_API_KEY`).

### 3.2 Application Folder Structure

The structure below uses **route groups for organisation only** — `(participant)` and `(admin)` exist purely to give each surface its own layout file. URL paths inside the groups are real. There are no path rewrites in `proxy.ts`.

```
mrq-live-activation/
├── app/
│   ├── (participant)/
│   │   ├── layout.tsx                           # No admin chrome
│   │   ├── [activationSlug]/
│   │   │   ├── page.tsx                         # URL: /<slug>
│   │   │   ├── verify/page.tsx                  # URL: /<slug>/verify
│   │   │   ├── success/page.tsx                 # URL: /<slug>/success
│   │   │   ├── expired/page.tsx
│   │   │   └── ended/page.tsx
│   │   └── error.tsx
│   ├── (admin)/
│   │   ├── layout.tsx                           # Admin chrome, sidebar, role-aware nav
│   │   ├── page.tsx                             # URL: /              (activation list)
│   │   ├── activations/
│   │   │   ├── new/page.tsx                     # URL: /activations/new
│   │   │   └── [id]/edit/page.tsx               # URL: /activations/:id/edit
│   │   ├── dashboard/
│   │   │   └── [activationId]/page.tsx          # URL: /dashboard/:activationId
│   │   ├── admin/
│   │   │   ├── audit/page.tsx                   # URL: /admin/audit
│   │   │   ├── users/page.tsx                   # URL: /admin/users
│   │   │   ├── users/[id]/page.tsx              # URL: /admin/users/:id  (re-invite, send reset, deactivate)
│   │   │   ├── dsar/page.tsx                    # URL: /admin/dsar       (§14.2)
│   │   │   └── erasure/page.tsx                 # URL: /admin/erasure    (§14.3)
│   │   ├── auth/
│   │   │   ├── signin/page.tsx                  # URL: /auth/signin       (Google + password tabs)
│   │   │   ├── forgot-password/page.tsx         # URL: /auth/forgot-password
│   │   │   └── set-password/page.tsx            # URL: /auth/set-password (invite + reset, §7.7.5)
│   │   └── error.tsx
│   ├── api/
│   │   ├── register/route.ts                    # POST, participant
│   │   ├── verify/route.ts                      # POST, participant
│   │   ├── auth/[...nextauth]/route.ts          # NextAuth handler
│   │   ├── trpc/[trpc]/route.ts                 # Admin tRPC handler
│   │   ├── admin/registrations/export/route.ts  # Admin CSV export, streaming (§9.7.1)
│   │   ├── admin/dsar/export/route.ts           # DSAR CSV export, streaming (§14.2)
│   │   └── health/route.ts                      # GET, public, returns 200
│   └── globals.css                              # @theme inline tokens (§3.3)
├── components/
│   ├── ui/                                      # shadcn primitives + DynamicIcon
│   ├── participant/
│   │   ├── RegistrationForm.tsx
│   │   ├── ConsentBlock.tsx
│   │   └── OtpInput.tsx
│   ├── admin/
│   │   ├── ActivationForm.tsx
│   │   ├── TiptapEditor.tsx                     # Shared editor; allowlist passed in
│   │   ├── RegistrationsTable.tsx
│   │   ├── LiveCounter.tsx
│   │   └── RequireRole.tsx                      # Two-role guard component
│   └── shared/
│       └── BoothQrButton.tsx                    # Per-booth QR PNG download
├── lib/
│   ├── env.ts                                   # Zod-validated env (§15)
│   ├── db/
│   │   └── prisma.ts                            # Singleton Prisma client
│   ├── redis/
│   │   ├── client.ts                            # Singleton ioredis client
│   │   └── health.ts                            # withRedisHealth wrapper (§8.8)
│   ├── crypto/
│   │   └── hmac.ts                              # HMAC-SHA256 helpers (emailHash, ipHash, otpHash)
│   ├── otp/
│   │   ├── issue.ts                             # generateOtp + storeOtp (Redis SET EX)
│   │   └── verify.ts                            # consumeOtp (Redis GETDEL + timingSafeEqual)
│   ├── rateLimit/
│   │   └── fixedWindow.ts                       # Redis INCR/EXPIRE limiter
│   ├── email/
│   │   ├── provider.ts                          # EmailProvider interface (sendOtp + sendInvite + sendPasswordReset)
│   │   ├── resend.ts                            # Resend implementation
│   │   └── templates/
│   │       ├── otpEmail.ts
│   │       ├── inviteEmail.ts
│   │       └── passwordResetEmail.ts
│   ├── audit/
│   │   └── writeAuditLog.ts                     # Accepts optional tx
│   ├── tiptap/
│   │   ├── allowlists.ts                        # Content vs consent allowlists
│   │   └── validate.ts                          # Server-side schema validator
│   ├── auth/
│   │   ├── options.ts                           # NextAuth config (Google + CredentialsProvider)
│   │   ├── requireRole.ts                       # Server-side role check helper
│   │   ├── tokens.ts                            # mintRawToken, hashToken (§7.7.1)
│   │   └── password.ts                          # bcrypt hash/verify, strength check
│   └── time/
│       └── london.ts                            # UTC ↔ Europe/London helpers
├── server/
│   └── trpc/
│       ├── init.ts                              # tRPC initialisation, context shape
│       ├── procedures.ts                        # adminProcedure / memberProcedure
│       ├── routers/
│       │   ├── activation.ts
│       │   ├── booth.ts
│       │   ├── registration.ts
│       │   ├── audit.ts
│       │   ├── user.ts                          # invite, list, deactivate, resetIssuedByAdmin
│       │   ├── auth.ts                          # validateInvite, consumeInvite, requestPasswordReset, validateReset, consumePasswordReset
│       │   └── compliance.ts                    # dsar.preview, dsar.fulfil, erasure.preview, erasure.fulfil
│       └── root.ts                              # appRouter
├── workers/
│   └── retentionPurge.ts                        # Invoked by Railway cron (not a long-lived process)
├── types/
│   └── next-auth.d.ts                           # JWT/Session augmentation
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── proxy.ts                                     # Next.js 16 host-aware gate
├── tailwind.config.ts                           # Content paths + plugins ONLY
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

A note on `workers/retentionPurge.ts`: this is **not** a long-lived process. It is a one-shot script invoked by Railway's cron scheduler (see §14.1). It connects to Postgres, runs the purge, exits. Phase 1 has no long-lived worker.

### 3.3 Tailwind v4 CSS Configuration

Design tokens live in `app/globals.css` under `@theme inline` blocks. `tailwind.config.ts` contains only content paths and plugins.

```css
/* app/globals.css */
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);

  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.45 0 0);
  --color-primary: oklch(0.55 0.18 270);
  --color-primary-foreground: oklch(0.99 0 0);
  --color-destructive: oklch(0.55 0.22 25);
  --color-destructive-foreground: oklch(0.99 0 0);
  --color-border: oklch(0.92 0 0);
  --color-ring: oklch(0.55 0.18 270);

  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  @theme inline {
    --color-background: oklch(0.12 0 0);
    --color-foreground: oklch(0.95 0 0);
    --color-muted: oklch(0.20 0 0);
    --color-muted-foreground: oklch(0.65 0 0);
    --color-border: oklch(0.25 0 0);
  }
}

html, body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}
```

`tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  plugins: [],
};

export default config;
```

**No `theme.extend`. No `theme.colors`. No `theme.fontFamily`.** Every token belongs in `globals.css`.

### 3.4 Component Library Conventions

- **shadcn/ui** as the primitive layer for both surfaces. Install via `pnpm dlx shadcn@latest add <component>`. Components land in `components/ui/`. We do NOT import from `@radix-ui/*` directly; everything goes through shadcn's wrapper so we control the styling surface.
- **`DynamicIcon`** is the only icon entry point. Direct `lucide-react` imports are forbidden in feature code. The component lives at `components/ui/DynamicIcon.tsx` and accepts a `name` prop.
- **Naming.** PascalCase for components. File name matches the default export (`RegistrationForm.tsx` exports `RegistrationForm`). One component per file.
- **Server vs client.** Components default to server. The `'use client'` directive is added only when state, effects, refs, browser APIs, or event handlers are needed. Form submission uses Server Actions (admin) or fetch-to-Route-Handler (participant).

### 3.5 Future-Portability Conventions

This service lives in its own repository (`mrq-live-activation`). It is **not** part of `hq-mono`. However, it follows hq-mono's conventions so that, if a future relocation is desired, the lift is mechanical:

- All shared imports use stable, relative paths (`@/lib/...`) via the `tsconfig.json` `paths` map. Replacing `@/` with `@workspace/<package>/` is a single sed.
- The tRPC setup mirrors hq-mono's `@workspace/trpc` shape so router files can be lifted directly.
- Tailwind tokens in `globals.css` use the same OKLCH palette names as hq-mono's `@workspace/ui` package.

This is a non-goal for Phase 1; relocate only when there's a concrete reason.

### 3.6 Redis-Backed Rate Limiting

The fixed-window rate limiter sits at the infrastructure layer because it's used by both participant Route Handlers (§8.6, §8.7) and is the model for any future admin-side limiter we add. The Redis client and health wrapper themselves are documented in §8.8 alongside the participant-flow handlers that invoke them.

The implementation is **a single Lua script**, not the apparently-equivalent two-call `INCR` + `EXPIRE` pattern. The two-call version has a real failure mode: if the worker dies between `INCR` and `EXPIRE` on the first request of a window, the key never expires and the limit becomes permanent for that key. The bug surfaces hours later as "users can't register from $carrier-CGNAT-IP" with no obvious cause.

```ts
// lib/rateLimit/fixedWindow.ts
import { redis } from "@/lib/redis/client";

/**
 * Atomic fixed-window counter. Uses a Lua script so INCR + EXPIRE happen as
 * one Redis operation — never use two separate calls; on a worker crash
 * between them, the key has no TTL and the limit becomes permanent.
 *
 * Returns true if the request is within the limit, false if it exceeds it.
 */
const SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

interface Args {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function fixedWindow({ key, limit, windowSeconds }: Args): Promise<boolean> {
  const current = (await redis.eval(SCRIPT, 1, key, String(windowSeconds))) as number;
  return current <= limit;
}
```

`eval` ships the script every call. At our request volume the overhead is negligible. If a future profile shows it's significant, switch to `evalsha` with a one-time `SCRIPT LOAD` at process boot.

**Keying conventions** (cross-reference, not duplicate, of §1):

- Per-IP keys are **global** — `rl:ip:register:<ipHash>`, no `activationId` segment. An attacker spreading across activations should not bypass the limit.
- Per-email keys are **per-activation** — `rl:email:register:<activationId>:<emailHash>`. A participant who legitimately registers for multiple activations from the same email is not punished.
- Per-token keys (verify) are **per-pendingToken** — `rl:tok:verify:<pendingToken>`. Sharing blast radius across tokens is the bug we're avoiding.

---

## 4. Prerequisites & Pre-Build Gates

### 4.1 Procurement Gates (build does not commence until satisfied)

| Item | Owner | Notes |
|------|-------|-------|
| Railway project provisioned with `activation-app`, `postgres`, `redis` | Tech Lead | Three resources; no worker, no PgBouncer |
| Domains: `mrqlive.co.uk` and `admin.mrqlive.co.uk` resolve to the Railway service | Ops | Both CNAMEs to the same `activation-app` instance |
| Google Workspace OAuth client (production + staging) | Tech Lead + Workspace admin | Authorised redirect URI: `https://admin.mrqlive.co.uk/api/auth/callback/google` |
| Resend account, sending domain verified, API key issued | Brand Ops | Sending domain is `mrqlive.co.uk`; from-address is `noreply@mrqlive.co.uk` |
| Sentry project created, DSN issued (optional in Phase 1) | Tech Lead | If absent, Sentry is skipped — see §13 |

### 4.2 Local Development Prerequisites

- Node 20.9+ (LTS). `.nvmrc` pins this.
- pnpm 9+.
- A local Postgres (Docker is fine: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).
- A local Redis (Docker: `docker run -p 6379:6379 redis:7`).

### 4.3 Tooling Expectations

- Prisma CLI (installed transitively via `prisma` dev dependency).
- Vitest (unit tests).
- Playwright (smoke test for the registration → verify flow in Phase 6).

### 4.4 Initial Repo Setup Verification

On a fresh clone, the following must pass:

```sh
pnpm install
cp .env.example .env.local              # Then fill in real values
pnpm prisma migrate dev                  # Applies migrations to local Postgres
pnpm prisma db seed                      # Seeds bootstrap admin
pnpm typecheck
pnpm lint
pnpm test                                # Vitest unit suite
pnpm dev                                 # Boots Next.js
```

`pnpm typecheck` and `pnpm lint` must be CI-green before any phase is marked complete.

### 4.5 Library Version Pinning

`package.json` dependencies must use caret-pinned majors — never `latest`, never `*`, never `>=`. Several majors have breaking surface that would silently miscompile against this document. The non-obvious one is NextAuth: this build uses **NextAuth v4** (the `authOptions` shape, `getServerSession` import, `jwt`/`session` callback signatures all changed in v5/Auth.js). An agent running `pnpm add next-auth` without a version specifier gets v5 and the §7.1 code does not compile.

| Package | Pin | Why this matters here |
|---------|-----|------------------------|
| `next` | `^16.0.0` | App Router, `proxy.ts` rename (§8.1), async `params`/`searchParams` (§18) |
| `next-auth` | `^4.24.0` | **v5 (Auth.js) breaks the `authOptions` shape used in §7.1** — load-bearing |
| `@prisma/client` and `prisma` | `^6.0.0` | Stable client API; matches features used in §5 |
| `@trpc/server`, `@trpc/client`, `@trpc/react-query` | `^11.0.0` | `unstable_pipe` middleware composition used in §6.2 |
| `@tanstack/react-query` | `^5.0.0` | tRPC v11 peer |
| `@tiptap/core`, `@tiptap/react`, extensions | `^2.0.0` | Allowlist shape (`nodes`/`marks`/`attrs`) used in §9.2 |
| `zod` | `^3.23.0` | `.transform`, `.safeParse`, `.flatten` shapes used throughout |
| `ioredis` | `^5.4.0` | `HSET` object form, `enableOfflineQueue: false` semantics (§8.8, §18) |
| `resend` | `^4.0.0` | Current major; `signal` typing referenced in §10.2 |
| `qrcode` | `^1.5.0` | `toBuffer`, `errorCorrectionLevel: "Q"` (§12) |
| `bcryptjs` | `^2.4.3` | Password hashing for the credentials provider (§7.1, §7.7) |
| `superjson` | `^2.2.0` | tRPC transformer used in §6.2 |
| `@sentry/nextjs` | `^8.0.0` | `instrumentation.ts` register hook used in §13.1 |

Dev dependencies follow the same rule. `vitest`, `playwright`, `tsx`, `eslint`, and `prettier` are pinned to their current majors. Renovate / Dependabot is configured to surface major bumps as PRs, never auto-merge.

---

## 5. Prisma Schema & Database

### 5.1 Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ActivationStatus {
  DRAFT
  SCHEDULED
  LIVE
  ENDED
}

enum AdminRole {
  ADMIN
  MEMBER
}

enum RegistrationStatus {
  PENDING
  VERIFIED
  EXPIRED
}

enum AuditCategory {
  ADMIN
  SECURITY
}

model Activation {
  id                  String           @id @default(cuid())
  slug                String           @unique
  name                String
  status              ActivationStatus @default(DRAFT)

  startsAt            DateTime
  endsAt              DateTime

  /// Tiptap ProseMirror tree for the landing page (loose allowlist — see §9.2).
  content             Json
  /// Tiptap ProseMirror tree for the consent / privacy notice (tight allowlist — see §9.2).
  consentNotice       Json
  /// SHA-256 of the canonicalised consentNotice JSON. Recomputed on every save.
  /// Snapshotted onto Registration.consentVersion so we have evidence of what
  /// the participant agreed to even if the notice is later edited.
  consentVersion      String

  /// Optional: hex colour for the landing page primary accent (e.g. "#FF3366").
  primaryColor        String?
  /// Optional: URL of a hero image for the landing page.
  heroImageUrl        String?

  legalApproved       Boolean          @default(false)
  legalApprovedAt     DateTime?
  legalApprovedBy     AdminUser?       @relation("LegalApprover", fields: [legalApprovedById], references: [id])
  legalApprovedById   String?
  legalApprovalNotes  String?

  createdAt           DateTime         @default(now())
  createdBy           AdminUser        @relation("ActivationCreator", fields: [createdById], references: [id])
  createdById         String
  updatedAt           DateTime         @updatedAt

  registrations       Registration[]
  booths              Booth[]

  @@index([status, startsAt])
  @@index([slug])
}

model Booth {
  id            String       @id @default(cuid())
  activation    Activation   @relation(fields: [activationId], references: [id], onDelete: Cascade)
  activationId  String
  code          String
  label         String
  createdAt     DateTime     @default(now())

  @@unique([activationId, code])
}

model Registration {
  id                String             @id @default(cuid())
  activation        Activation         @relation(fields: [activationId], references: [id])
  activationId      String

  /// Plaintext email. Encryption at rest is deferred to Phase 2 (§14.0).
  email             String
  /// HMAC-SHA256(email_lowercased) using EMAIL_HASH_HMAC_KEY (non-rotating in
  /// Phase 1). Used for dedup uniqueness and for audit-log references that
  /// must not contain raw email.
  emailHash         String

  status            RegistrationStatus @default(PENDING)
  boothCode         String?
  utmSource         String?
  utmMedium         String?
  utmCampaign       String?

  ipHash            String   // HMAC-SHA256(ip)
  userAgentHash     String   // HMAC-SHA256(user-agent)

  /// SHA-256 of the consent notice content the participant accepted. Always
  /// equals the Activation.consentVersion at the moment of registration.
  consentVersion    String
  consentAcceptedAt DateTime

  registeredAt      DateTime           @default(now())
  verifiedAt        DateTime?

  @@unique([activationId, emailHash])
  @@index([activationId, status])
  @@index([registeredAt])
  @@index([emailHash])
}

model AuditLog {
  id          String         @id @default(cuid())
  category    AuditCategory
  action      String
  actor       AdminUser?     @relation("AuditActor", fields: [actorId], references: [id])
  actorId     String?
  targetType  String?
  targetId    String?
  metadata    Json?          // Structured detail; never raw PII
  ipHash      String?
  createdAt   DateTime       @default(now())

  @@index([category, createdAt])
  @@index([actorId, createdAt])
  @@index([targetType, targetId])
}

model AdminUser {
  id            String      @id @default(cuid())
  email         String      @unique
  name          String
  role          AdminRole
  active        Boolean     @default(true)

  /// bcrypt hash, cost 12. Null until either (a) an invite token is consumed
  /// and the user sets their initial password, or (b) the row was created
  /// without password capability (Google-SSO-only access). Google SSO
  /// sign-ins do NOT populate this column. A non-null passwordHash and SSO
  /// access are not mutually exclusive — see §7.0.
  passwordHash  String?

  createdAt     DateTime    @default(now())
  lastLoginAt   DateTime?

  activationsCreated         Activation[] @relation("ActivationCreator")
  activationsLegalApproved   Activation[] @relation("LegalApprover")
  auditLogsAuthored          AuditLog[]   @relation("AuditActor")
  invitesIssued              AdminInvite[]         @relation("InviteIssuer")
  invitesReceived            AdminInvite[]         @relation("InviteSubject")
  passwordResetsIssued       PasswordResetToken[]  @relation("ResetIssuer")
  passwordResetsReceived     PasswordResetToken[]  @relation("ResetSubject")

  @@index([role, active])
}

/// One row per invitation. The invitation creates the AdminUser row up-front
/// (with passwordHash = null) so the role and identity are committed; the
/// invite link's only job is to attach a password. Distinct from
/// PasswordResetToken because the audit story differs: "invite consumed"
/// means an account was first provisioned; "reset consumed" means an
/// existing account recovered access.
model AdminInvite {
  id          String     @id @default(cuid())

  /// HMAC-SHA256(rawToken) using INVITE_TOKEN_HMAC_KEY. The raw token is
  /// emailed to the subject and never stored. Lookup hashes the submitted
  /// token and joins on this column.
  tokenHash   String     @unique

  subject     AdminUser  @relation("InviteSubject", fields: [subjectId], references: [id], onDelete: Cascade)
  subjectId   String

  /// The ADMIN who issued the invite.
  issuer      AdminUser  @relation("InviteIssuer", fields: [issuerId], references: [id])
  issuerId    String

  expiresAt   DateTime
  consumedAt  DateTime?

  createdAt   DateTime   @default(now())

  @@index([subjectId, consumedAt])
  @@index([expiresAt])
}

/// One row per password-reset request. May be self-service (issuerId =
/// subjectId) or admin-issued on behalf of a locked-out user (issuerId =
/// the issuing ADMIN). Distinct from AdminInvite — see model comment above.
model PasswordResetToken {
  id          String     @id @default(cuid())

  /// HMAC-SHA256(rawToken) using RESET_TOKEN_HMAC_KEY. Note this is a
  /// different key from AdminInvite.tokenHash — token-class separation
  /// prevents an invite token from ever being mistakenly accepted as a
  /// reset (or vice versa) at the lookup layer.
  tokenHash   String     @unique

  subject     AdminUser  @relation("ResetSubject", fields: [subjectId], references: [id], onDelete: Cascade)
  subjectId   String

  /// The actor who issued the reset. For self-service forgot-password,
  /// equals subjectId. For admin-issued, the ADMIN's id.
  issuer      AdminUser  @relation("ResetIssuer", fields: [issuerId], references: [id])
  issuerId    String

  expiresAt   DateTime
  consumedAt  DateTime?

  createdAt   DateTime   @default(now())

  @@index([subjectId, consumedAt])
  @@index([expiresAt])
}
```

**Models removed versus V3 schema:**

- `OtpAttempt` — OTP state lives in Redis with TTL. See §8.7.
- `EncryptionKeyVersion` — no key rotation in Phase 1. Plain emails + non-rotating HMAC key. See §14.0.
- `SuppressionListEntry` — Resend handles its own bounce/complaint suppression. The provider interface in §10 leaves room for re-adding this later if we move away from Resend.

**Models and fields added for password-based admin login (§7):**

- `AdminUser.passwordHash` — bcrypt hash, nullable.
- `AdminInvite` — one row per invitation; consumed when the invitee sets a password.
- `PasswordResetToken` — one row per reset request; consumed when the user picks a new password.

The two token tables are deliberately separate rather than a single `PasswordSetToken` with a `purpose` enum. The audit story distinguishes "an account was first provisioned" (invite consumed) from "an existing account recovered access" (reset consumed); the schema mirrors that. They also use **different HMAC keys** (`INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY`) so a token of one class cannot be accepted as the other at the lookup layer.

**Fields removed versus V3:**

- `Activation.prewarmAt` — no pre-warm in Phase 1.
- `Activation.expectedPeakPerFiveMinutes` — no circuit breaker in Phase 1.
- `Registration.emailEncrypted`, `emailKeyVersion` — see above; `email` (plaintext) replaces them for now.

### 5.2 Indexes & Query Patterns

The following query patterns are hot and must be supported by the indexes shown:

| Query | Path | Index |
|-------|------|-------|
| Lookup activation by slug (every participant page load) | `prisma.activation.findUnique({ where: { slug } })` | `@unique` on `slug` |
| List active activations on admin home | `where: { status: { in: ["SCHEDULED", "LIVE"] } }` order by `startsAt` | `@@index([status, startsAt])` |
| Dedup-check on register | `where: { activationId_emailHash: { activationId, emailHash } }` | `@@unique([activationId, emailHash])` |
| Live counter for an activation | `count where: { activationId, status: "VERIFIED" }` | `@@index([activationId, status])` |
| Audit log filter by actor | `where: { actorId } orderBy: createdAt desc` | `@@index([actorId, createdAt])` |

### 5.3 Soft Delete vs Hard Delete

Phase 1 uses hard deletes throughout. The `onDelete: Cascade` on `Booth.activation` is the only cascade. `Registration` does not cascade from `Activation` deletion — deleting an activation with registrations is forbidden by an `adminProcedure` guard (§9.5), not by the schema. This is deliberate: cascading registration deletion would silently drop audit trails.

### 5.4 Migrations

- Local: `pnpm prisma migrate dev --create-only` → review the generated SQL → `pnpm prisma migrate dev` to apply.
- Railway: the production deploy command runs `pnpm prisma migrate deploy` before booting the Next.js server. Configured in Railway's "deploy" command, not in the start script (so a failed migration prevents a bad deploy).

### 5.5 Connection Pooling

Railway's managed Postgres handles connection pooling at the platform level. `lib/db/prisma.ts` instantiates a single `PrismaClient`. No `directUrl`, no PgBouncer config.

```ts
// lib/db/prisma.ts
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 5.6 Seed

`prisma/seed.ts` creates the bootstrap ADMIN user from `BOOTSTRAP_ADMIN_EMAIL` (env). It's idempotent — re-running the seed does not duplicate.

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHmac } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const inviteKey = process.env.INVITE_TOKEN_HMAC_KEY;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  if (!email) throw new Error("BOOTSTRAP_ADMIN_EMAIL not set");
  if (!inviteKey) throw new Error("INVITE_TOKEN_HMAC_KEY not set");

  const user = await prisma.adminUser.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      name: email.split("@")[0],
      role: "ADMIN",
      active: true,
      passwordHash: null,
    },
  });

  // Invalidate any prior un-consumed invites for this user (§7.7.4).
  await prisma.adminInvite.updateMany({
    where: {
      subjectId: user.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  // Mint a fresh invite. Re-running the seed regenerates the link.
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", inviteKey).update(raw).digest("hex");
  await prisma.adminInvite.create({
    data: {
      tokenHash,
      subjectId: user.id,
      issuerId: user.id,                              // Self-issued by the seed.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const url = `${baseUrl}/auth/set-password?type=invite&token=${raw}`;
  console.log("\n========================================");
  console.log("Bootstrap admin invite (1-hour TTL):");
  console.log(url);
  console.log("========================================\n");
}

main().finally(() => prisma.$disconnect());
```

`prisma/seed.ts` does two things: upserts a single `AdminUser` row from `BOOTSTRAP_ADMIN_EMAIL` (idempotent on the row itself), and mints a fresh `AdminInvite` token printed to stdout (re-runnable to recover from a lost or expired bootstrap link). The first sign-in via the printed `/auth/set-password` link sets the bootstrap admin's password; alternatively, signing in via Google SSO matches by email, finds this row, and links the Google account without ever populating `passwordHash`. Without this seed, no one can ever sign in.

### 5.7 Crypto Primitives

The HMAC helpers used across the participant flow (`emailHash`, `ipHash`, `userAgentHash`, `otpHash`) live in a single file. They are keyed off **three independent** env vars (§14.4 / §15) so each can have its own rotation posture, output **lowercase hex** to match the schema and the right-to-erasure SQL in §14.3, and **never apply per-row salt** — the dedup invariant on `(activationId, emailHash)` depends on the same email producing the same hash every time.

```ts
// lib/crypto/hmac.ts
import { createHmac } from "crypto";
import { env } from "@/lib/env";

/**
 * Build a keyed HMAC-SHA256 helper. Output is lowercase hex.
 *
 * Rules:
 * - No per-row salt. Salting destroys the (activationId, emailHash) dedup
 *   invariant (§5.1) and breaks the right-to-erasure-by-hash flow (§14.3).
 * - Three independent keys (§14.4). Do not collapse into one with domain
 *   separation strings — rotation postures differ per key.
 * - Hex output, not base64url. The Postgres erasure SQL in §14.3 computes
 *   `encode(digest($1, 'sha256'), 'hex')` and compares against the column
 *   directly; encoding drift here silently misses erasure rows.
 */
const make = (key: string) => (input: string) =>
  createHmac("sha256", key).update(input).digest("hex");

export const hmac = {
  /** Email is lowercased before hashing — see Phase 2 verification. */
  email: (raw: string) => make(env.EMAIL_HASH_HMAC_KEY)(raw.toLowerCase()),
  ip: make(env.IP_HMAC_KEY),
  otp: make(env.OTP_HMAC_KEY),
} as const;
```

Note that `userAgentHash` (§5.1, §8.6) is computed via `hmac.ip(userAgent)` — same key, different input. This is intentional: the user-agent string is treated as low-entropy semi-public data with the same rotation posture as IP. If a future change introduces a meaningfully different posture for user-agent, add a fourth helper rather than introducing a new env var inline.

---

## 6. tRPC Layer

### 6.1 Why tRPC for Admin and Route Handlers for Participant

The admin surface is a closed system: typed end-to-end, internal users only, capability-aware (ADMIN vs MEMBER), invoked from React Server Components and Client Components. tRPC fits that shape. The participant surface is anonymous, public, accessed by mobile browsers in noisy network conditions, must return well-defined HTTP semantics (202, 400, 503), and must have opaque response shapes (§8.6). Route Handlers fit that shape.

These two are largely mutually exclusive: tRPC procedures are not callable from `/api/register` or `/api/verify`, and Route Handlers are not used inside admin pages.

**Two narrow exceptions** — both admin-host endpoints whose response shape doesn't fit through tRPC's JSON envelope, both gated by their own `getServerSession` check (the host gate enforces segmentation, not auth):

1. **`/api/auth/*`** — NextAuth's own routes; outside our control.
2. **`/api/admin/registrations/export`** — streaming `text/csv` export (§9.7.1). tRPC's wire format wraps responses in a JSON envelope; streaming raw bytes through it is awkward and breaks the contract.

Adding a third exception requires a comment in this section justifying it. The default for new admin functionality is tRPC.

### 6.2 tRPC Setup

```ts
// server/trpc/init.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Session } from "next-auth";

export interface Context {
  session: Session | null;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

```ts
// server/trpc/procedures.ts
import { TRPCError } from "@trpc/server";
import { publicProcedure, middleware } from "./init";
import { prisma } from "@/lib/db/prisma";

const isSignedIn = middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.adminUserId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Refuse stale sessions whose AdminUser has been deactivated.
  const adminUser = await prisma.adminUser.findUnique({
    where: { id: ctx.session.user.adminUserId },
    select: { id: true, role: true, active: true },
  });
  if (!adminUser || !adminUser.active) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, adminUser } });
});

const isAdmin = isSignedIn.unstable_pipe(({ ctx, next }) => {
  if (ctx.adminUser.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

/**
 * Read-or-write access. Both ADMIN and MEMBER may call.
 * Use for read queries (list activations, list registrations, view audit log).
 */
export const memberProcedure = publicProcedure.use(isSignedIn);

/**
 * Write access. ADMIN only.
 * Use for mutations (create activation, edit, change status, manage users).
 */
export const adminProcedure = publicProcedure.use(isAdmin);
```

### 6.3 Routers

```ts
// server/trpc/root.ts
import { router } from "./init";
import { activationRouter } from "./routers/activation";
import { boothRouter } from "./routers/booth";
import { registrationRouter } from "./routers/registration";
import { auditRouter } from "./routers/audit";
import { userRouter } from "./routers/user";
import { authRouter } from "./routers/auth";
import { complianceRouter } from "./routers/compliance";

export const appRouter = router({
  activation: activationRouter,
  booth: boothRouter,
  registration: registrationRouter,
  audit: auditRouter,
  user: userRouter,
  auth: authRouter,
  compliance: complianceRouter,
});

export type AppRouter = typeof appRouter;
```

### 6.4 Explicit Type Annotations

Procedure return types are explicitly annotated. Inference is permitted on procedure inputs (Zod schemas already type them) but not on returns.

```ts
// Good
list: memberProcedure.query(async ({ ctx }): Promise<ActivationListItem[]> => { ... });

// Forbidden
list: memberProcedure.query(async ({ ctx }) => { ... });   // implicit return type
```

This prevents silent breakage during refactors when a downstream consumer relies on a shape that an inner change subtly altered.

### 6.5 Host Guard for tRPC Endpoint

The tRPC route handler (`app/api/trpc/[trpc]/route.ts`) is reachable only on the admin host. The `proxy.ts` (§8.1) returns a 404 for any `/api/trpc/*` request received on the participant host before the handler ever runs.

```ts
// app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { appRouter } from "@/server/trpc/root";

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => ({
      session: await getServerSession(authOptions),
    }),
  });
};

export { handler as GET, handler as POST };
```

---

## 7. Auth & Role Model

Two authentication methods are supported in Phase 1: **Google Workspace SSO** and **email + password**. Both are gated by an email-domain allowlist (`@mrq.com` — exact match, case-insensitive). Both flow through NextAuth's session layer so the downstream surface (tRPC procedures, role checks, audit log) treats them identically once authenticated.

The two methods are **complementary, not exclusive**: an `AdminUser` row may have a `passwordHash` and also sign in via SSO; SSO does not populate `passwordHash`. A user provisioned through the invite flow (§7.7) can later sign in via SSO if their `@mrq.com` Google account exists, and vice versa.

**Provisioning posture: invite-only.** There is no self-service signup. The bootstrap seed (§7.4) creates the first ADMIN row from `BOOTSTRAP_ADMIN_EMAIL`. From then on, new admins are added by an existing ADMIN through the user-management UI (§7.7.2). The invite flow issues a single-use, time-boxed token; the recipient sets their own password.

### 7.1 NextAuth v4 Configuration

NextAuth **v4** (specifically `^4.24`, per §4.5) with the Google provider, JWT session strategy, configured to deny sign-in for any email not present (and active) in the `AdminUser` table.

> **Version risk.** NextAuth v5 (renamed Auth.js) ships a different `authOptions` shape, a different `getServerSession` import path, and different callback signatures. Code in this section is v4-only and will not compile against v5. The pin in §4.5 is load-bearing — do not bump to v5 without a separate migration plan.

```ts
// lib/auth/options.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

const ALLOWED_EMAIL_DOMAIN = env.ALLOWED_EMAIL_DOMAIN;   // "mrq.com"

const CredentialsSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(256),
});

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === ALLOWED_EMAIL_DOMAIN.toLowerCase();
}

// Fixed dummy bcrypt hash to keep authorize() runtime ~constant whether the
// AdminUser exists or not. Cost 12 matches the live cost in §7.7.
const DUMMY_BCRYPT_HASH =
  "$2a$12$CwTycUXWue0Thq9StjUM0uJ8B6r5XkO6m9uS4q8xH1F0mQ8hQzrsy";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Restrict the Google account picker to the workspace tenant.
          hd: env.GOOGLE_WORKSPACE_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
    CredentialsProvider({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Email-domain gate: refuse non-@mrq.com sign-ins at the provider
        // boundary. The signIn callback below re-checks the domain for SSO.
        if (!isAllowedEmail(email)) return null;

        const user = await prisma.adminUser.findUnique({
          where: { email },
          select: {
            id: true, email: true, name: true, active: true, passwordHash: true,
          },
        });

        // Constant-ish work whether the user exists or not. bcrypt.compare
        // against a fixed dummy hash if no row, to flatten timing.
        const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
        const matches = await bcrypt.compare(password, hashToCheck);

        if (!user || !user.active || !user.passwordHash || !matches) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,           // 8 hours
    updateAge: 60 * 60,            // refresh JWT once per hour
  },

  cookies: {
    sessionToken: {
      // __Host- requires Secure, no Domain attribute, Path=/.
      name: "__Host-mrq.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: true,
      },
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },

  callbacks: {
    /**
     * Reject sign-in for any email outside @mrq.com or any email not present
     * (or inactive) in AdminUser. The CredentialsProvider's authorize()
     * already enforces both checks; this callback is the load-bearing gate
     * for the Google provider AND a defence-in-depth layer for credentials.
     */
    async signIn({ profile, user }) {
      const email = profile?.email ?? user?.email;
      if (!isAllowedEmail(email)) return false;
      // The Google `hd` parameter only restricts the picker; users can still
      // attempt other accounts via the URL. Re-verify here.
      if (profile?.email && profile.email.split("@")[1] !== env.GOOGLE_WORKSPACE_DOMAIN) {
        return false;
      }
      const admin = await prisma.adminUser.findUnique({
        where: { email: email!.toLowerCase() },
        select: { id: true, active: true },
      });
      return Boolean(admin && admin.active);
    },

    async jwt({ token, profile, user }) {
      // First sign-in: load AdminUser into token. Subsequent calls: refresh role/active.
      const email = profile?.email ?? user?.email ?? token.email;
      if (!email) return token;
      const admin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, role: true, active: true },
      });
      if (!admin || !admin.active) {
        // Deactivated mid-session: invalidate by zeroing the token fields.
        // The middleware in §6.2 will refuse the next call.
        token.adminUserId = undefined;
        token.role = undefined;
        token.active = false;
        return token;
      }
      token.adminUserId = admin.id;
      token.role = admin.role;
      token.active = true;
      // Update lastLoginAt on the first JWT issuance only (when token has no `iat` yet
      // or when it's older than the updateAge window).
      if (profile || user) {
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.adminUserId = token.adminUserId;
        session.user.role = token.role;
        session.user.active = token.active ?? false;
      }
      return session;
    },
  },
};
```

The TS module augmentation is required for the callbacks above to typecheck:

```ts
// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";
import type { AdminRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      adminUserId?: string;
      role?: AdminRole;
      active: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    adminUserId?: string;
    role?: AdminRole;
    active?: boolean;
  }
}
```

`tsconfig.json` must include `types/next-auth.d.ts` in `include`. Without this file, the callbacks above fail under `strict: true` and the agent will reach for `as any`.

### 7.2 Role Model

There are exactly two roles. The matrix is small enough to express in prose, but the procedure-level enforcement (§6.2) is the load-bearing implementation. Do not duplicate role checks in components.

| Capability | ADMIN | MEMBER |
|------------|-------|--------|
| List activations | ✓ | ✓ |
| View activation detail | ✓ | ✓ |
| Create / edit / delete activation | ✓ | — |
| Approve consent notice (`legalApproved`) | ✓ | — |
| Transition activation status | ✓ | — |
| Manage booths (add / rename / remove) | ✓ | — |
| View dashboard / live counter | ✓ | ✓ |
| View registrations table | ✓ | ✓ |
| Export registrations CSV | ✓ | ✓ |
| View audit log | ✓ | ✓ |
| Manage users (create / deactivate / change role) | ✓ | — |

In short: MEMBER is a read-only role for stakeholders who need visibility but not write access. Every mutation is an `adminProcedure`; every query is a `memberProcedure`.

### 7.3 Sensitive Action Typed-Phrase Confirmations

The following actions require a typed-phrase confirmation in the UI **and** a free-text reason field. The phrase is validated client-side to enable the submit button and re-validated server-side.

| Action | Phrase | Reason logged to |
|--------|--------|-------------------|
| Reverse `ENDED → LIVE` (or `ENDED → SCHEDULED`) | `ROLLBACK ENDED` | AuditLog `metadata.reason` |
| Force-edit a `SCHEDULED` activation | `EDIT LOCKED ACTIVATION` | AuditLog `metadata.reason` |
| Deactivate an admin user | `DEACTIVATE ADMIN` | AuditLog `metadata.reason` |

The phrase format is fixed: ALL CAPS, ASCII, distinct enough not to be typed accidentally. Phrases are not localised.

### 7.4 Bootstrapping the First Admin User

There is no self-service signup. The first ADMIN row is created by `prisma/seed.ts` (§5.6), which reads `BOOTSTRAP_ADMIN_EMAIL` from the environment. The seed runs as part of the local-dev setup and as a one-shot Railway shell command on production.

The seed creates the `AdminUser` row with `passwordHash = null` and immediately mints a single invite token (one-hour TTL) printed to the seed's stdout. The bootstrap admin pastes the printed `/auth/set-password?type=invite&token=...` URL into a browser and sets their password. Alternatively, they can sign in via Google SSO if their `@mrq.com` Google account exists — at which point the row exists and is active, and the password column simply remains null until they choose to set one.

The seed is idempotent on the `AdminUser` row (`upsert` keyed by email) but **not** on the invite token — re-running the seed mints a fresh token (and invalidates any prior un-consumed token via §7.7.4). This is intentional: a bootstrap admin who lost their first invite link can re-run the seed to get a new one without manual SQL.

### 7.5 Capability Guard Component

Server components check the role via `lib/auth/requireRole.ts`. Client components use `<RequireRole>` for conditional rendering only — never as a security boundary.

```ts
// lib/auth/requireRole.ts
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import type { AdminRole } from "@prisma/client";

export async function requireRole(role: AdminRole | "ANY") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.adminUserId || !session.user.active) {
    redirect("/auth/signin");
  }
  if (role !== "ANY" && session.user.role !== role) {
    redirect("/?error=forbidden");
  }
  return session;
}
```

```tsx
// components/admin/RequireRole.tsx
"use client";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import type { AdminRole } from "@prisma/client";

export function RequireRole({ role, children }: { role: AdminRole; children: ReactNode }) {
  const { data: session } = useSession();
  if (session?.user?.role !== role) return null;
  return <>{children}</>;
}
```

The client component is for UI affordances (hide an "edit" button from MEMBERs). It is **not** a security boundary — the security boundary is the tRPC procedure (§6.2).

### 7.6 CSRF Posture

tRPC mutations on the admin host accept POST and read the session cookie. CSRF protection comes from two layered mechanisms:

1. **`sameSite: "strict"` on `__Host-mrq.session-token`** (§7.1). A cross-origin page cannot cause the browser to attach the cookie to a request to `admin.mrqlive.co.uk`. Strict same-site cookies don't ride cross-site requests at all — including same-site top-level navigations from a different origin. This is the primary defence.
2. **`Content-Type: application/json` requirement.** tRPC posts JSON, which is a non-simple request type and triggers a CORS preflight. The admin host returns no permissive CORS headers, so the preflight fails and the actual POST never fires from a foreign origin.

**Do not change `sameSite` on the session cookie without a security review.** Relaxing to `lax` would allow same-site top-level GETs to send the cookie — fine for navigations, but a path to CSRF on any future GET mutation. We don't have GET mutations in Phase 1; the rule prevents one being introduced inadvertently.

The participant flow does not need CSRF consideration because `/api/register` and `/api/verify` are anonymous (no auth cookie) and rely on per-IP and per-token rate limiting (§3.6) for abuse resistance.

NextAuth's own `/api/auth/*` endpoints have built-in CSRF tokens (the `csrfToken` cookie + form-field pattern) for sign-in flows; these are outside the tRPC posture above and don't need additional handling.

### 7.7 Password Login, Invite Flow, and Forgot-Password

The CredentialsProvider in §7.1 verifies a submitted password against `AdminUser.passwordHash`. Provisioning a hash for a new user, and recovering a forgotten password for an existing one, are the two flows that produce a hash. Each is backed by a distinct table — `AdminInvite` and `PasswordResetToken` (§5.1) — using **different HMAC keys** so a token of one class cannot be accepted as the other at the lookup layer.

#### 7.7.1 Token Primitive (shared by both flows)

A token is a 32-byte random value, base64url-encoded, emailed to the subject as part of a URL (`https://admin.mrqlive.co.uk/auth/set-password?type=invite&token=<raw>` or `?type=reset&token=<raw>`). The raw token is **never stored**: the database holds only `tokenHash = HMAC-SHA256(rawToken)`, keyed off the appropriate per-class HMAC key (`INVITE_TOKEN_HMAC_KEY` or `RESET_TOKEN_HMAC_KEY`). On submit, the submitted token is hashed with the matching class key and joined on the appropriate table.

```ts
// lib/auth/tokens.ts
import { randomBytes, createHmac } from "crypto";
import { env } from "@/lib/env";

export type TokenClass = "invite" | "reset";

export function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string, kind: TokenClass): string {
  const key = kind === "invite" ? env.INVITE_TOKEN_HMAC_KEY : env.RESET_TOKEN_HMAC_KEY;
  return createHmac("sha256", key).update(raw).digest("hex");
}
```

Token lifecycle (identical shape across both tables):

| Event | Effect |
|-------|--------|
| Issue | Insert row with `expiresAt = now() + 1h`, `consumedAt = null` |
| Consume (set password) | In a transaction: update `consumedAt = now()`, update `AdminUser.passwordHash`, write audit row |
| Expire (passive) | Row remains until retention purge (§14.1.1); lookups exclude `expiresAt < now()` |
| Re-issue while one is active | The new issue invalidates all prior un-consumed tokens for the same `subjectId` in the same table — see §7.7.4 |

The 1-hour TTL is a hard limit. Do not extend it without a security review.

#### 7.7.2 Invite Flow (ADMIN provisions a new admin)

1. **ADMIN opens `/admin/users` and clicks "Invite admin."** Form fields: email, name, role (ADMIN | MEMBER).
2. **`user.invite` tRPC `adminProcedure` runs server-side:**
   - Validates email matches `@mrq.com` via Zod `.refine`.
   - Inside a `prisma.$transaction(async (tx) => ...)`:
     - Insert `AdminUser` row: `email`, `name`, `role`, `active = true`, `passwordHash = null`.
     - Mint raw token; insert `AdminInvite` with `tokenHash = hashToken(raw, "invite")`, `subjectId = newUser.id`, `issuerId = session.user.adminUserId`, `expiresAt = now() + 1h`.
     - Write `AuditLog` via `writeAuditLog({ category: "ADMIN", action: "user.invited", actorId, targetType: "AdminUser", targetId: newUser.id, metadata: { role, inviteId }, tx })`.
   - **Outside the transaction**, send the invite email via `emailProvider.sendInvite(...)` (synchronous, same retry pattern as OTP — §10.2). If the send fails after retry, write a compensating audit row (`action = "user.invite.send_failed"`) and surface a friendly error to the inviting ADMIN. The `AdminUser` row remains; the ADMIN can re-issue the invite, which invalidates the prior token (§7.7.4) and tries again.
3. **Recipient clicks the link**, lands on `/auth/set-password?type=invite&token=<raw>`.
4. **Set-password page** validates the token via `auth.validateInvite` `publicProcedure` (no auth required — the token *is* the credential), shows a password form pre-filled with the invitee's email (read-only) and name.
5. **Submit** calls `auth.consumeInvite` `publicProcedure`:
   - Hash candidate with `hashToken(raw, "invite")`, lookup `AdminInvite`, verify `consumedAt == null && expiresAt > now()`.
   - bcrypt-hash the new password (cost 12).
   - In a transaction: update `AdminUser.passwordHash`, set `AdminInvite.consumedAt = now()`, write `AuditLog` (`action = "user.invite.consumed"`).
   - Redirect to `/auth/signin` with a success banner.

#### 7.7.3 Forgot-Password Flow (self-service)

1. **User clicks "Forgot password?" on `/auth/signin`**, lands on `/auth/forgot-password`.
2. **Form submits email** to `auth.requestPasswordReset` `publicProcedure`:
   - Rate-limited per IP (`rl:ip:forgot:<ipHash>`, 5/hour) and per email-hash (`rl:email:forgot:<emailHash>`, 3/hour) via the §3.6 limiter.
   - **Always returns the same shape**, regardless of whether the email exists, is active, or is `@mrq.com`. This is an enumeration-oracle defence — see §8.6 for the broader pattern. The user-facing message is "If an account exists for that email, we've sent a reset link."
   - If a matching active `AdminUser` exists (and the email passes the `@mrq.com` gate): invalidate prior un-consumed `PasswordResetToken` rows for that user (§7.7.4), issue a new `PasswordResetToken` with `subjectId = user.id`, `issuerId = user.id` (self-service), `expiresAt = now() + 1h`. Send via `emailProvider.sendPasswordReset(...)`. Write `AuditLog` (`action = "user.password.reset.requested"`, `metadata = { emailHash }` — emailHash, not raw email).
3. **Recipient clicks the link**, lands on `/auth/set-password?type=reset&token=<raw>`.
4. **Submit** consumes via `auth.consumePasswordReset` — same shape as `consumeInvite` but reads from `PasswordResetToken`, hashes with the reset key, and writes audit `action = "user.password.reset.consumed"`.

ADMIN can also issue a reset on behalf of a locked-out user from `/admin/users/:id` ("Send password reset link"). Same primitive, `issuerId = session.user.adminUserId`, audit `action = "user.password.reset.issued_by_admin"`.

#### 7.7.4 Token Invalidation on Re-Issue

If an ADMIN re-invites a user whose original invite hasn't been consumed (or a user requests a reset while a prior reset is active), the new token must invalidate the old one. Otherwise both links remain valid simultaneously — exploitable if the first link was intercepted or leaked.

Pattern, inside the issue transaction, before inserting the new row (illustrated for resets; same shape for invites against `AdminInvite`):

```sql
UPDATE "PasswordResetToken"
SET "consumedAt" = now()
WHERE "subjectId" = $1
  AND "consumedAt" IS NULL
  AND "expiresAt" > now();
```

A separate `revokedAt` column was considered and rejected — the audit row's `action` string already distinguishes "consumed by user" from "invalidated by re-issue" (`user.password.reset.invalidated_by_reissue`). Adding a second timestamp would duplicate that distinction.

#### 7.7.5 Set-Password Page (shared between flows)

Single page at `/auth/set-password` serves both invite and reset. Reads `?type=invite|reset` and `?token=<raw>` from the query string (Next.js 16's async `searchParams`). Calls the matching `validate*` procedure on mount; on success, renders the form with copy adjusted by `type` ("Welcome — set your password" vs "Reset your password"). On token-invalid (expired, consumed, missing, or wrong class), renders a uniform "This link has expired or already been used. Request a new one." message — never reveals which failure mode it was.

Form fields: password (min 12 chars), confirm password (must match). Client-side validation; server-side re-validation in the consume procedure.

#### 7.7.6 Password Strength Rule

Passwords must be **at least 12 characters**. No mandatory character-class rules (NIST SP 800-63B explicitly discourages composition rules in favour of length). Maximum 256 chars (matches the Zod schema in §7.1's CredentialsProvider). No rotation policy. The form should display a meter ("weak / fair / strong") for guidance but not block submission on anything other than the 12-char minimum.

#### 7.7.7 Email Provider Extension

§10.1's `EmailProvider` interface gains two methods:

```ts
// lib/email/provider.ts (updated)
import { resendProvider } from "./resend";

export interface EmailProvider {
  sendOtp(args: { to: string; otp: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  sendInvite(args: {
    to: string;
    name: string;
    setPasswordUrl: string;
    issuerName: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
  sendPasswordReset(args: {
    to: string;
    setPasswordUrl: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

export const emailProvider: EmailProvider = resendProvider;
```

Templates live alongside `otpEmail.ts` at `lib/email/templates/inviteEmail.ts` and `lib/email/templates/passwordResetEmail.ts`. Both templates make the 1-hour TTL explicit ("This link expires in one hour"). The reset email never confirms or denies the existence of the account — see §7.7.3.

#### 7.7.8 Audit Action Catalogue (auth-related)

| Action | Category | Trigger | Notes |
|--------|----------|---------|-------|
| `user.invited` | ADMIN | ADMIN issues invite | `metadata.role`, `metadata.inviteId` |
| `user.invite.send_failed` | ADMIN | Invite email send failed after retry | Compensating row; user still exists |
| `user.invite.consumed` | ADMIN | Invitee sets password | `metadata.inviteId` |
| `user.invite.invalidated_by_reissue` | ADMIN | Older invite superseded | Set on the *old* row's invalidation |
| `user.password.reset.requested` | SECURITY | Self-service forgot-password | `metadata.emailHash`; logged even if no user matched |
| `user.password.reset.issued_by_admin` | ADMIN | ADMIN issues reset for locked-out user | `metadata.targetEmailHash` |
| `user.password.reset.consumed` | SECURITY | User consumes a reset token | |
| `user.password.reset.invalidated_by_reissue` | ADMIN | Older reset superseded | |
| `user.signed_in` | SECURITY | NextAuth `signIn` event | `metadata.method = "password" | "google"` |
| `user.signed_out` | SECURITY | NextAuth `signOut` event | |

`user.signed_in` and `user.signed_out` are written from NextAuth's `events` block (not callbacks) — see §7.1 for where to add them when wiring the audit. Sign-in writes happen *after* the JWT callback so a deactivated-during-callback user does not produce a misleading sign-in row.

---

## 8. Participant Flow

### 8.1 `proxy.ts` — Host-Aware Gate

The proxy file lives at the project root. It runs before every request and decides which paths are reachable for the requested host. There are no rewrites — paths inside route groups remain real URLs.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOST = "admin.mrqlive.co.uk";
const PARTICIPANT_HOST = "mrqlive.co.uk";

export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  const path = req.nextUrl.pathname;

  // Health endpoint is reachable on any host.
  if (path === "/api/health") return NextResponse.next();

  // NextAuth handler is reachable only on the admin host.
  if (path.startsWith("/api/auth/")) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // tRPC handler is reachable only on the admin host.
  if (path.startsWith("/api/trpc/")) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Participant Route Handlers are reachable only on the participant host.
  if (path === "/api/register" || path === "/api/verify") {
    return host === PARTICIPANT_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Admin pages: only on admin host.
  if (
    path === "/" ||
    path.startsWith("/activations/") ||
    path.startsWith("/dashboard/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/auth/")
  ) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Everything else (participant pages: /:slug, /:slug/verify, etc.) is participant-host only.
  return host === PARTICIPANT_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
```

The proxy returns 404 for cross-host access, not 403 — admin paths should not be discoverable from the participant host.

**robots.txt and SEO posture.** Activation pages are QR-driven, ephemeral (90-day data lifecycle), and may carry sensitive event names. We explicitly do **not** want them indexed. Phase 1 ships a static `public/robots.txt` containing:

```
User-agent: *
Disallow: /
```

Both surfaces return the same file (the proxy lets `/robots.txt` through to Next.js's static handling, which serves it from `public/`). The admin host is not crawler-reachable in the first place (auth-walled), so a permissive robots there would be cosmetic — disallowing both is simpler and consistent.

### 8.2 Landing Page

URL: `/<activationSlug>?booth=<code>&utm_source=...`

```tsx
// app/(participant)/[activationSlug]/page.tsx
import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { RegistrationForm } from "@/components/participant/RegistrationForm";
import { renderTiptap } from "@/lib/tiptap/render";

const getActivation = (slug: string) =>
  unstable_cache(
    async () =>
      prisma.activation.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          content: true,
          consentNotice: true,
          consentVersion: true,
          primaryColor: true,
          heroImageUrl: true,
        },
      }),
    [`activation:${slug}`],
    { tags: [`activation:${slug}`], revalidate: 60 }
  )();

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ activationSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { activationSlug } = await params;
  const sp = await searchParams;
  const activation = await getActivation(activationSlug);
  if (!activation) notFound();

  if (activation.status === "ENDED") redirect(`/${activationSlug}/ended`);
  if (activation.status === "DRAFT") notFound();
  if (activation.status === "SCHEDULED") {
    return <NotYetOpenState activation={activation} />;
  }

  return (
    <main
      style={activation.primaryColor ? ({ ["--color-primary" as never]: activation.primaryColor } as React.CSSProperties) : undefined}
      className="mx-auto max-w-md p-4"
    >
      {activation.heroImageUrl && (
        <img src={activation.heroImageUrl} alt="" className="rounded-md mb-4 w-full" />
      )}
      <article className="prose">{renderTiptap(activation.content)}</article>
      <RegistrationForm
        activationId={activation.id}
        activationSlug={activation.slug}
        boothCode={sp.booth ?? null}
        utmSource={sp.utm_source ?? null}
        utmMedium={sp.utm_medium ?? null}
        utmCampaign={sp.utm_campaign ?? null}
        consentNotice={activation.consentNotice}
        consentVersion={activation.consentVersion}
      />
    </main>
  );
}

function NotYetOpenState({ activation }: { activation: { name: string; startsAt?: Date | null } }) {
  return (
    <main className="mx-auto max-w-md p-4 text-center">
      <h1 className="text-2xl font-semibold">{activation.name}</h1>
      <p className="mt-4 text-muted-foreground">This activation isn't open yet. Come back soon.</p>
    </main>
  );
}
```

### 8.3 Registration Form

```tsx
// components/participant/RegistrationForm.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConsentBlock } from "./ConsentBlock";

interface Props {
  activationId: string;
  activationSlug: string;
  boothCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  consentNotice: unknown;          // Tiptap JSON, rendered by ConsentBlock
  consentVersion: string;
}

export function RegistrationForm(props: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activationId: props.activationId,
            email,
            consentVersion: props.consentVersion,
            boothCode: props.boothCode,
            utmSource: props.utmSource,
            utmMedium: props.utmMedium,
            utmCampaign: props.utmCampaign,
          }),
        });
        if (res.status === 503) {
          setError("Service is briefly unavailable. Please try again in a moment.");
          return;
        }
        if (res.status === 429) {
          setError("Too many attempts. Please wait a minute and try again.");
          return;
        }
        if (!res.ok) {
          setError("Couldn't submit. Please check your email and try again.");
          return;
        }
        const { pendingToken } = (await res.json()) as { pendingToken: string };
        // Stash the token in sessionStorage and route to verify.
        sessionStorage.setItem(`mrq:pendingToken:${props.activationSlug}`, pendingToken);
        router.push(`/${props.activationSlug}/verify`);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border px-3 py-2"
        />
      </label>

      <ConsentBlock notice={props.consentNotice} accepted={consentAccepted} onAccept={setConsentAccepted} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!email || !consentAccepted || isPending}
        onClick={submit}
        className="w-full rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
      >
        {isPending ? "Sending code…" : "Send me a code"}
      </button>
    </div>
  );
}
```

### 8.4 Consent Block

```tsx
// components/participant/ConsentBlock.tsx
"use client";
import { renderTiptap } from "@/lib/tiptap/render";

interface Props {
  notice: unknown;
  accepted: boolean;
  onAccept: (next: boolean) => void;
}

export function ConsentBlock({ notice, accepted, onAccept }: Props) {
  return (
    <div className="rounded-md border border-border p-4 text-sm">
      <div className="prose prose-sm">{renderTiptap(notice)}</div>
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAccept(e.target.checked)}
          className="mt-1"
          required
        />
        <span>I have read and accept the above.</span>
      </label>
    </div>
  );
}
```

### 8.5 Mobile OTP Input & Offline Handling

The verify page renders a six-digit input with `inputMode="numeric"`, `autoComplete="one-time-code"`, and `pattern="\d{6}"`. On iOS Safari, `one-time-code` autofill picks up OTPs from the SMS app's clipboard inference; on Android Chrome, it reads from notification text. Both use the same input.

If the device is offline at submit time (`!navigator.onLine`), we surface a non-blocking banner ("You appear to be offline — your code will be submitted when you reconnect"); the actual submit is queued in the component's local state and retried on the next `online` event. There's no service worker.

### 8.6 `/api/register` — Opaque Response Shape

The endpoint always responds with one of two shapes:

| Status | Body | When |
|--------|------|------|
| `202` | `{ pendingToken: string }` | Validation passed, OTP issued (or no-op when activation isn't accepting registrations — same shape so internal state is opaque). |
| `400` | `{ ok: false }` | Malformed payload (Zod failure, missing field). Same shape regardless of which field. |
| `429` | `{ ok: false }` | Per-IP or per-email rate limit hit. |
| `503` | `{ ok: false }` | Redis or email send failed after retry. |

Never branch on internal state in the response shape. "Email already verified", "Email is suppressed", "Activation is in DRAFT" all return the same `202 { pendingToken }` (with the OTP send no-op'd internally).

```ts
// app/api/register/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { withRedisHealth } from "@/lib/redis/health";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { hmac } from "@/lib/crypto/hmac";
import { issueOtp } from "@/lib/otp/issue";
import { signPendingToken } from "@/lib/otp/pendingToken";
import { emailProvider } from "@/lib/email/provider";
import { Prisma } from "@prisma/client";

const Body = z.object({
  activationId: z.string().min(1),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  consentVersion: z.string().min(1),
  boothCode: z.string().nullable().optional(),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
});

const OK_202 = (pendingToken: string) =>
  NextResponse.json({ pendingToken }, { status: 202 });
const ERR = (status: number) => NextResponse.json({ ok: false }, { status });

export async function POST(req: Request) {
  return withRedisHealth(async () => {
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return ERR(400);
    const { activationId, email, consentVersion, boothCode, utmSource, utmMedium, utmCampaign } = parsed.data;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const userAgent = req.headers.get("user-agent") ?? "";
    const ipHash = hmac.ip(ip);
    const userAgentHash = hmac.ip(userAgent);
    const emailHash = hmac.email(email);

    // Per-IP global rate limit.
    const ipOk = await fixedWindow({ key: `rl:ip:register:${ipHash}`, limit: 30, windowSeconds: 60 });
    if (!ipOk) return ERR(429);

    // Per-email + activation rate limit.
    const emailOk = await fixedWindow({
      key: `rl:email:register:${activationId}:${emailHash}`,
      limit: 5,
      windowSeconds: 60 * 10,
    });
    if (!emailOk) return ERR(429);

    const activation = await prisma.activation.findUnique({
      where: { id: activationId },
      select: { id: true, status: true, consentVersion: true },
    });

    // No-op response for any state that shouldn't issue an OTP. Returning a
    // pendingToken anyway preserves response-shape opacity. The token is signed
    // with a "no-op" marker the verify endpoint detects.
    if (
      !activation ||
      activation.status !== "LIVE" ||
      activation.consentVersion !== consentVersion
    ) {
      return OK_202(signPendingToken({ kind: "noop" }));
    }

    // Idempotent: if a Registration already exists, reuse it. The unique index
    // (activationId, emailHash) makes upsert race-safe.
    let registrationId: string;
    try {
      const reg = await prisma.registration.upsert({
        where: { activationId_emailHash: { activationId, emailHash } },
        update: {},                       // Don't overwrite a VERIFIED row.
        create: {
          activationId,
          email,
          emailHash,
          status: "PENDING",
          boothCode: boothCode ?? null,
          utmSource: utmSource ?? null,
          utmMedium: utmMedium ?? null,
          utmCampaign: utmCampaign ?? null,
          ipHash,
          userAgentHash,
          consentVersion,
          consentAcceptedAt: new Date(),
        },
        select: { id: true, status: true },
      });
      registrationId = reg.id;
      // If already verified, no-op the OTP send but return identical shape.
      if (reg.status === "VERIFIED") {
        return OK_202(signPendingToken({ kind: "noop" }));
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Concurrent insert lost the race; re-read and proceed.
        const existing = await prisma.registration.findUniqueOrThrow({
          where: { activationId_emailHash: { activationId, emailHash } },
          select: { id: true, status: true },
        });
        if (existing.status === "VERIFIED") return OK_202(signPendingToken({ kind: "noop" }));
        registrationId = existing.id;
      } else {
        throw e;
      }
    }

    // Issue OTP (Redis SET EX 600). One active OTP per registration: the issue
    // helper unconditionally overwrites any prior key.
    const { otp, otpHash } = await issueOtp(registrationId);

    // Send synchronously. 5s timeout. One retry. If both fail, surface 503.
    const sendResult = await emailProvider.sendOtp({ to: email, otp });
    if (!sendResult.ok) return ERR(503);

    return OK_202(signPendingToken({ kind: "issued", registrationId }));
  });
}
```

### 8.7 `/api/verify` — OTP Verification Endpoint

```ts
// app/api/verify/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { withRedisHealth } from "@/lib/redis/health";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { hmac } from "@/lib/crypto/hmac";
import { verifyPendingToken } from "@/lib/otp/pendingToken";
import { consumeOtp, incrementAttempts } from "@/lib/otp/verify";

const Body = z.object({
  pendingToken: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/),
});

const OK = NextResponse.json({ ok: true }, { status: 200 });
const FAIL = NextResponse.json({ ok: false }, { status: 400 });

export async function POST(req: Request) {
  return withRedisHealth(async () => {
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return FAIL;
    const { pendingToken, otp } = parsed.data;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const ipHash = hmac.ip(ip);

    // Per-IP rate limit, plus per-token rate limit so a spread attack can't
    // share blast radius across tokens.
    const ipOk = await fixedWindow({ key: `rl:ip:verify:${ipHash}`, limit: 60, windowSeconds: 60 });
    if (!ipOk) return FAIL;
    const tokenOk = await fixedWindow({ key: `rl:tok:verify:${pendingToken}`, limit: 6, windowSeconds: 60 * 10 });
    if (!tokenOk) return FAIL;

    const decoded = verifyPendingToken(pendingToken);
    if (!decoded || decoded.kind === "noop") return FAIL;

    // Read OTP hash from Redis. If missing → expired / consumed / never issued.
    const stored = await consumeOtp(decoded.registrationId, { peek: true });
    if (!stored) return FAIL;

    if (stored.attempts >= 5) {
      await consumeOtp(decoded.registrationId, { peek: false });   // GETDEL — burn it.
      return FAIL;
    }

    const submittedHash = hmac.otp(otp);
    const a = Buffer.from(submittedHash, "hex");
    const b = Buffer.from(stored.otpHash, "hex");
    if (a.length !== b.length) {
      await incrementAttempts(decoded.registrationId);
      return FAIL;
    }
    if (!timingSafeEqual(a, b)) {
      await incrementAttempts(decoded.registrationId);
      return FAIL;
    }

    // Success. Burn the Redis key and mark Registration verified.
    await consumeOtp(decoded.registrationId, { peek: false });
    await prisma.registration.update({
      where: { id: decoded.registrationId },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
    return OK;
  });
}
```

The OTP issue / verify helpers in `lib/otp/` use Redis directly:

```ts
// lib/otp/issue.ts
import { randomInt } from "crypto";
import { redis } from "@/lib/redis/client";
import { hmac } from "@/lib/crypto/hmac";

const OTP_TTL_SECONDS = 600;     // 10 minutes

export async function issueOtp(registrationId: string): Promise<{ otp: string; otpHash: string }> {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const otpHash = hmac.otp(otp);
  // Store hash + attempt counter as a hash. One active OTP per registration: SET overwrites.
  await redis
    .multi()
    .del(`otp:${registrationId}`)
    .hset(`otp:${registrationId}`, { otpHash, attempts: "0" })
    .expire(`otp:${registrationId}`, OTP_TTL_SECONDS)
    .exec();
  return { otp, otpHash };
}
```

```ts
// lib/otp/verify.ts
import { redis } from "@/lib/redis/client";

interface StoredOtp { otpHash: string; attempts: number; }

export async function consumeOtp(
  registrationId: string,
  opts: { peek: boolean }
): Promise<StoredOtp | null> {
  const key = `otp:${registrationId}`;
  if (opts.peek) {
    const data = await redis.hgetall(key);
    if (!data || !data.otpHash) return null;
    return { otpHash: data.otpHash, attempts: Number(data.attempts ?? 0) };
  }
  await redis.del(key);
  return null;
}

export async function incrementAttempts(registrationId: string): Promise<void> {
  await redis.hincrby(`otp:${registrationId}`, "attempts", 1);
}
```

```ts
// lib/otp/pendingToken.ts
import { createHmac } from "crypto";
import { env } from "@/lib/env";

type Payload =
  | { kind: "issued"; registrationId: string }
  | { kind: "noop" };

export function signPendingToken(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", env.PENDING_TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPendingToken(token: string): Payload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env.PENDING_TOKEN_SECRET).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
}
```

### 8.8 `withRedisHealth` Wrapper

A single wrapper that pings Redis with a tight timeout before any handler logic runs. If Redis is unavailable, the participant request short-circuits to 503 before validation, before DB reads, before anything that might log PII to a half-broken downstream.

```ts
// lib/redis/health.ts
import { NextResponse } from "next/server";
import { redis } from "./client";

const HEALTH_TIMEOUT_MS = 500;

export async function withRedisHealth<T>(handler: () => Promise<T>): Promise<T | NextResponse> {
  try {
    const ping = redis.ping();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("redis-timeout")), HEALTH_TIMEOUT_MS)
    );
    await Promise.race([ping, timeout]);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Retry-After": "30" } });
  }
  return handler();
}
```

The Redis client itself is configured with `maxRetriesPerRequest: 2` and `enableOfflineQueue: false` so a downed Redis fails fast (rather than hanging the request and spawning further retries).

```ts
// lib/redis/client.ts
import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    commandTimeout: 1000,
  });

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
```

### 8.9 Verify Page

```tsx
// app/(participant)/[activationSlug]/verify/page.tsx
import { OtpInput } from "@/components/participant/OtpInput";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ activationSlug: string }>;
}) {
  const { activationSlug } = await params;
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Enter your code</h1>
      <p className="mt-2 text-sm text-muted-foreground">We sent a six-digit code to your email.</p>
      <OtpInput activationSlug={activationSlug} />
    </main>
  );
}
```

`OtpInput` is a client component that reads `pendingToken` from `sessionStorage` and POSTs to `/api/verify`. On success, navigates to `/<slug>/success`. On failure, surfaces a generic "That code didn't match. Please try again." message.

---

## 9. Admin Console — Activation Builder & Tiptap

### 9.1 Reserved Slugs

The following activation slugs are reserved and cannot be created via the admin UI: `auth`, `api`, `admin`, `activations`, `dashboard`, `_next`, `health`. Validation lives in the activation tRPC create / update procedure as a Zod refinement.

### 9.2 Tiptap Setup

The same Tiptap editor component renders for two purposes:

1. **Activation content** — the marketing landing-page copy. Loose allowlist.
2. **Consent notice** — the privacy / data-use notice. Tight allowlist (no images, no link styling, only structural marks).

```ts
// lib/tiptap/allowlists.ts
export const CONTENT_ALLOWLIST = {
  nodes: ["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "horizontalRule", "image"],
  marks: ["bold", "italic", "underline", "link"],
  attrs: {
    heading: { level: [1, 2, 3] },
    image: { src: { type: "url" }, alt: { type: "string" } },
    link: { href: { type: "url" } },
  },
} as const;

export const CONSENT_ALLOWLIST = {
  nodes: ["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem"],
  marks: ["bold", "italic", "link"],
  attrs: {
    heading: { level: [2, 3] },
    link: { href: { type: "url" } },
  },
} as const;
```

```ts
// lib/tiptap/validate.ts
import { z } from "zod";
import { CONTENT_ALLOWLIST, CONSENT_ALLOWLIST } from "./allowlists";

type Allowlist = typeof CONTENT_ALLOWLIST | typeof CONSENT_ALLOWLIST;

const TiptapNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
    content: z.array(TiptapNode).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
    text: z.string().optional(),
  })
);

export const TiptapDoc = TiptapNode;

export function validateAgainstAllowlist(doc: unknown, allowlist: Allowlist): { ok: true } | { ok: false; reason: string } {
  const parsed = TiptapDoc.safeParse(doc);
  if (!parsed.success) return { ok: false, reason: "malformed-tiptap-tree" };

  function walk(node: unknown): string | null {
    if (typeof node !== "object" || node === null) return null;
    const n = node as { type: string; content?: unknown[]; marks?: { type: string }[] };
    if (!allowlist.nodes.includes(n.type)) return `node:${n.type}`;
    for (const m of n.marks ?? []) {
      if (!allowlist.marks.includes(m.type)) return `mark:${m.type}`;
    }
    for (const c of n.content ?? []) {
      const v = walk(c);
      if (v) return v;
    }
    return null;
  }

  const violation = walk(parsed.data);
  if (violation) return { ok: false, reason: violation };
  return { ok: true };
}
```

The validator runs in two places:

1. The activation create / update tRPC procedure, before any DB write.
2. Once on read, in development only, behind a `NODE_ENV === "development"` flag — this catches drift if a future change introduces an extension without updating the allowlist.

### 9.3 Consent Notice Versioning

`consentVersion` is a SHA-256 of the canonicalised `consentNotice` JSON. "Canonicalised" means the JSON is serialised with sorted object keys so cosmetic re-ordering does not change the hash.

```ts
// lib/tiptap/consentVersion.ts
import { createHash } from "crypto";

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    // Codepoint-order sort, NOT String.prototype.localeCompare. localeCompare
    // without an explicit locale is locale-sensitive — the same Tiptap doc can
    // hash differently on a Railway worker (POSIX locale) versus a developer's
    // Mac (en-US.UTF-8) versus a German keyboard (de-DE.UTF-8). Codepoint
    // comparison is deterministic across every JS runtime and locale.
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function consentVersionOf(notice: unknown): string {
  return createHash("sha256").update(canonicalStringify(notice)).digest("hex");
}
```

The activation create / update tRPC procedure recomputes `consentVersion` on every save and stores it. On registration, the participant submits the activation's current `consentVersion` (read from the landing page); if the activation's consentVersion has since changed, the register endpoint silently no-ops (§8.6). This forces participants on stale tabs to refresh and re-consent.

### 9.4 Activation Builder UI

`/activations/new` and `/activations/:id/edit` render the same `ActivationForm` component. The form has:

- Header: name, slug (live-validated against reserved list), startsAt, endsAt, status badge.
- Content tab: Tiptap editor seeded with `CONTENT_ALLOWLIST`.
- Consent tab: Tiptap editor seeded with `CONSENT_ALLOWLIST`. Editing this clears `legalApproved` (with a banner: "consent notice changed — re-approval required before going SCHEDULED").
- Booths tab: list of `Booth` rows with add / rename / remove. Each row has a "Download QR" button (§12).
- Branding tab: hero image URL, primary colour.

Mutations are tRPC `adminProcedure` calls. Tab navigation does not unmount unsaved state; a save button persists the entire form. There is **no autosave** — save is explicit so consent-version churn is intentional.

### 9.5 `legalApproved` and Status State Machine

The transition matrix:

| From | To | Gate |
|------|-----|------|
| DRAFT | SCHEDULED | `legalApproved === true` |
| SCHEDULED | LIVE | `now >= startsAt - 5min` (or ADMIN override) |
| LIVE | ENDED | `now >= endsAt` (or ADMIN manual end) |
| SCHEDULED | DRAFT | ADMIN + typed phrase `EDIT LOCKED ACTIVATION` + reason |
| LIVE | SCHEDULED | ADMIN + typed phrase `ROLLBACK ENDED` + reason (rare) |
| ENDED | LIVE | ADMIN + typed phrase `ROLLBACK ENDED` + reason |
| ENDED | SCHEDULED | ADMIN + typed phrase `ROLLBACK ENDED` + reason |

Every transition writes an `AuditLog` row with `category = ADMIN`, `action = "activation.status.<from>.<to>"`, and the reason in `metadata.reason`. The transition is a single Prisma transaction so the status update and audit row commit together.

#### 9.5.1 The Audit Writer

`lib/audit/writeAuditLog.ts` is the only path through which audit rows are created. Direct calls to `prisma.auditLog.create(...)` are forbidden — the writer enforces shape consistency and takes the optional `tx` parameter that makes status transitions atomic.

```ts
// lib/audit/writeAuditLog.ts
import { Prisma, type AuditCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface Args {
  category: AuditCategory;
  action: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /**
   * Structured detail. Never raw PII — pass `emailHash`, `ipHash`, etc.
   * Defaults to JSON null (not SQL NULL) when omitted.
   */
  metadata?: Prisma.InputJsonValue;
  ipHash?: string | null;
  /**
   * Optional transaction client. Pass when the audit row must commit
   * atomically with surrounding writes — activation status transitions
   * (§9.5), legalApproved toggles, user deactivations. Omit for stand-alone
   * audit events: sign-in, sign-out, manual DSAR/erasure rows (§14.2, §14.3).
   */
  tx?: Prisma.TransactionClient;
}

export async function writeAuditLog(args: Args): Promise<void> {
  const client = args.tx ?? prisma;
  await client.auditLog.create({
    data: {
      category: args.category,
      action: args.action,
      actorId: args.actorId ?? null,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      metadata: args.metadata ?? Prisma.JsonNull,
      ipHash: args.ipHash ?? null,
    },
  });
}
```

Two specifics worth pinning:

- **`Prisma.JsonNull` vs JS `null`.** Prisma's `Json` columns distinguish "JSON null" (`Prisma.JsonNull`) from "SQL NULL" (`Prisma.DbNull`). Passing JS `null` silently picks the wrong one based on column nullability. The default-when-absent above writes JSON null; callers that want SQL NULL pass `Prisma.DbNull` explicitly.
- **No PII parameters by design.** There's no `email`, `ip`, or `userAgent` parameter. To record an email reference, a caller passes `metadata: { emailHash }`. This makes "we cannot accidentally log an email" a function-signature property rather than discipline-and-hope.

The lint rule from §13.2 (forbidding `email`/`ip` field names in `log()` calls) extends to this function's `metadata` payloads — checked at PR review.

### 9.6 Live Counter

The activation dashboard displays a live count of `Registration` rows where `status = VERIFIED` for the activation. Phase 1 implementation is poll-based: a client component `LiveCounter` calls a `memberProcedure.subscription` … no, simpler: it polls a `memberProcedure.query` every 10 seconds via `useQuery` with `refetchInterval`. No WebSockets, no Server-Sent Events.

```ts
// server/trpc/routers/registration.ts (excerpt)
liveCount: memberProcedure
  .input(z.object({ activationId: z.string() }))
  .query(async ({ input }): Promise<{ verified: number; pending: number }> => {
    const [verified, pending] = await Promise.all([
      prisma.registration.count({ where: { activationId: input.activationId, status: "VERIFIED" } }),
      prisma.registration.count({ where: { activationId: input.activationId, status: "PENDING" } }),
    ]);
    return { verified, pending };
  }),
```

### 9.7 Registrations Table & CSV Export

The dashboard's registrations tab lists all `VERIFIED` registrations for an activation, paginated server-side via a tRPC `memberProcedure` (`registration.list`). CSV export streams the same data through a dedicated Route Handler — see §9.7.1 for why this is the rare carve-out from the tRPC-for-admin rule. The CSV columns are, in order: `email, registeredAt, verifiedAt, boothCode, utmSource, utmMedium, utmCampaign`. Both ADMIN and MEMBER can export; both writes an audit row.

#### 9.7.1 Streaming CSV Export Handler

The export is a Route Handler, not a tRPC procedure (§6.1 enumerates this as one of two narrow exceptions). The reason is mechanical: tRPC wraps responses in a JSON envelope, which precludes streaming raw `text/csv` bytes. We **stream** rather than buffer because activations may have thousands of registrations, and loading the whole result set into memory before flushing is unnecessary at any scale.

Three rules govern this handler:

1. **Auth at the top.** The host gate in `proxy.ts` enforces "admin host only," not "signed in." `getServerSession` is the load-bearing check.
2. **Audit after stream.** The audit row is written after the stream closes. A transport failure midway through the response should not produce an `AuditLog` entry that says "successful export of N rows" when the client received nothing.
3. **No-store cache.** The response body contains PII; explicitly forbid downstream caches.

```ts
// app/api/admin/registrations/export/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const PAGE = 500;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.adminUserId || !session.user.active) {
    return new NextResponse(null, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const activationId = searchParams.get("activationId");
  if (!activationId) return new NextResponse(null, { status: 400 });

  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: { id: true, slug: true },
  });
  if (!activation) return new NextResponse(null, { status: 404 });

  const actorId = session.user.adminUserId;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode("email,registeredAt,verifiedAt,boothCode,utmSource,utmMedium,utmCampaign\n")
      );

      let cursor: string | undefined;
      let rowCount = 0;

      try {
        while (true) {
          const batch = await prisma.registration.findMany({
            where: { activationId, status: "VERIFIED" },
            orderBy: { id: "asc" },
            take: PAGE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              email: true,
              registeredAt: true,
              verifiedAt: true,
              boothCode: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
            },
          });
          if (batch.length === 0) break;
          for (const r of batch) {
            controller.enqueue(
              encoder.encode(
                csvRow([
                  r.email,
                  r.registeredAt.toISOString(),
                  r.verifiedAt?.toISOString() ?? "",
                  r.boothCode ?? "",
                  r.utmSource ?? "",
                  r.utmMedium ?? "",
                  r.utmCampaign ?? "",
                ])
              )
            );
            rowCount++;
          }
          cursor = batch[batch.length - 1]?.id;
          if (batch.length < PAGE) break;
        }

        controller.close();

        // Audit AFTER stream completes so transport failures don't lie.
        await writeAuditLog({
          category: "ADMIN",
          action: "registration.export",
          actorId,
          targetType: "Activation",
          targetId: activationId,
          metadata: { rowCount, slug: activation.slug },
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${activation.slug}-registrations.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvRow(cols: string[]): string {
  return cols.map(escape).join(",") + "\n";
}

/**
 * RFC 4180 escaping: quote any field containing comma, quote, or newline,
 * and double any embedded quotes.
 */
function escape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
```

### 9.8 Audit Log Viewer

`/admin/audit` lists `AuditLog` rows in reverse-chronological order, filterable by `category`, `actor`, and `targetType`. Both ADMIN and MEMBER can view.

---

## 10. Email Provider Layer

### 10.1 Provider Interface

A thin interface so Postmark (or another provider) can be swapped in later without touching call sites.

```ts
// lib/email/provider.ts
import { resendProvider } from "./resend";

export interface EmailProvider {
  sendOtp(args: { to: string; otp: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/**
 * The active email provider for this build. Swapping to Postmark (or any
 * other provider) means changing this one line and adding the new
 * implementation file. Route handlers and every other call site MUST import
 * `emailProvider` from this file — never `sendOtpEmail` or any other helper
 * from the implementation file directly. That's how the interface stays
 * load-bearing.
 */
export const emailProvider: EmailProvider = resendProvider;
```

The `resend.ts` file uses a type-only import for `EmailProvider`, so the import cycle (`provider.ts` → `resend.ts` → `provider.ts`) is type-erased at runtime and harmless:

```ts
// lib/email/resend.ts (header)
import type { EmailProvider } from "./provider";   // type-only — no runtime cycle
```

### 10.2 Resend Implementation

Synchronous send with a 5-second timeout and one retry. Two consecutive failures return `{ ok: false }`; the calling Route Handler responds 503.

```ts
// lib/email/resend.ts
import { Resend } from "resend";
import { env } from "@/lib/env";
import { otpEmailTemplate } from "./templates/otpEmail";
import type { EmailProvider } from "./provider";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = env.EMAIL_FROM;        // e.g. "MrQ Live <noreply@mrqlive.co.uk>"
const TIMEOUT_MS = 5000;

async function sendOnce(to: string, otp: string): Promise<boolean> {
  const { html, text, subject } = otpEmailTemplate(otp);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await resend.emails.send(
      { from: FROM, to, subject, html, text },
      { signal: ctrl.signal as never }
    );
    return !res.error;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendOtpEmail(args: { to: string; otp: string }): Promise<boolean> {
  if (await sendOnce(args.to, args.otp)) return true;
  // One retry with a brief jitter to avoid hammering on a transient blip.
  await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
  return sendOnce(args.to, args.otp);
}

export const resendProvider: EmailProvider = {
  sendOtp: async ({ to, otp }) =>
    (await sendOtpEmail({ to, otp })) ? { ok: true } : { ok: false, reason: "send-failed" },
};
```

### 10.3 OTP Email Template

```ts
// lib/email/templates/otpEmail.ts
export function otpEmailTemplate(otp: string): { subject: string; html: string; text: string } {
  return {
    subject: `Your MrQ verification code is ${otp}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; font-size: 16px; color: #111;">
        <p>Your verification code:</p>
        <p style="font-size: 32px; letter-spacing: 6px; font-weight: bold;">${otp}</p>
        <p>This code expires in 10 minutes.</p>
        <p style="color: #888; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `.trim(),
    text: `Your MrQ verification code: ${otp}\nThis code expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`,
  };
}
```

### 10.4 Why Synchronous, Not Queued

Resend's send latency is typically 200–500ms. At booth scale (single-digit registrations per second at peak), a synchronous send inside `/api/register` is well within an acceptable response budget (<2s p99). The trade-off:

- **Pros of synchronous:** the participant sees the result in one round trip; no queue infrastructure; no eventual-consistency confusion ("did the email send or not?").
- **Cons:** if Resend has a latency spike or outage, the participant sees a 503. The `withRedisHealth` pattern + clear messaging on the participant page makes this acceptable.

If a future scale event requires async sends, the migration is mechanical: introduce BullMQ + a worker, swap `sendOtpEmail` for `queueOtpEmail`, and downgrade the immediate failure mode from 503 to 202 with eventual delivery.

---

## 11. Background Work

**Not applicable in Phase 1.** Email send is synchronous (§10). The retention purge (§14.1) is a one-shot script invoked by Railway's cron scheduler — not a long-lived process.

The single cron we ship in Phase 1:

```
# Railway cron schedule for retention purge.
# Runs daily at 03:00 UTC.
0 3 * * *   pnpm tsx workers/retentionPurge.ts
```

The script connects to Postgres, deletes `Registration` rows where `registeredAt < now() - 90 days` for activations whose `endsAt < now() - 90 days`, writes a single `AuditLog` row summarising what was purged, and exits. See §14.1.

---

## 12. QR Code Generation

A single helper turns a per-booth URL into a PNG buffer. Admin downloads it via a button on the activation builder's Booths tab. No external QR service.

```ts
// lib/qr/render.ts
import QRCode from "qrcode";

export async function renderBoothQrPng(opts: {
  baseUrl: string;             // e.g. "https://mrqlive.co.uk"
  activationSlug: string;
  boothCode: string;
}): Promise<Buffer> {
  const url = new URL(`/${opts.activationSlug}`, opts.baseUrl);
  url.searchParams.set("booth", opts.boothCode);
  return QRCode.toBuffer(url.toString(), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "Q",
  });
}
```

### 12.1 The tRPC Procedure

The download endpoint is a tRPC `adminProcedure` that returns `{ filename, base64 }`. **`adminProcedure`, not `memberProcedure`** — a QR encodes the activation slug, and generating one for a `DRAFT` activation reveals the slug pre-launch. If MEMBERs need it later, relax then. Returning binary through tRPC is awkward; base64 is fine for a 1024×1024 PNG (~30KB encoded — well under any payload cap).

```ts
// server/trpc/routers/booth.ts (excerpt)
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "@/server/trpc/init";
import { prisma } from "@/lib/db/prisma";
import { renderBoothQrPng } from "@/lib/qr/render";
import { env } from "@/lib/env";

export const boothRouter = router({
  // ...other booth procedures (list, add, rename, remove) live here

  getQrPng: adminProcedure
    .input(z.object({ activationId: z.string().min(1), boothCode: z.string().min(1) }))
    .query(async ({ input }): Promise<{ filename: string; base64: string }> => {
      const booth = await prisma.booth.findUnique({
        where: {
          activationId_code: {
            activationId: input.activationId,
            code: input.boothCode,
          },
        },
        select: {
          code: true,
          activation: { select: { slug: true, status: true } },
        },
      });
      if (!booth) throw new TRPCError({ code: "NOT_FOUND" });

      const png = await renderBoothQrPng({
        baseUrl: env.PUBLIC_BASE_URL,
        activationSlug: booth.activation.slug,
        boothCode: booth.code,
      });

      return {
        filename: `${booth.activation.slug}-${booth.code}.png`,
        base64: png.toString("base64"),
      };
    }),
});
```

`env.PUBLIC_BASE_URL` is the only source for the URL prefix. Do not pass `window.location.origin` from the client or read `process.env` directly here — `env` is the single channel (§1).

### 12.2 The Client Download Wrapper

```tsx
// components/shared/BoothQrButton.tsx
"use client";
import { trpc } from "@/lib/trpc/client";

interface Props {
  activationId: string;
  boothCode: string;
}

export function BoothQrButton({ activationId, boothCode }: Props) {
  const utils = trpc.useUtils();

  const onClick = async () => {
    const { filename, base64 } = await utils.booth.getQrPng.fetch({ activationId, boothCode });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Always revoke. Without revoke, the Blob is retained until the
      // document unloads — easy to forget, easy to miss in review.
      URL.revokeObjectURL(url);
    }
  };

  return (
    <button type="button" onClick={onClick} className="text-sm underline">
      Download QR
    </button>
  );
}
```

The `try`/`finally` around the `URL.revokeObjectURL` call is load-bearing: a sync error in the click handler should not leak the object URL.

---

## 13. Observability

### 13.1 Sentry

If `SENTRY_DSN` is set, Sentry initialises in `app/instrumentation.ts`:

```ts
// app/instrumentation.ts
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}
```

Sentry is **optional** in Phase 1. Without it, errors land in Railway's runtime logs only. This is acceptable for the initial ship — add the DSN once the Sentry project is provisioned.

### 13.2 Structured Logging

A thin wrapper around `console` that emits JSON lines, suitable for Railway's log aggregation:

```ts
// lib/log.ts
type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ level, event, t: new Date().toISOString(), ...fields })
  );
}
```

Call sites must never include raw email or IP. Use `emailHash` and `ipHash`. The lint rule below (§16) forbids `email` and raw IP fields in `log()` arguments via a custom ESLint rule (set up in Phase 1).

### 13.3 Health Endpoint

```ts
// app/api/health/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
```

Used by Railway's health check and any external uptime monitor.

### 13.4 What's Not Here (Versus V3)

- No PagerDuty integration.
- No Slack alert webhook.
- No alert matrix table.
- No synthetic registration check.

These are deferred. The retention purge runs unattended; if it fails the cron job's stderr lands in Railway logs and a manual re-run is the recovery. This is acceptable for Phase 1.

---

## 14. GDPR / Data Protection

### 14.0 Plaintext Email Storage in Phase 1 — Explicit Trade-off

`Registration.email` is stored plaintext. The compensating controls are:

- **Strict DB access.** Production `DATABASE_URL` is held only in Railway's secret store; the pgsql role used by the app does not have superuser. No analyst credentials.
- **HMAC-keyed dedup hash.** `Registration.emailHash` is what's used for joins / dedup / audit references — the plaintext column is read only by the export and DSAR procedures.
- **Tiered retention purge.** Registrations are deleted 90 days after the activation ends (§14.1). The window of plaintext-at-rest is bounded.

**Phase 2 work** (deferred) re-introduces AES-256-GCM at rest with key versioning and a rotation runbook. The schema migration for that is mechanical — add `emailEncrypted Bytes`, `emailKeyVersion Int`, populate, drop `email`. The interface in `lib/email/provider.ts` does not change.

This is a known compliance trade-off. Surface it to Compliance before Phase 1 ships.

### 14.1 Tiered Retention

| Data class | Retention | Mechanism |
|------------|-----------|-----------|
| `Registration` (any status) | 90 days after the parent activation's `endsAt` | Daily cron, hard delete, audited |
| `AuditLog` | 2 years from `createdAt` | Daily cron, hard delete |
| `AdminInvite`, `PasswordResetToken` (consumed or expired) | 30 days from `createdAt` | Daily cron, hard delete |
| `AdminUser` (deactivated) | Indefinite | Manual review |

```ts
// workers/retentionPurge.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

  const regResult = await prisma.registration.deleteMany({
    where: { activation: { endsAt: { lt: ninetyDaysAgo } } },
  });

  // Password tokens: hard-delete anything created more than 30 days ago,
  // regardless of consumed/expired status. We keep them around briefly for
  // post-incident forensics, but they have no business value beyond that.
  const inviteResult = await prisma.adminInvite.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo } },
  });
  const resetResult = await prisma.passwordResetToken.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo } },
  });

  const auditResult = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: twoYearsAgo } },
  });

  await prisma.auditLog.create({
    data: {
      category: "SECURITY",
      action: "retention.purge",
      metadata: {
        registrationsPurged: regResult.count,
        invitesPurged: inviteResult.count,
        resetTokensPurged: resetResult.count,
        auditLogsPurged: auditResult.count,
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ event: "retention.purge.failed", error: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 14.2 DSAR — ADMIN UI Flow

DSARs are handled through a dedicated admin page (`/admin/dsar`). ADMIN-only — MEMBER cannot view or initiate. The page accepts an email address and a free-text "request reference" field (the ticket ID from the inbound DSAR request, recorded for audit). Submission triggers `dsar.fulfil` `adminProcedure`:

1. Lowercase and validate the email (Zod).
2. Compute `emailHash` for audit reference.
3. Query all `Registration` rows where `email == lowered`, joined to their parent `Activation` for context.
4. Stream a CSV download response (same Route Handler pattern as §9.7.1, at `app/api/admin/dsar/export/route.ts`) containing: `id, email, activationName, activationSlug, status, boothCode, utmSource, utmMedium, utmCampaign, consentVersion, consentAcceptedAt, registeredAt, verifiedAt`.
5. After the stream completes, write `AuditLog` (`category = "SECURITY"`, `action = "dsar.fulfilled"`, `metadata = { emailHash, requestRef, rowCount }`).
6. The CSV is delivered to the data subject via a Compliance-approved channel by the ADMIN (out-of-band — the system does not send DSAR responses by email).

If zero rows match, the page surfaces "No registrations found for this email" and still writes an audit row (`metadata.rowCount = 0`). This makes "the system was searched" provable even when the search returned nothing.

The right-to-rectification leg of GDPR is not in scope — registrations capture only email, booth, and UTM parameters, none of which the system meaningfully "rectifies" (the system records what the participant submitted at registration time; correcting it post hoc would invalidate the audit trail).

### 14.3 Right to Erasure — ADMIN UI Flow

Erasure requests are handled through `/admin/erasure`. ADMIN-only — MEMBER cannot view or initiate. The page is **two-step**: search by email first to surface what would be erased, then confirm with a typed phrase before the deletion fires. The typed-phrase confirmation pattern matches §7.3.

Step 1 — `erasure.preview` `adminProcedure`:
- Input: email, request reference.
- Returns: count of matching `Registration` rows, list of activation names they belong to (no row-level data on screen — only the count and activations, to limit casual exposure of PII to whoever's at the keyboard).

Step 2 — `erasure.fulfil` `adminProcedure`:
- Input: email, request reference, typed phrase `ERASE PARTICIPANT DATA`, free-text reason.
- Inside `prisma.$transaction(async (tx) => ...)`:
  - Compute `emailHash` and the count of matching rows (server-side, so the client cannot lie about it).
  - Write `AuditLog` (`category = "SECURITY"`, `action = "erasure.fulfilled"`, `actorId = session.user.adminUserId`, `metadata = { emailHash, requestRef, reason, rowCount }`, `tx`). The audit row goes in **first** so a post-erasure audit query can confirm the action even if the deletion's metadata is the only surviving evidence.
  - `tx.registration.deleteMany({ where: { email: lowered } })`.
- Return `{ rowCount }` to the client. The success page shows "{N} registration(s) erased" and the request reference for the operator's records.

If zero rows match, step 2 still proceeds and writes an audit row with `rowCount = 0` plus `metadata.note = "no_rows_matched"`. This is intentional: a malicious or mistaken erasure request that finds nothing should still be logged — auditors care about attempts, not just successes.

The erasure operation does **not** cascade to `AuditLog` rows referencing the participant by `emailHash`. Audit log retention is governed by §14.1's two-year window; erasing the audit trail of an erasure would defeat the audit log's purpose. The legal basis is GDPR Art. 17(3)(e) — retention for "legal claims" — which permits keeping audit metadata after erasing the underlying personal data, provided the metadata itself isn't personal data (which is why we hash, not store the email, in audit metadata).

### 14.4 Encryption Keys (Non-Rotating, Phase 1)

The HMAC keys used in Phase 1 are non-rotating:

- `EMAIL_HASH_HMAC_KEY` — used for `Registration.emailHash`. Non-rotating because every existing row's hash is fixed; rotating the key invalidates dedup.
- `IP_HMAC_KEY` — used for `ipHash`, `userAgentHash`. Non-rotating for the same reason.
- `OTP_HMAC_KEY` — used for `otpHash` in Redis. Effectively non-rotating because OTPs have a 10-minute TTL — a key rotation would invalidate any in-flight OTPs but no durable data.
- `PENDING_TOKEN_SECRET` — used to sign pending tokens. Effectively non-rotating; a rotation invalidates in-flight registration→verify hops, which is recoverable (participants retry registration).
- `INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY` — keyed-hash for the password-set tokens (§7.7.1). Effectively non-rotating in steady state but **safe to rotate after an incident**: invalidates all in-flight invites/resets, which the issuing ADMIN re-issues from the user-management page. Use distinct keys (not one shared key with domain separation) so a token of one class cannot be accepted as the other.

Document each as non-rotating in the env-var notes (§15). When Phase 2 introduces email encryption, only `EMAIL_ENCRYPTION_KEY` will be a rotating key.

---

## 15. Environment Variables

All variables are validated by `lib/env.ts` at boot. A missing variable crashes the process before serving traffic.

```ts
// lib/env.ts
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database & Redis
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // NextAuth
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),         // e.g. "mrq.com"

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),                      // e.g. "MrQ Live <noreply@mrqlive.co.uk>"

  // Auth
  ALLOWED_EMAIL_DOMAIN: z.string().min(3),            // "mrq.com" — applied to BOTH SSO and password sign-in

  // Crypto (HMAC, all non-rotating in Phase 1)
  EMAIL_HASH_HMAC_KEY: z.string().min(32),            // hex or base64; 32+ chars
  IP_HMAC_KEY: z.string().min(32),
  OTP_HMAC_KEY: z.string().min(32),
  PENDING_TOKEN_SECRET: z.string().min(32),
  INVITE_TOKEN_HMAC_KEY: z.string().min(32),
  RESET_TOKEN_HMAC_KEY: z.string().min(32),

  // Hosts
  PARTICIPANT_HOST: z.string().min(1),                // "mrqlive.co.uk"
  ADMIN_HOST: z.string().min(1),                      // "admin.mrqlive.co.uk"
  PUBLIC_BASE_URL: z.string().url(),                  // "https://mrqlive.co.uk"

  // Bootstrap
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),

  // Observability (optional)
  SENTRY_DSN: z.string().url().optional(),
});

export const env = Schema.parse(process.env);
```

| Variable | Surface | Notes |
|----------|---------|-------|
| `DATABASE_URL` | app + cron | Railway-provided |
| `REDIS_URL` | app | Railway-provided |
| `NEXTAUTH_URL` | app | `https://admin.mrqlive.co.uk` in prod |
| `NEXTAUTH_SECRET` | app | rotate alongside any session compromise |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | app | from Google Workspace OAuth |
| `GOOGLE_WORKSPACE_DOMAIN` | app | restricts SSO to your workspace |
| `RESEND_API_KEY` | app | rotate on any team-member offboarding |
| `EMAIL_FROM` | app | sending domain must be verified in Resend |
| `ALLOWED_EMAIL_DOMAIN` | app | typically `mrq.com`; applies to BOTH SSO and password sign-in |
| `EMAIL_HASH_HMAC_KEY` | app | non-rotating (rotation invalidates dedup) |
| `IP_HMAC_KEY` | app | non-rotating |
| `OTP_HMAC_KEY` | app | effectively non-rotating (10-min TTL) |
| `PENDING_TOKEN_SECRET` | app | rotation invalidates in-flight tokens; safe to rotate |
| `INVITE_TOKEN_HMAC_KEY` | app | rotation invalidates in-flight invites; recoverable (re-issue) |
| `RESET_TOKEN_HMAC_KEY` | app | rotation invalidates in-flight resets; recoverable (re-request) |
| `PARTICIPANT_HOST` / `ADMIN_HOST` | app | used by `proxy.ts` |
| `PUBLIC_BASE_URL` | app | used by QR generation |
| `BOOTSTRAP_ADMIN_EMAIL` | seed | one-shot; can be removed after first deploy |
| `SENTRY_DSN` | app | optional |

A `.env.example` mirrors this table with placeholder values.

---

## 16. What NOT to Do

| Don't do | Because | Do this instead |
|----------|---------|-----------------|
| Use `as Type` for casting | Type assertions disable the type system silently | Use `satisfies Type`, write a guard, or fix the upstream type |
| Throw raw strings | Lose stack traces, can't be matched by `instanceof` | `throw new Error("…")` or a custom subclass |
| Catch and swallow errors | Hides bugs in prod | Re-throw or log structured + propagate |
| Read `process.env.X` directly | Bypasses Zod validation; new vars don't get added to §15 | Read from `env` (`lib/env.ts`); add new vars to the Zod schema in the same change |
| Branch `/api/register` response on internal state | Creates an enumeration oracle (§8.6) | Always 202 `{ pendingToken }` for valid input; handle internally |
| Compare OTP with `===` or with unequal-length buffers | Timing attacks; `timingSafeEqual` throws on length mismatch | Hash the submission, length-check buffers, then `timingSafeEqual` |
| Log `email` directly | PII in logs is a breach | Log `emailHash` only; the lint rule in §13.2 forbids `email`, `ip` fields in `log()` calls |
| Add `theme.extend` to `tailwind.config.ts` | Tailwind v4 handles tokens via `@theme inline` in CSS | Add design tokens to `globals.css` (§3.3) |
| Import `lucide-react` directly | Couples icon set to feature code; bundle size creep | Import via `<DynamicIcon name="…" />` |
| Use a barrel `index.ts` for re-exports | Hides the source of a symbol; breaks tree-shaking | Import from the file that defines the symbol |
| Run `prisma migrate dev` against a database with real data | Generates a migration but applies it directly — irreversible | Use `--create-only` first, review SQL, then `migrate deploy` |
| Skip `withRedisHealth` for new participant routes | A downed Redis hangs the request and may leak partial state | Wrap every participant Route Handler with `withRedisHealth` |
| Add a tRPC procedure for participant flow | Participant must have opaque HTTP responses; tRPC's wire format leaks structure | Use a Route Handler |
| Trust `X-Forwarded-For` outside the edge | The header is client-controllable | Take the first segment only; rely on Railway's edge to set it correctly |
| Implement an in-process rate limit fallback | Multi-instance deployments make in-process state lie | If Redis is unavailable, return 503 — never silently allow-through |
| Edit `Activation.consentVersion` directly | The field is a SHA-256 of `consentNotice` and is recomputed by tRPC on save | Don't write to it from app code; let the procedure recompute it |
| Import `sendOtpEmail` (or any other helper) directly from `lib/email/resend.ts` | Bypasses the `EmailProvider` interface; swapping providers becomes a multi-file change | Import `emailProvider` from `lib/email/provider.ts` and call `emailProvider.sendOtp(...)` |
| Sort object keys with `localeCompare` in any function that feeds a hash | Locale-sensitive sort breaks `consentVersion` determinism across environments | Use codepoint comparison (`a < b ? -1 : a > b ? 1 : 0`) — see §18 |
| Change `sameSite` on the session cookie from `strict` to `lax` (or `none`) | Strict same-site is the load-bearing CSRF defence for tRPC mutations (§7.6); relaxing it opens a path to CSRF that no other layer in Phase 1 catches | Leave at `strict`. If a flow seems to require `lax`, the flow is wrong (or needs a security review) — not the cookie |
| Use `latest`, `*`, or `>=` in `package.json` for any production dependency | Silently picks up breaking majors. The NextAuth v4-vs-v5 break is the immediate landmine; others are latent | Caret-pin majors per §4.5. Renovate/Dependabot surfaces bumps as PRs |
| Store a password in any column other than `AdminUser.passwordHash`, or use any algorithm other than bcrypt cost 12 | Mixed storage breaks the rotation/audit story; weak algorithms break compromise resistance | bcrypt cost 12 via `lib/auth/password.ts`; `passwordHash` column only |
| Store a raw invite or reset token | Database leak compromises every active link | Store `tokenHash = HMAC(raw, key)` (§7.7.1); never persist the raw |
| Reuse a single HMAC key for both invite and reset tokens | An attacker who obtained a leaked invite hash could replay it as a reset (or vice versa) at the lookup layer | Distinct keys (`INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY`); per-class lookup |
| Branch the forgot-password response on whether the email exists | Creates an account-enumeration oracle | Always return the same shape; only do work if the email matches an active user (§7.7.3) |
| Log a raw invite/reset URL or its token | Makes the link as good as a credential to anyone with log read access | Log only `subjectId` and `tokenId`, never the URL or raw token |

---

## 17. Phased Implementation Plan

> **Before Phase 1.** Read this entire document end-to-end before writing any code. Confirm the §1 constitution is internalised — these rules are non-negotiable across every phase. Surface any ambiguities or conflicts you spot before beginning Phase 1; it's cheaper to clarify upfront than to refactor at a checkpoint. Each phase below has a pre-flight checklist, an implementation list, a verification checklist, an effort estimate, and a checkpoint gate. Stop at every checkpoint. Do not begin Phase N+1 without explicit human approval phrased exactly as `Phase [N] approved — begin Phase [N+1]`.

### Phase 1 — Foundation & Infrastructure

**Effort:** 0.5 day.

**Goal.** Working Next.js skeleton on Railway, env validation, observability scaffolding, no features.

**Pre-flight:**
- [ ] §4 prerequisites confirmed (Railway project, domains, OAuth, Resend)
- [ ] Local Postgres + Redis running

**Implementation:**
- Next.js 16 (App Router) project initialised; TypeScript strict, ESLint, Prettier
- `proxy.ts` placeholder exporting a function named `proxy` (no-op, returns `NextResponse.next()`)
- `lib/env.ts` with Zod schema covering all variables in §15
- Tailwind v4 configured per §3.3; `tailwind.config.ts` minimal (NO theme block)
- `components/ui/` populated with required shadcn primitives + `DynamicIcon`
- `types/next-auth.d.ts` module augmentation per §7.1 (referenced from `tsconfig.json` includes)
- Sentry initialised conditionally on `SENTRY_DSN`
- Health endpoint `/api/health` (DB + Redis ping)
- Empty `(participant)` and `(admin)` route group layouts
- `.env.example` covering every variable
- `public/robots.txt` with `User-agent: *` / `Disallow: /` (§8.1 rationale)
- `pnpm dev`, `pnpm build` pass; deploy to Railway staging succeeds

**Verification:**
- [ ] `pnpm typecheck` clean (verifies module augmentation file is picked up)
- [ ] `pnpm lint` clean
- [ ] App boots on staging
- [ ] `/api/health` returns 200 with both DB and Redis reachable
- [ ] Sentry captures a forced test error (if `SENTRY_DSN` set)
- [ ] No `process.env` access outside `lib/env.ts`
- [ ] `tailwind.config.ts` has no `theme` block
- [ ] `proxy.ts` exports a function named `proxy` (not `middleware`)

**Sections to internalise:** §1, §2, §3, §4, §15, §16.

**Checkpoint:** `Phase 1 approved — begin Phase 2`

---

### Phase 2 — Schema, Redis, HMAC Primitives

**Effort:** 1 day.

**Goal.** Database schema in place, HMAC primitives ready and unit-tested, Redis client wired, seed creates bootstrap admin.

**Pre-flight:**
- [ ] Phase 1 approved

**Implementation:**
- `prisma/schema.prisma` per §5.1
- Initial migration generated and reviewed (`migrate dev --create-only`)
- `lib/db/prisma.ts` singleton (§5.5)
- `lib/redis/client.ts` singleton with strict bounds (§8.8)
- `lib/redis/health.ts` — `withRedisHealth` wrapper
- `lib/crypto/hmac.ts` — three helpers (`hmac.email`, `hmac.ip`, `hmac.otp`) each keyed off a different env var
- `lib/otp/issue.ts`, `lib/otp/verify.ts`, `lib/otp/pendingToken.ts`
- `prisma/seed.ts` per §5.6
- Vitest suite: `lib/crypto/__tests__/hmac.test.ts` (deterministic output, key separation), `lib/otp/__tests__/issue-verify.test.ts` (round trip, attempt counter, TTL behaviour using a real local Redis), `lib/otp/__tests__/pendingToken.test.ts` (sign/verify, tamper rejection)

**Verification:**
- [ ] Migrations apply cleanly to a fresh DB
- [ ] Vitest suites pass; coverage of `lib/crypto/*.ts` and `lib/otp/*.ts` ≥ 90%
- [ ] `hmac.email("Foo@Bar.com")` and `hmac.email("FOO@BAR.COM")` produce identical hex output (case-insensitivity invariant — load-bearing for dedup)
- [ ] `hmac.email`, `hmac.ip`, `hmac.otp` produce different output for the same input (key-separation invariant)
- [ ] `withRedisHealth` returns 503 with `Retry-After` when Redis ping is forced to fail (kill the docker container in test)
- [ ] Bootstrap seed creates exactly one ADMIN row, idempotent on re-run
- [ ] `pnpm tsx workers/retentionPurge.ts` runs against an empty DB and exits 0

**Sections to internalise:** §5, §8.7, §8.8, §14.0, §14.4.

**Checkpoint:** `Phase 2 approved — begin Phase 3`

---

### Phase 3 — Auth (SSO + Credentials, Invite, Forgot-Password)

**Effort:** 2.5 days.

**Goal.** Both auth methods working end-to-end. ADMIN can invite a new user; invitee can set a password and sign in. Existing user can request and consume a forgot-password reset. Stale / deactivated sessions refused. Role-aware tRPC procedures in place. No admin pages yet beyond the auth surface and a placeholder home.

**Pre-flight:**
- [ ] Phase 2 approved
- [ ] Google OAuth credentials in env
- [ ] `INVITE_TOKEN_HMAC_KEY` and `RESET_TOKEN_HMAC_KEY` provisioned

**Implementation:**
- `lib/auth/options.ts` per §7.1 (full file: Google + Credentials + signIn/jwt/session callbacks + dummy bcrypt hash for constant-ish work)
- `lib/auth/tokens.ts` per §7.7.1 (mintRawToken, hashToken with class separation)
- `lib/auth/password.ts` (bcrypt hash with cost 12, verify, strength check ≥12 chars)
- Update `prisma/seed.ts` per §5.6 (mint a bootstrap invite token, print URL)
- `lib/email/provider.ts` extended per §7.7.7 (sendInvite, sendPasswordReset)
- `lib/email/templates/inviteEmail.ts`, `passwordResetEmail.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/(admin)/auth/signin/page.tsx` — tabs/segmented control: "Email + password" (default) and "Sign in with Google"
- `app/(admin)/auth/forgot-password/page.tsx`
- `app/(admin)/auth/set-password/page.tsx` — handles both `?type=invite` and `?type=reset` (§7.7.5)
- `lib/auth/requireRole.ts` (server-side helper)
- `components/admin/RequireRole.tsx` (client-side affordance)
- `server/trpc/init.ts` — context, transformer, error formatter
- `server/trpc/procedures.ts` — `memberProcedure`, `adminProcedure` (with stale-session refusal per §6.2)
- `server/trpc/routers/user.ts` — `me` query; `invite` adminProcedure (§7.7.2); `list`, `deactivate`, `resetIssuedByAdmin` adminProcedures
- `server/trpc/routers/auth.ts` — `validateInvite`, `consumeInvite`, `requestPasswordReset`, `validateReset`, `consumePasswordReset` (all `publicProcedure`)
- `server/trpc/root.ts` with `user` and `auth` routers
- `app/api/trpc/[trpc]/route.ts` (tRPC handler)
- Update `proxy.ts`: route `/api/auth/*` and `/api/trpc/*` to admin host only; gate `/auth/*` admin pages
- Tiny `(admin)/page.tsx` placeholder protected by `requireRole("ANY")` rendering `signed in as: {email} ({role}) [signed in via {method}]`
- Vitest suite: `lib/auth/__tests__/tokens.test.ts` (class separation: invite token hashed with reset key MUST NOT match invite-key hash); `lib/auth/__tests__/password.test.ts` (bcrypt round trip, strength enforcement); enumeration-oracle test for `requestPasswordReset` (response identical for existent vs non-existent email)

**Verification:**
- [ ] Sign-in via Google with an `@mrq.com` AdminUser succeeds; sign-in via Google with an `@gmail.com` account is denied
- [ ] Sign-in via email+password with the correct password succeeds; wrong password is denied (and timing is comparable to wrong-email — `time` 10 attempts of each, p50 within 50ms)
- [ ] Sign-in via email+password with an email outside `@mrq.com` is denied at the provider boundary (CredentialsProvider returns null)
- [ ] After admin row is set `active=false`, the next tRPC call returns UNAUTHORIZED
- [ ] `__Host-mrq.session-token` cookie present, `Secure`, `HttpOnly`, `SameSite=Strict`
- [ ] Invite flow: ADMIN invites a new email; invite email arrives in Resend test inbox; clicking the link lands on `/auth/set-password?type=invite&token=...`; setting a password then signing in with that password succeeds
- [ ] Re-issuing an invite while the first is unconsumed: the first link returns "expired or already used"; only the second works
- [ ] Forgot-password flow: requesting reset for a real email sends an email; requesting for a non-existent email returns the same response shape (no enumeration); consuming the reset link sets a new password
- [ ] Set-password page rejects passwords <12 chars
- [ ] Audit log contains rows for: `user.invited`, `user.invite.consumed`, `user.password.reset.requested`, `user.password.reset.consumed`, `user.signed_in` (with `method`)
- [ ] Calling `/api/auth/*` on the participant host returns 404
- [ ] Calling `/api/trpc/*` on the participant host returns 404
- [ ] `pnpm typecheck` clean (verifies the next-auth module augmentation)

**Sections to internalise:** §6, §7 (entire), §16.

**Checkpoint:** `Phase 3 approved — begin Phase 4A`

---

### Phase 4A — Activation CRUD + Tiptap Builder + Booth Management

**Effort:** 1.25 days.

**Goal.** ADMIN can create, edit, and list activations. Tiptap editor works for content and consent notice with the correct allowlists. `consentVersion` recomputed on every save. Booths managed inline. MEMBER can list and view but not edit. **No status transitions yet** — those land in Phase 4B.

**Pre-flight:**
- [ ] Phase 3 approved

**Implementation:**
- `lib/tiptap/allowlists.ts`, `lib/tiptap/validate.ts`, `lib/tiptap/consentVersion.ts` per §9.2 / §9.3
- `lib/tiptap/render.ts` — server-side renderer (Tiptap's `generateHTML`)
- `components/admin/TiptapEditor.tsx` — controlled component, accepts allowlist prop
- `lib/audit/writeAuditLog.ts` per §9.5.1 (full file, including the optional `tx` parameter — `tx` is unused in 4A but lands here so 4B can wire it without churn)
- `server/trpc/routers/activation.ts` — `list`, `get`, `create`, `update`, `delete` only (NOT `transitionStatus`). Mutations are `adminProcedure`; queries are `memberProcedure`. `create` and `update` recompute `consentVersion` server-side and validate both Tiptap docs against their allowlists. Each mutation writes an `AuditLog` row using `writeAuditLog` (no `tx` — these are not part of a larger transaction).
- `server/trpc/routers/booth.ts` — `list`, `add`, `rename`, `remove` (all `adminProcedure`). Audit rows written via `writeAuditLog`.
- `app/(admin)/page.tsx` — activation list (replaces Phase 3 placeholder)
- `app/(admin)/activations/new/page.tsx`, `app/(admin)/activations/[id]/edit/page.tsx`
- `components/admin/ActivationForm.tsx` — tabs (Header, Content, Consent, Booths, Branding); explicit save button; the status field is **read-only display** in 4A (transition dialog comes in 4B)
- `components/admin/RegistrationsTable.tsx` placeholder (real data in Phase 7)

**Verification:**
- [ ] ADMIN can create an activation; reserved-slug list rejects `admin`, `api`, `auth`, etc.
- [ ] Editing the consent notice and saving recomputes `consentVersion` (visible diff in DB) and clears `legalApproved`
- [ ] `legalApproved` cannot be set to `true` from a MEMBER session
- [ ] MEMBER can navigate to an activation edit page and read fields, but mutations return FORBIDDEN
- [ ] Tiptap content with a disallowed node (e.g. `code_block`) is rejected by the validator with a structured error
- [ ] Tiptap consent notice with a disallowed node (e.g. `image`, which is allowed in content but not consent) is rejected — confirms the two-allowlist split actually works
- [ ] Booth `(activationId, code)` uniqueness enforced; duplicate add throws and surfaces a friendly error
- [ ] Each create/update/delete on Activation and Booth writes one `AuditLog` row with the correct `action` string and `actorId`
- [ ] `consentVersion` is byte-identical for the same Tiptap doc across two save round-trips (catches any drift in `canonicalStringify`)

**Sections to internalise:** §9.1–§9.4, §9.5.1, §6, §7.

**Checkpoint:** `Phase 4A approved — begin Phase 4B`

---

### Phase 4B — Status State Machine + Typed-Phrase Confirmations + Audit Atomicity

**Effort:** 1.25 days.

**Goal.** Status transitions implemented per §9.5, with typed-phrase confirmations for sensitive transitions and atomic status-update-plus-audit-row commits. The split exists because Tiptap allowlist correctness (4A) is exactly the kind of "done" that's subtly broken; an early checkpoint catches it before the state machine work compounds on top.

**Pre-flight:**
- [ ] Phase 4A approved

**Implementation:**
- `server/trpc/routers/activation.ts` — add `transitionStatus` (`adminProcedure`). Enforces the §9.5 transition matrix, requires the typed phrase + reason for sensitive transitions (§7.3), and writes the status update plus `AuditLog` row inside a single `prisma.$transaction(async (tx) => ...)`. The audit row is written via `writeAuditLog({ ..., tx })` — the `tx` parameter is the load-bearing detail.
- `server/trpc/routers/activation.ts` — add `setLegalApproved` (`adminProcedure`); writes audit row, no transition needed (legal approval is a flag toggle, not a status change).
- Status transition dialog component — typed-phrase input (validates client-side to enable the submit button, re-validates server-side), reason `<textarea>` (max 500 chars, Zod-checked), confirm button.
- `ActivationForm.tsx` — wire the dialog to a "Change status" button. Disable transitions whose `from` doesn't match current status. Disable `DRAFT → SCHEDULED` when `legalApproved !== true`.
- A small failure-injection test: deliberately throw inside the transaction after the status update; verify both rows are absent (the activation status is still the prior value AND no audit row is created).

**Verification:**
- [ ] DRAFT → SCHEDULED requires `legalApproved`; the UI button is disabled otherwise; server also refuses if a client somehow bypasses
- [ ] `ENDED → LIVE` requires the typed phrase `ROLLBACK ENDED` and a non-empty reason; missing or wrong phrase is refused with a 400-equivalent error
- [ ] Each typed-phrase action surfaces both client-side disable AND server-side rejection — drop the client check temporarily and verify the server catches it
- [ ] All seven transitions documented in §9.5 work end-to-end with the correct gate
- [ ] **Atomicity test:** force an error after the status update inside the transaction; verify the activation status reverts and no `AuditLog` row exists for that attempt
- [ ] Each successful transition produces exactly one `AuditLog` row with `action = "activation.status.<from>.<to>"`, the actor, and the reason in `metadata.reason`
- [ ] Reverse transitions (DRAFT ← SCHEDULED, SCHEDULED ← LIVE, LIVE ← ENDED, SCHEDULED ← ENDED) are MEMBER-forbidden and ADMIN-only with typed phrase

**Sections to internalise:** §9.5 (entire), §7.3, §6.2.

**Checkpoint:** `Phase 4B approved — begin Phase 5`

---

### Phase 5 — Participant Landing + `/api/register` (Sync Resend)

**Effort:** 2 days.

**Goal.** A LIVE activation is reachable on the participant host. Participants can land, accept consent, submit email, and receive an OTP via Resend. Rate limits enforced. Response shape opaque per §8.6.

**Pre-flight:**
- [ ] Phase 4B approved
- [ ] Resend sending domain verified

**Implementation:**
- Update `proxy.ts` to enable participant routes per §8.1 (full implementation)
- `lib/email/provider.ts`, `lib/email/resend.ts`, `lib/email/templates/otpEmail.ts` per §10
- `lib/rateLimit/fixedWindow.ts` per §3.6
- `app/(participant)/[activationSlug]/page.tsx` per §8.2
- `components/participant/RegistrationForm.tsx` per §8.3
- `components/participant/ConsentBlock.tsx` per §8.4
- `app/api/register/route.ts` per §8.6 (full handler)
- `app/(participant)/[activationSlug]/ended/page.tsx` (terminal state for ENDED activations)
- Participant `error.tsx` (catches and renders a generic friendly error)

**Verification:**
- [ ] Submitting a valid email against a LIVE activation returns 202 with `pendingToken`; a Resend test inbox receives the email
- [ ] Submitting against a DRAFT activation returns 202 with a noop pendingToken (no email sent)
- [ ] Submitting against an ENDED activation redirects to `/<slug>/ended` (the page-level redirect, not the API)
- [ ] Submitting with a stale `consentVersion` returns 202 with a noop token
- [ ] Submitting twice from the same email + activation does not duplicate the row (upsert)
- [ ] Per-IP rate limit (30/min): the 31st request in a minute returns 429
- [ ] Per-email + activation rate limit (5/10min): the 6th request in 10 minutes returns 429
- [ ] Resend forced to fail twice → 503 returned; no Registration row left in PENDING with no OTP (verify via DB inspection)
- [ ] Cross-host attempt: POSTing to `/api/register` on the admin host returns 404

**Sections to internalise:** §8, §10, §16.

**Checkpoint:** `Phase 5 approved — begin Phase 6`

---

### Phase 6 — `/api/verify` + Mobile UX + Offline + Smoke Test

**Effort:** 1.5 days.

**Goal.** Participant can complete the verify step, including on mobile with autofill and brief connection loss. End-to-end happy path passes a Playwright smoke test.

**Pre-flight:**
- [ ] Phase 5 approved

**Implementation:**
- `app/api/verify/route.ts` per §8.7 (full handler with `timingSafeEqual` length check)
- `app/(participant)/[activationSlug]/verify/page.tsx`
- `components/participant/OtpInput.tsx` (six-digit input, one-time-code autocomplete, paste handling)
- Offline handling per §8.5 — `online`/`offline` event listeners, queued submit
- `app/(participant)/[activationSlug]/success/page.tsx`
- `app/(participant)/[activationSlug]/expired/page.tsx`
- Playwright smoke test: register → read OTP from a Resend webhook stub (or a dev-only `lib/email/devProvider.ts` swapped in via `NODE_ENV === "test"`) → verify → land on success
- Vitest test for `/api/verify`: shape parity (wrong code, expired token, missing token all return identical 400 `{ ok: false }`)

**Verification:**
- [ ] Happy path Playwright smoke passes against staging
- [ ] Wrong OTP returns 400 `{ ok: false }`; same shape as expired/missing token
- [ ] After 5 wrong attempts, a 6th submit (even with the correct code) returns 400; the Redis key is gone
- [ ] After successful verify, `Registration.status = "VERIFIED"` and `verifiedAt` set
- [ ] After successful verify, the Redis OTP key is deleted (subsequent verify with same token returns 400)
- [ ] On airplane-mode toggle during verify entry, banner appears; on reconnect the queued submit fires
- [ ] iOS Safari autofills the OTP from the email subject line (manual test)

**Sections to internalise:** §8.5, §8.7.

**Checkpoint:** `Phase 6 approved — begin Phase 7`

---

### Phase 7 — Dashboard, Live Counter, Registrations Table, CSV Export, QR Download, Audit Viewer

**Effort:** 1.5 days.

**Goal.** Admin/MEMBER can see registrations land in real time, browse them, export CSV, generate booth QR codes, and read the audit log.

**Pre-flight:**
- [ ] Phase 6 approved

**Implementation:**
- `server/trpc/routers/registration.ts` — `liveCount` (§9.6), `list` with cursor pagination
- `app/api/admin/registrations/export/route.ts` — streaming CSV export per §9.7.1 (admin-host only, session-checked, audited after stream completes)
- `server/trpc/routers/audit.ts` — `list` with filters (`category`, `actorId`, `targetType`)
- `app/(admin)/dashboard/[activationId]/page.tsx` — header (activation name + status), `LiveCounter`, `RegistrationsTable`, "Download CSV" button
- `components/admin/LiveCounter.tsx` — polling client component (10s interval)
- `components/admin/RegistrationsTable.tsx` — server-paginated table
- `lib/qr/render.ts` per §12; `components/shared/BoothQrButton.tsx` (admin-only, downloads PNG)
- `app/(admin)/admin/audit/page.tsx` — list view with filters

**Verification:**
- [ ] Two browser windows: in window A submit a registration; within ~10s window B's `LiveCounter` increments (after verify)
- [ ] CSV export contains the columns named in §9.7 in the exact order; opens cleanly in Numbers/Excel
- [ ] CSV export is callable by both ADMIN and MEMBER
- [ ] Each successful CSV export writes one `AuditLog` row with `action = "registration.export"` and `metadata.rowCount` matching the actual row count
- [ ] CSV export against an unauthenticated session returns 401 (verify the host gate alone does not let it through)
- [ ] QR PNG download produces a scannable image whose URL includes the correct `?booth=<code>`
- [ ] Audit log shows the activation status transitions performed in Phase 4B verification, with the typed-phrase reasons

**Sections to internalise:** §9.6–§9.8, §12.

**Checkpoint:** `Phase 7 approved — begin Phase 8`

---

### Phase 8 — Compliance UI (DSAR + Erasure), Retention Purge, Production Cutover

**Effort:** 1.5 days.

**Goal.** ADMIN-only DSAR and erasure flows live in the UI per §14.2 / §14.3, with full audit trail. Cron-driven retention purge live in staging. Production cutover plan executed.

**Pre-flight:**
- [ ] Phase 7 approved

**Implementation:**
- `server/trpc/routers/compliance.ts` — `dsar.preview`, `erasure.preview`, `erasure.fulfil` (all `adminProcedure`). Each writes the appropriate audit row.
- `app/api/admin/dsar/export/route.ts` — streaming CSV per §14.2 (same Route Handler pattern as §9.7.1; admin-host only, session + ADMIN role checked, audited after stream)
- `app/(admin)/admin/dsar/page.tsx` — search + export form, request-reference field, audit summary on result
- `app/(admin)/admin/erasure/page.tsx` — two-step (preview → typed-phrase confirm with reason); typed phrase `ERASE PARTICIPANT DATA`
- `workers/retentionPurge.ts` per §14.1 (already drafted in Phase 2; review, ship)
- Railway cron schedule configured per §11
- Operations runbook (`docs/RUNBOOK.md`):
  - DSAR procedure (UI walkthrough — the system-of-record is the UI now, not SQL)
  - Erasure procedure (UI walkthrough, including the typed phrase)
  - Resend rotation procedure
  - HMAC key rotation procedure (note: dedup-affecting rotations require a re-hash migration)
  - Sign-out-all-admins procedure (rotate `NEXTAUTH_SECRET`)
  - Bootstrap admin recovery (re-run seed for a fresh invite link)
- Production deploy on `mrqlive.co.uk` and `admin.mrqlive.co.uk`
- Smoke test against production (single test activation, register-and-verify path, then erase the test data via the UI to rehearse the flow)

**Verification:**
- [ ] DSAR page is ADMIN-only; MEMBER attempting to load it gets redirected
- [ ] DSAR search for a real registration returns the row; export streams a CSV with the §14.2 columns
- [ ] DSAR for an email with zero matches still writes an audit row with `rowCount = 0`
- [ ] Erasure preview is read-only — the actual delete only fires after the typed phrase + reason
- [ ] Erasure with the wrong typed phrase is server-rejected (drop the client check temporarily and verify)
- [ ] Erasure transaction atomicity: force an error after the audit insert; verify both the audit row and the registration deletion are rolled back
- [ ] Cron triggers retention purge against staging on the next 03:00 UTC; an `AuditLog` row records the run
- [ ] Production smoke test passes; the test registration is erased via the UI and the audit chain is intact
- [ ] All §15 env vars present on production; none on production are dev placeholders

**Sections to internalise:** §11, §14 (entire).

**Checkpoint:** `Phase 8 approved — build complete`

---

### Aggregate Effort

| Phase | Days |
|-------|------|
| 1 | 0.5 |
| 2 | 1.0 |
| 3 | 2.5 |
| 4A | 1.25 |
| 4B | 1.25 |
| 5 | 2.0 |
| 6 | 1.5 |
| 7 | 1.5 |
| 8 | 1.5 |
| **Total** | **~13 days sequential single-engineer** |

---

## 18. Known Gotchas & TypeScript Notes

### Next.js 16 specifics

- **`proxy.ts`, not `middleware.ts`.** The export is `function proxy`, not `function middleware`. Wrong name compiles silently and never runs.
- **Async request APIs.** `params`, `searchParams`, `cookies()`, `headers()` all return Promises. Pages must `await params` and `await searchParams`. The route-handler signatures in §8.6 / §8.7 use `async (req: Request) => …` and read headers from `req.headers` directly (synchronous), so they don't trip this; but pages do.
- **`unstable_cache` is per-replica.** Cache invalidations via `revalidateTag` only invalidate the replica that handled the call. For Phase 1 this is acceptable because the cache TTL is 60s and activations don't change often; if Phase 2 introduces edits that must propagate immediately, switch to `revalidateTag` + a longer manual TTL or move to Redis.

### NextAuth + TypeScript

- **Module augmentation file is required, not optional.** `types/next-auth.d.ts` (§7.1) must be in `tsconfig.json`'s `include`. Without it, the `jwt`/`session` callbacks cannot typecheck under strict mode and the AI agent will reach for `as any`. Add the file before the callbacks.
- **`jwt` callback runs on every request.** It refreshes role/active. This is the load-bearing piece for "deactivated user can't keep using their session" — don't move the `findUnique` out of `jwt` into `signIn` only.

### Prisma

- **`upsert` + unique index = race-safe.** `/api/register` uses `upsert` on `(activationId, emailHash)`. The unique index in §5.1 makes the upsert atomic; the `P2002` catch in §8.6 is a defence-in-depth for the rare gap.
- **`prisma migrate dev` against a database with real data is destructive.** Always `--create-only` in environments with data; review SQL; then deploy via `migrate deploy`.

### Redis / ioredis

- **App-facing Redis client must fail fast.** `maxRetriesPerRequest: 2`, `enableOfflineQueue: false`, `commandTimeout: 1000`. Without these, `withRedisHealth` cannot actually catch a downed Redis — the underlying client will hang for minutes by default.
- **`HSET` of multiple fields needs the object form in ioredis 5+.** `redis.hset(key, { otpHash, attempts: "0" })` not `redis.hset(key, "otpHash", h, "attempts", "0")` (both work but the object form is the canonical 5.x style).
- **TTL doesn't refresh on `HINCRBY`.** Incrementing the attempts counter does not extend the key's TTL — desired behaviour (the OTP expires 10 minutes from issue regardless).

### Crypto

- **`timingSafeEqual` throws on length mismatch.** Always pre-check buffer lengths and treat unequal lengths as a verify failure (§8.7). Throwing leaks a 500 error to the participant; returning a uniform 400 keeps the response shape opaque.
- **`randomInt(0, 1_000_000)` yields 0–999999, padded to 6 digits.** Don't use `Math.random()` for OTPs; it is not cryptographically secure.
- **`String.prototype.localeCompare` without an explicit locale is locale-sensitive.** Never use it inside any function whose output must be byte-identical across environments — including the canonical key sort in `lib/tiptap/consentVersion.ts` (§9.3). The same Tiptap doc can produce different `consentVersion` hashes on a Railway worker (POSIX), a Mac (`en-US.UTF-8`), and a Linux box with a `de-DE` locale. Use codepoint comparison (`a < b ? -1 : a > b ? 1 : 0`) instead. The bug is silent: registrations submit a `consentVersion` from one environment and hit a no-op response (§8.6) on another.

### Tailwind v4

- **No `theme.extend`.** Tailwind v4 reads design tokens from `@theme inline` in CSS. Adding `theme.extend.colors` to `tailwind.config.ts` does not error but does not work either — the tokens silently don't apply.
- **shadcn components reference CSS variables.** When installing a shadcn component, verify it points to the variable names defined in `globals.css` (e.g. `var(--color-primary)`), not to Tailwind classes that don't exist in v4.

### Tiptap

- **The schema validator must run before save.** Without it, a hostile or buggy admin client could persist a tree containing nodes the renderer doesn't know about, and the participant page would either render nothing or throw. The validator is in §9.2 and runs in the create / update tRPC procedure.
- **`generateHTML` requires extensions.** The server-side renderer in `lib/tiptap/render.ts` must be configured with the same extension set as the editor or text marks will be silently dropped.

### Resend

- **Sending domain must be verified before any email lands.** A test send against an unverified domain returns 200 from the API but the email is dropped. Verify in Resend's dashboard during Phase 5 pre-flight.
- **Resend's `signal` typing is loose.** The cast to `signal: ctrl.signal as never` in §10.2 reflects current Resend SDK typings; remove the cast when it's tightened.

### Railway

- **Build vs deploy command.** Migrations belong in the deploy command (`pnpm prisma migrate deploy && next start`), not the build command. Running migrations at build time would run them against whatever database is configured at build, which is not necessarily production.
- **Cron jobs are sibling services.** Configure the retention purge as a Railway cron via the dashboard; it spins up a fresh container per run, executes, and exits. Don't try to run cron from inside the Next.js process.

### General

- **Never trust `X-Forwarded-For` outside the edge.** Take the first segment only. Railway's edge layer normalises this header before it reaches the app.
- **Cache invalidation across replicas.** Activation status transitions on the admin host don't auto-invalidate the participant host's cached landing page. The 60s TTL in §8.2 is the bound; for transitions that must propagate immediately (e.g. emergency `LIVE → ENDED`), the admin UI surfaces a "this may take up to a minute to take effect" tooltip.
- **British English slips.** AI agents have a strong bias toward American English. Watch for `color`, `behavior`, `analyze`, `organize` slipping into copy and comments. The lint config flags these in non-CSS contexts.

---

*End of master prompt.*

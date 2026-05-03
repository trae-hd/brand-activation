# MrQ Live Activation Platform (Lite) — Phase 1: Foundation & Infrastructure

You are the builder for the **MrQ Live Activation Platform (Lite)**. Begin Phase 1.

---

## Operating context

Read these documents before writing any code:

1. **`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V4.md`** — the constitution. Single source of truth for architecture, schema, security posture, and phase scope.
2. **`MRQ_LIVE_ACTIVATION_LITE_EXECUTION_TEMPLATE.md`** — your operating manual. Re-read at the start of every phase.
3. **The source spec at `MRQ_LIVE_ACTIVATION_MASTER_PROMPT_V3.md`** — for context only. The master prompt overrides it where they differ. You will rarely need to reference this.

Confirm in your first message that you have read items 1 and 2.

---

## Phase 1 scope (verbatim from §17 of the master prompt)

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

## Phase 1 dependencies — sections to internalise

Beyond the universal must-read list in the execution template (§1, §2, §3.2, §4.5, §15, §16, §17, §18), Phase 1 specifically depends on:

- **§1 — System Instructions & Behavioural Rules.** Every rule here applies to every line of Phase 1 code. Pay particular attention to: `process.env` carve-out (only `prisma/seed.ts` and `app/instrumentation.ts`), `proxy.ts` rename for Next.js 16, Tailwind v4 token rules.
- **§2.4 — Architectural Posture** and **§2.5 — Railway Service Count.** Three Railway resources only (`activation-app`, `postgres`, `redis`). Do not provision a worker.
- **§3.1 — Railway Topology.** Service names must match.
- **§3.2 — Application Folder Structure.** Every file you create lands at the path the structure specifies. No drift.
- **§3.3 — Tailwind v4 CSS Configuration.** Tokens in `app/globals.css` under `@theme inline`. `tailwind.config.ts` is content paths + plugins only.
- **§3.4 — Component Library Conventions.** shadcn primitives via `pnpm dlx shadcn@latest add`, `DynamicIcon` is the only icon entry point.
- **§3.5 — Future-Portability Conventions.** Use `@/...` paths via tsconfig — they're a single sed away from `@workspace/...` if a future relocation is desired.
- **§4 — Prerequisites & Pre-Build Gates** (entire). All five procurement gates in §4.1 must be satisfied before Phase 1 starts.
- **§4.5 — Library Version Pinning.** Caret-pin all majors. NextAuth must be `^4.24.0`, never v5/Auth.js.
- **§7.1 (just the module-augmentation block).** `types/next-auth.d.ts` lands in Phase 1 even though the auth callbacks won't be wired until Phase 3 — without the augmentation file, future strict-mode typechecks against the §7.1 callbacks fail.
- **§13.1 — Sentry, §13.3 — Health Endpoint.** Sentry is optional (skipped if `SENTRY_DSN` is unset). Health endpoint pings both DB and Redis.
- **§15 — Environment Variables** (entire schema). Every var must be in `lib/env.ts` and `.env.example` even if Phase 1 doesn't use it. The full list:
  - Database & Redis: `DATABASE_URL`, `REDIS_URL`
  - NextAuth: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_WORKSPACE_DOMAIN`
  - Email: `RESEND_API_KEY`, `EMAIL_FROM`
  - Auth: `ALLOWED_EMAIL_DOMAIN`
  - Crypto: `EMAIL_HASH_HMAC_KEY`, `IP_HMAC_KEY`, `OTP_HMAC_KEY`, `PENDING_TOKEN_SECRET`, `INVITE_TOKEN_HMAC_KEY`, `RESET_TOKEN_HMAC_KEY`
  - Hosts: `PARTICIPANT_HOST`, `ADMIN_HOST`, `PUBLIC_BASE_URL`
  - Bootstrap: `BOOTSTRAP_ADMIN_EMAIL` (optional)
  - Observability: `SENTRY_DSN` (optional)
- **§16 — What NOT to Do** (entire table). Read every row.
- **§18 — Known Gotchas.** Particularly the Next.js 16 specifics (`proxy.ts` rename, async request APIs) and the Tailwind v4 "no theme.extend" rule.

---

## Authority order

When unsure, re-read the spec rather than improvising. The constitution wins over the source spec; the spec wins over training-data intuition.

If a decision isn't covered, surface a single-concern question. Do not pick a default.

---

## Output format

Produce, in this order:

1. **Confirmation** — one line confirming you've read the master prompt and execution template, plus the section list above.
2. **Plan** — bullet list of files you will create (and any you will change), one line per file. This is your read-back to me before writing.
3. **Files** — produce them. Full file contents, not diffs. No `<placeholder>` tokens — every file commit-ready.
4. **Setup commands** — exact commands to run locally and on Railway. Include `pnpm install`, env file creation, any `pnpm dlx shadcn@latest add` calls, and the Railway deploy invocation.
5. **Acceptance check** — for each verification item in §17 Phase 1 (the eight checkboxes above), state how you verified it. If a check requires the Railway environment and you can't reach it, say so explicitly and mark it "needs human verification."
6. **Open questions** — anything that wasn't fully specified, one question per concern. Do not batch unrelated questions.
7. **Stop.** Wait for the user to type the exact phrase:

> Phase 1 approved — begin Phase 2

Do not begin Phase 2 until you receive that exact phrase. Any other input from the user is feedback on Phase 1.

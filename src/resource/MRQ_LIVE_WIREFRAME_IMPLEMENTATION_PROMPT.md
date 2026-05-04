# MrQ Live — Wireframe Implementation Prompt

> **Purpose.** This document is the single source of truth for implementing the curated wireframes from the Claude Design handoff bundle (`Wireframes.html`) into the existing `mrqlive-brand-activation-tool` Next.js codebase. Hand this to any capable AI coding assistant and it will implement the designs accurately, one phase at a time, without guessing.
>
> **What this is not.** This is not a greenfield build. The codebase is structurally complete — routes, components, Prisma schema, tRPC routers, and auth all exist. This prompt is about making the UI match the wireframes. Do not restructure the folder hierarchy, rename routes, change the schema, or touch the API layer unless a phase explicitly instructs it.
>
> **Wireframe source.** The curated wireframes live in two JSX files alongside this document:
> - `wireframes-participant.jsx` — Landing, Verify OTP, Success, Edge States (mobile, phone-shell)
> - `wireframes-admin.jsx` — Sign-in, Activation List, Builder, Dashboard, Registrations, Status Transitions, Users & Roles, Audit Log, Compliance (desktop, shared PageLayout chrome)
>
> Read those files before writing any code for a given phase. They are the design spec.
>
> **Eight phases.** Each phase covers one logical surface grouping. Stop at every checkpoint. Do not proceed without human approval.

---

## Operating Rules

These rules apply to every phase without exception. Re-read this section at the start of each phase.

### Authority order

Wireframe JSX → this prompt → master prompt (`MRQ_LIVE_ACTIVATION_LITE_MASTER_PROMPT_V5.md`) → existing code.

When rules conflict, higher authority wins. When anything is ambiguous, surface a single-concern question. Do not pick a default — defaults compound silently.

### What you must not change

These zones are off-limits unless a phase explicitly authorises it:

- **Folder structure.** No new top-level directories. No relocated files. New component files land inside the existing `src/components/` tree.
- **Prisma schema.** No new models, no new columns, no migrations — unless a phase explicitly calls for it. Phase 6 adds a `reveal` audit action; that is the only schema-adjacent change.
- **tRPC routers and API routes.** UI phases do not touch the API layer. If a visual requirement exposes a missing data field, surface it as a question first.
- **Environment variables.** No new env vars without user approval. Updating `lib/env.ts` and `.env.example` together is mandatory if approved.
- **Library versions.** Do not upgrade any dependency. Especially: NextAuth v4, Tiptap v3, ioredis v5, Next.js 16.
- **The auth model.** No new roles. No new capabilities. No new token classes.

### Coding conventions (must follow)

- **British English** in all user-facing copy, comments, and audit messages. `colour`, `behaviour`, `authorised`. Exception: CSS properties, React props, and library APIs use their platform-defined names.
- **TypeScript strict mode.** No `any`. No `@ts-ignore`. Discriminated unions for status fields.
- **Server components by default.** Only `'use client'` when state, effects, refs, or event handlers are needed.
- **Tailwind v4 tokens only.** Design tokens live in `globals.css` under `@theme inline`. Never add `theme.extend` or `theme.colors` to `tailwind.config.ts`. Never write raw hex values in component files — use CSS variables or Tailwind utility classes.
- **No barrel imports.** Import from the file that defines the symbol.
- **No placeholder content.** Every file produced must be commit-ready. No `// TODO`, no `<placeholder>`, no half-implemented handlers.
- **No gambling references.** This tool registers participants for brand activations — boxing match tickets, live experiences, passes. Copy must reflect that. Remove any pre-existing gambling-adjacent wording encountered while editing.
- **Mobile-first for participant screens.** All participant pages render inside a phone-width viewport. Use Tailwind responsive prefixes (`sm:`, `md:`) only for opt-in upscaling; the base style is always mobile.
- **Desktop-first for admin screens.** Admin views use the shared PageLayout chrome already in `src/components/shared/layouts/page-layout.tsx`. Do not rebuild the shell — slot content into it.

### Output format (every phase)

Produce, in this order:

1. **Confirmation** — one line: "I have read the wireframe files and this prompt for Phase N."
2. **Plan** — bullet list of every file you will create or change, marked `[NEW]` or `[CHANGED]`. One line per file. Post this before writing any code.
3. **Files** — full file contents for every file in the plan. No diffs unless explicitly requested. No `<placeholder>` tokens.
4. **Commands** — exact shell commands the user must run to see the changes (e.g., `pnpm dev`, Prisma commands if any).
5. **Verification checklist** — each item from the phase's verification list, with a one-line statement of how you confirmed it. Items that require a live browser are marked "needs human verification."
6. **Open questions** — one question per concern. Do not batch unrelated questions. If nothing is ambiguous, write "None."
7. **Stop.** Wait for the checkpoint phrase.

### Checkpoint gate

After producing the above, **stop**. Do not begin the next phase.

Wait for the exact phrase:

> Phase [N] approved — begin Phase [N+1]

For the final phase:

> Phase 8 approved — build complete

Any other input is feedback on the current phase. Apply revisions, re-run verification, and stop again.

---

## Phase 1 — Participant: Landing & Edge States

**Effort:** 0.5 day.

**Goal.** The participant landing page matches the wireframe exactly — hero image above the form, "Pop your email in" copy, consent checkbox, "T&Cs apply" footer, no gambling references. All three edge states (Expired, Not Yet Open, Ended) render correctly.

### Files to read before starting

- `wireframes-participant.jsx` — `Landing` and `States` objects (lines 25–166)
- `src/app/(participant)/[activationSlug]/page.tsx` — existing landing page
- `src/app/(participant)/[activationSlug]/expired/page.tsx`
- `src/app/(participant)/[activationSlug]/ended/page.tsx`
- `src/components/participant/RegistrationForm.tsx`
- `src/components/participant/ConsentBlock.tsx`
- `src/app/globals.css` — existing `@theme inline` tokens

### Pre-flight

- [ ] Read `wireframes-participant.jsx` `Landing` and `States` objects in full before writing any code
- [ ] Confirm `activation.heroImageUrl` is accessible on the page's tRPC or server-side data fetch
- [ ] Confirm `activation.status === 'SCHEDULED'` is accessible at render time (for the Not Yet Open state)

### Implementation

**Landing page (`src/app/(participant)/[activationSlug]/page.tsx` + `RegistrationForm.tsx`):**
- Hero image block at the top of the phone shell — rendered from `activation.heroImageUrl`. If `heroImageUrl` is null, collapse the block gracefully (no broken image placeholder).
- Activation title as `h1` (from Tiptap-rendered `activation.content` heading, or a direct `name` field if content is not yet authored).
- Body copy: "Pop your email in. We'll send a code." — this is fixed UI copy, not editable.
- Email input labelled "Email", type `email`, autocomplete `email`.
- Consent row: checkbox + "I'm 18+ and accept the [consent notice]" where `[consent notice]` is a link that opens the `ConsentBlock` inline or as a modal. The checkbox must be required before the form submits.
- Primary CTA button: "Send me a code" — full width.
- Footer small print: "T&Cs apply." — no more, no less. Remove any existing gambling-adjacent copy.
- Layout is mobile-first, max-width `sm` (≈ 390px), centred on larger screens.

**Not Yet Open state (new — on the same slug page):**
- When `activation.status === 'SCHEDULED'` and `activation.startsAt` is in the future, render a "Doors aren't open yet" screen instead of the registration form.
- Show the opening time formatted as `OPENS · DD MMM · HH:mm BST` (Europe/London, using `date-fns`).
- Headline: "Doors aren't open yet."
- Body: "Pop back at [time] — or drop your email and we'll text you the moment it opens." *(The notify-me email capture is display-only for now — a `<input>` + "Notify me" button that shows a "Thanks, we'll let you know" message client-side. No backend wiring in Phase 1. Surface this as an open question.)*

**Expired state (`src/app/(participant)/[activationSlug]/expired/page.tsx`):**
- Apologetic tone: "Code expired" as the heading, styled with a warm/warning colour.
- Body: "10 minutes is short — sorry. Want a new one?"
- Email input (pre-filled from query param `email` if present) labelled "EMAIL".
- Primary CTA: "Send a fresh code" — posts back to `/api/register` with the activation slug.
- Secondary link: "Or change email — typo? happens."

**Ended state (`src/app/(participant)/[activationSlug]/ended/page.tsx`):**
- Muted/ghost card styling.
- Headline: "This event has wrapped."
- Body: "Catch the next one — find us at mrq.com/live."
- No form, no CTA — this is a terminal state.

### Verification

- [ ] Landing renders with hero image when `heroImageUrl` is set
- [ ] Landing renders without broken placeholder when `heroImageUrl` is null
- [ ] Consent checkbox blocks form submission when unchecked
- [ ] "T&Cs apply." is the only small print (no gambling copy)
- [ ] `SCHEDULED` activation shows "Doors aren't open yet" — **needs human verification**
- [ ] `LIVE` activation shows the registration form — **needs human verification**
- [ ] `ENDED` activation shows the ended state — **needs human verification**
- [ ] Expired page shows warm/warning heading and re-send form
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 1 approved — begin Phase 2

---

## Phase 2 — Participant: OTP Verify & Success

**Effort:** 0.5 day.

**Goal.** The OTP verify page uses the countdown timer as its visual hero. The success page tells the user to check their email.

### Files to read before starting

- `wireframes-participant.jsx` — `Verify` and `Success` objects (lines 64–124)
- `src/app/(participant)/[activationSlug]/verify/page.tsx`
- `src/app/(participant)/[activationSlug]/success/page.tsx`
- `src/components/participant/OtpInput.tsx`

### Pre-flight

- [ ] Read `wireframes-participant.jsx` `Verify` and `Success` objects in full
- [ ] Confirm `input-otp` library is installed (`pnpm list input-otp`)
- [ ] Confirm the OTP TTL (in seconds) is available as a constant in `lib/otp/issue.ts` or equivalent, so the countdown starts at the correct value

### Implementation

**Verify page (`src/app/(participant)/[activationSlug]/verify/page.tsx` + `OtpInput.tsx`):**

The page is a client component (countdown timer requires `useState` + `useEffect`).

- **Countdown timer as visual hero** — large display type (e.g. `text-5xl font-mono`), centred. Format: `MM:SS`. Counts down from the OTP TTL (typically 10:00). When it reaches 0:00, disable the input slots and show an inline message: "Code expired — request a new one." with a link back to the landing page.
- **Six OTP input slots** — centred below the timer, using the existing `input-otp` component. On mobile, trigger the numeric keyboard (`inputMode="numeric"`). Auto-submit when all six digits are entered.
- **Helper copy** below the slots: "Check your email — including spam. Code is 6 digits." — centred, muted text.
- **Action row** below the copy (centred, gap between items):
  - "Resend" — accent colour link; on click, posts to `/api/register` with the original email + activation slug. Resets the countdown.
  - "Wrong email?" — muted link; navigates back to the landing page.
- **Verify button** — "Verify", full width, primary variant. Disabled until 6 digits are entered (auto-submit handles the happy path, but keep the button for accessibility).
- Remove any existing layout that doesn't match the wireframe.

**Success page (`src/app/(participant)/[activationSlug]/success/page.tsx`):**
- **Accent filled circle with checkmark** — `✓` inside a filled circle, `text-[--accent]` or equivalent token, `w-20 h-20`, centred, `rounded-full`.
- **Headline:** "You're in." — large, centred.
- **Sub-copy:** "Confirmation on the way." — muted, centred.
- **Info box** (soft background card) below the headline:
  - 📩 emoji + "We've emailed your registration confirmation. Open it to see what happens next."
- **Primary CTA button** — "Check your email", full width. This is a display button — it has no href for now (an email deep-link would be device-specific and unreliable). Surface as an open question.
- **Secondary link** below the button — "Didn't get it? Resend" where "Resend" is an accent link that posts to `/api/register`.

### Verification

- [ ] Countdown timer starts at 10:00 (or the configured TTL) on page load — **needs human verification**
- [ ] Timer reaches 0:00 and disables inputs — **needs human verification**
- [ ] Six slots auto-submit on completion — **needs human verification**
- [ ] "Resend" resets the countdown — **needs human verification**
- [ ] Success page shows checkmark circle, "You're in.", info box, "Check your email" button
- [ ] No "Open MrQ" or gambling-adjacent copy on the success page
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 2 approved — begin Phase 3

---

## Phase 3 — Admin Chrome & Sign-in

**Effort:** 0.5 day.

**Goal.** The shared admin shell (PageLayout + AppSidebar + site-header) matches the wireframe chrome exactly. The sign-in page is a centred card with Google SSO as the primary action.

### Files to read before starting

- `wireframes-admin.jsx` — `Shell` component (lines 6–83) and `Signin` object (lines 85–112)
- `src/components/shared/layouts/page-layout.tsx`
- `src/components/shared/app-sidebar.tsx`
- `src/components/shared/site-header.tsx`
- `src/config/MainNavigationMenuItems.ts`
- `src/config/SecondaryNavigationMenuItems.ts`
- `src/app/(admin)/auth/signin/page.tsx`

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `Shell` component in full
- [ ] Map the wireframe nav groups to the existing nav config files — confirm they match:
  - `OPERATIONS` → Activations
  - `OBSERVABILITY` → Audit Log
  - `ADMINISTRATION` → Users & Roles
  - `COMPLIANCE` → Data Subject Requests, Erasure Requests
- [ ] Confirm the header brand mark reads "HQ / MrQ Live · Admin" in the existing component

### Implementation

**Admin chrome (align existing components to wireframe):**

Compare `wireframes-admin.jsx` `Shell` with the existing `page-layout.tsx`, `app-sidebar.tsx`, and `site-header.tsx`. Make targeted corrections only — do not rewrite components that already match. Expected corrections:

- Sidebar nav groups: confirm the four groups (`OPERATIONS`, `OBSERVABILITY`, `ADMINISTRATION`, `COMPLIANCE`) are present with the correct items and icons. Add any missing items.
- Secondary nav items at the bottom of the sidebar: Settings (⚙), Help (?), Feedback (💬).
- Header left: command icon `⌘` + brand block (`HQ` / `MrQ Live · Admin`).
- Header right: moon/dark-mode toggle + user avatar initials.
- Breadcrumbs: confirm they render under the header, above the page content, in the `PageLayout` slot.

**Sign-in page (`src/app/(admin)/auth/signin/page.tsx`):**

The sign-in page is pre-auth — no sidebar, no header. Centred on the viewport.

- **Card** — narrow (max-width ~400px), centred vertically and horizontally, white/paper background.
- **Brand block** inside the card:
  - `HQ` in large bold
  - `MrQ Live · Admin` in muted smaller text
- **Heading:** "Sign in"
- **Sub-copy:** "@mrq.com only."
- **Primary CTA button** (full width): "Continue with Google" — this triggers the NextAuth Google provider.
- **Divider:** a horizontal rule with centred "or" label.
- **Email input** (label: "Email") + **Password input** (label: "Password").
- **Footer row:** "Forgot password?" link (left) + "Sign in" soft button (right).
- No PageLayout chrome on this page (pre-auth).

**Forgot password page (`src/app/(admin)/auth/forgot-password/page.tsx`):**
- Same centred card pattern as sign-in.
- Headline: "Reset password"
- Sub-copy: "We'll send a reset link to your @mrq.com address."
- Email input + "Send reset link" button.
- Back link: "← Back to sign in".

### Verification

- [ ] All four sidebar nav groups render with correct items and icons — **needs human verification**
- [ ] Secondary nav items (Settings, Help, Feedback) appear at the sidebar bottom — **needs human verification**
- [ ] Breadcrumbs render on all admin pages — **needs human verification**
- [ ] Sign-in card is centred with no sidebar/header chrome — **needs human verification**
- [ ] "Continue with Google" is visually primary — **needs human verification**
- [ ] No gambling-adjacent copy on any admin auth page
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 3 approved — begin Phase 4

---

## Phase 4 — Admin: Activation List & Builder

**Effort:** 1 day.

**Goal.** The activation list has status filter pills and the verified/pending/booth count columns. The activation builder has a two-pane layout with a sticky live mobile preview on the right.

### Files to read before starting

- `wireframes-admin.jsx` — `ActList` object (lines 114–162) and `Builder` object (lines 164–247)
- `src/app/(admin)/page.tsx` — activation list page
- `src/app/(admin)/activations/new/page.tsx`
- `src/app/(admin)/activations/[id]/edit/page.tsx`
- `src/components/admin/ActivationForm.tsx`
- `src/server/trpc/routers/activation.ts` — to understand what data the list query returns

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `ActList` and `Builder` objects in full
- [ ] Confirm the activation list tRPC query returns: `name`, `slug`, `status`, booth count, verified registration count, pending registration count, `startsAt`, `endsAt`
- [ ] If any of the above counts are missing from the query, surface as an open question before building — do not add them silently

### Implementation

**Activation list (`src/app/(admin)/page.tsx`):**

- **Page heading:** "Activations" with a "+ New activation" primary button right-aligned.
- **Filter pill row** (below the heading):
  - Pills: All · Live · Scheduled · Draft · Ended
  - Active pill is filled/accented; inactive pills are outlined.
  - Clicking a pill filters the list client-side (or triggers a new tRPC call — prefer client-side filter on the already-loaded set if the list is small).
  - Search input right-aligned in the same row: placeholder "🔍 search…", filters by name or slug.
- **Table columns:** Name (bold) · Slug (monospace) · Status (pill) · Booths · Verified · Pending · Window (formatted date range) · Edit link (ADMIN role only — use `RequireRole`).
- **Status pills:** colour-coded — LIVE (green/accent), SCHEDULED (blue), DRAFT (muted), ENDED (grey).
- **Window column** format: `DD MMM · HH:mm–HH:mm` (Europe/London).

**Activation builder (`src/components/admin/ActivationForm.tsx` and the edit/new pages):**

Layout changes to a **two-pane** structure:

- **Left pane** (flex 1.4): the existing form fields, in this order:
  1. Page heading (activation name) + Save/Cancel buttons right-aligned
  2. Status pill + "last edited N ago by email@mrq.com" muted text
  3. Horizontal rule
  4. Row of three fields: Slug (read-only monospace, shows full URL) · Starts · Ends
  5. Hero image drop zone — `drop image · 2:1 ratio`, dashed border, height ~110px. On file select, show a preview thumbnail.
  6. Marketing copy Tiptap editor — labelled "Marketing copy (loose Tiptap allowlist)"
  7. Consent notice Tiptap editor — labelled "Consent notice (tight allowlist · ADMIN only)", restricted to ADMIN role via `RequireRole`
  8. Booths panel — labelled "Booths". Each booth row shows: `code` (monospace) · scan count · QR download button. "+ Add booth" ghost button at the bottom.
  9. Horizontal rule
  10. "Legal approved" checkbox row — "required to go LIVE · ADMIN only", restricted via `RequireRole`

- **Right pane** (width 280px, `position: sticky`, `top: 20px`):
  - Label: "PREVIEW · /[slug]"
  - A phone-shell preview (scaled down, ~220px wide) showing a simplified version of the participant landing page. Updates live as the form changes (use `watch` from `react-hook-form` or equivalent to feed the preview).
  - Pill toggle below the preview: "Mobile" (active) · "Desktop" (inactive, no-op for Phase 4 — desktop preview is a future enhancement, surface as open question).

### Verification

- [ ] Filter pills filter the list to the correct status subset — **needs human verification**
- [ ] Search filters by name and slug — **needs human verification**
- [ ] Verified, Pending, and Booth count columns render correctly — **needs human verification**
- [ ] Edit link is hidden for MEMBER role users — **needs human verification**
- [ ] Builder renders in two-pane layout on desktop — **needs human verification**
- [ ] Live preview updates when the title or content changes — **needs human verification**
- [ ] Hero image drop zone shows a thumbnail after file selection — **needs human verification**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 4 approved — begin Phase 5

---

## Phase 5 — Admin: Live Dashboard

**Effort:** 0.5 day.

**Goal.** The live dashboard shows four KPI tiles, a 60-minute verification sparkline, and a per-booth bar chart.

### Files to read before starting

- `wireframes-admin.jsx` — `Dashboard` object (lines 249–302)
- `src/app/(admin)/dashboard/[activationId]/page.tsx`
- `src/components/admin/LiveCounter.tsx`
- `src/server/trpc/routers/registration.ts` — to understand available data
- `src/server/trpc/routers/booth.ts`

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `Dashboard` object in full
- [ ] Confirm the tRPC layer can return: total verified count, pending count, scan count (from Booth records or Registration.boothCode), drop-off rate (scans vs verified), per-booth verified count, and a time-series of verifications per minute for the last 60 minutes
- [ ] If any of the above are not available, surface as an open question — do not invent new tRPC procedures without asking

### Implementation

**Dashboard page (`src/app/(admin)/dashboard/[activationId]/page.tsx`):**

Replace the existing layout with:

- **Page header row:**
  - Left: label "DASHBOARD · LIVE" (small caps, muted) + activation name as `h2`
  - Right: status pill — e.g. `● LIVE · 4h 12m left` (green dot, formatted time remaining)

- **Four KPI tiles** (equal-width row, gap 12):
  - Verified — count + "+N last 5m" sub-label
  - Pending — count + "avg Xs to verify" sub-label
  - Scans — count + "across N booths" sub-label
  - Drop-off — percentage + "scan→verify" sub-label
  - Each tile: thin-bordered card, label in small caps, count in large display type, sub-label in muted small text.

- **Charts row** (below KPI tiles, gap 12):
  - Left chart (flex 2): "Verifications · last 60m" — area sparkline using Recharts `AreaChart`. X-axis: time (minute ticks). Y-axis: verification count. Accent colour fill with 12% opacity, accent stroke. Data is polled every 30 seconds via tRPC.
  - Right chart (flex 1): "By booth" — horizontal bar rows. Each row: booth code (monospace small) · filled bar (accent, width proportional to share of total) · count (monospace small). Sorted descending by count.

- **Polling.** Use `@tanstack/react-query` `refetchInterval: 30_000` on the dashboard query. Display a "last updated Xs ago" muted indicator that increments each second client-side.

### Verification

- [ ] Four KPI tiles render with correct labels and sub-labels — **needs human verification**
- [ ] Sparkline renders with accent colour — **needs human verification**
- [ ] Booth bar chart renders sorted by count — **needs human verification**
- [ ] Data refreshes every 30 seconds — **needs human verification**
- [ ] "Last updated" counter increments — **needs human verification**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 5 approved — begin Phase 6

---

## Phase 6 — Admin: Registrations Table

**Effort:** 0.5 day.

**Goal.** Registration emails are masked by default. Revealing an email writes an audit log entry. Filter pills let the admin view subsets of registrations by status.

### Files to read before starting

- `wireframes-admin.jsx` — `Regs` object (lines 304–350)
- `src/components/admin/RegistrationsTable.tsx`
- `src/server/trpc/routers/registration.ts`
- `src/lib/audit/writeAuditLog.ts`
- `src/app/(admin)/dashboard/[activationId]/page.tsx` — or wherever the registrations table is embedded

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `Regs` object in full
- [ ] Confirm `Registration.email` is returned from the tRPC registration query (it is stored plaintext in Phase 1)
- [ ] Confirm `writeAuditLog` is the correct primitive for writing the reveal audit entry — do not call `prisma.auditLog.create` directly

### Implementation

**RegistrationsTable (`src/components/admin/RegistrationsTable.tsx`):**

- **Filter pills** (above the table): All · Verified · Pending · Suppressed. Active pill filled. Right-aligned: search input "🔍 search email or hash" — filters by email substring or `emailHash` prefix (client-side on the loaded set).
- **Table columns:** Verified at · Email · Booth · UTM · IP hash · Status · Reveal.
- **Email column — masked by default.** Display the email as `j***@domain.com` (mask everything before and after the first character before the `@`, keep the domain). This masking happens client-side — the raw email is fetched but displayed masked.
- **Reveal action.** A "reveal" link in the last column. On click:
  1. Replace the masked cell with the full email address.
  2. Call a tRPC mutation (or a dedicated tRPC procedure) that writes an audit log entry with action `EMAIL_REVEAL`, `targetType: 'Registration'`, `targetId: registration.id`, and `metadata: { reason: 'admin-reveal' }`. The reveal is not gated by a reason prompt in Phase 6 — that can be a Phase 8 enhancement if desired. Surface as open question.
- **CSV download button.** Existing functionality — keep it, ensure it remains in the updated layout.
- **Pagination.** "Showing N of M. load more →" link at the bottom.
- **Status pills:** colour-coded — VERIFIED (green), PENDING (blue), EXPIRED (muted), SUPPRESSED (orange).

### Verification

- [ ] Emails appear masked by default — **needs human verification**
- [ ] Clicking "reveal" shows the full email — **needs human verification**
- [ ] Reveal writes an audit log entry (check audit log page after revealing) — **needs human verification**
- [ ] Filter pills filter by status correctly — **needs human verification**
- [ ] Search filters by masked email or hash — **needs human verification**
- [ ] CSV download still works — **needs human verification**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 6 approved — begin Phase 7

---

## Phase 7 — Admin: Status Transitions & Users & Roles

**Effort:** 0.5 day.

**Goal.** The status transition modal includes an inline preflight checklist and a slug-type-to-confirm field. The Users & Roles table shows pending invites and a role pill that acts as a dropdown for ADMIN users.

### Files to read before starting

- `wireframes-admin.jsx` — `Trans` object (lines 353–403) and `Users` object (lines 405–441)
- `src/components/admin/StatusTransitionDialog.tsx`
- `src/server/trpc/routers/activation.ts` — status transition procedure and its preflight logic
- `src/app/(admin)/admin/` — users page location

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `Trans` and `Users` objects in full
- [ ] Confirm the activation router has a preflight check (or the data to run one client-side) that returns: legal approved status, content length, consent length, booth count, Resend domain verified status
- [ ] If preflight data is missing from the router, surface as an open question — do not add tRPC procedures without asking

### Implementation

**StatusTransitionDialog (`src/components/admin/StatusTransitionDialog.tsx`):**

The existing dialog gains two new sections inside the modal card:

1. **Preflight checklist** (between the description and the confirm input):
   - Label: "PRE-FLIGHT · GO LIVE" (or the appropriate transition — adjust label per target status).
   - Each checklist item: checkbox (filled green if passing, empty if failing) · item name · sub-label with detail.
   - Checklist items for `DRAFT → LIVE`:
     - Legal approved — `jamie@mrq.com · Xm ago` (or "not yet approved" if false)
     - Marketing copy ≥ 1 paragraph — `N paragraphs` or "empty"
     - Consent notice ≥ 1 paragraph — `N paragraphs` or "empty"
     - At least 1 booth — `N booths configured` or "no booths"
     - Resend domain verified — domain string or "unverified"
   - Items where the check fails are shown with an empty checkbox and red sub-label.
   - The primary CTA button is **disabled** if any checklist item is failing.

2. **Slug-type-to-confirm field** (below the checklist):
   - Label: "Type the slug to confirm"
   - Text input. The primary CTA button remains disabled until the input value exactly matches `activation.slug`.
   - Primary CTA label: "Go LIVE in Xm" where `Xm` is the time until `activation.startsAt` if in the future, or "now" if already past.

**Users & Roles page (`src/app/(admin)/admin/` — locate the correct file):**

- **Page heading:** "Team · N active" + "+ Invite" primary button.
- **Table columns:** Name · Email · Role · Last seen · Actions (⋯ menu).
- **Role column:** a pill badge showing `ADMIN` or `MEMBER`. For the current user (ADMIN role only), the pill is clickable and opens a small popover/dropdown with "Promote to ADMIN" or "Demote to MEMBER" — requires a confirmation step before applying.
- **Pending invites** appear as table rows with: "Inv: email@mrq.com" as name, "—" as email, role as pill, "pending invite" as last seen, and a "Revoke" action in the ⋯ menu.
- MEMBER role users see the table but the role pill is not interactive and the "+ Invite" button is hidden.

### Verification

- [ ] Preflight checklist renders with correct items — **needs human verification**
- [ ] CTA is disabled when any preflight item fails — **needs human verification**
- [ ] CTA is disabled until the slug is typed correctly — **needs human verification**
- [ ] CTA label shows time until start — **needs human verification**
- [ ] Transition is written to audit log — **needs human verification**
- [ ] Users table shows pending invites — **needs human verification**
- [ ] Role pill is interactive for ADMIN role and triggers confirmation — **needs human verification**
- [ ] MEMBER role cannot see role dropdown or invite button — **needs human verification**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 7 approved — begin Phase 8

---

## Phase 8 — Admin: Audit Log & Compliance

**Effort:** 0.5 day.

**Goal.** The audit log has filter chips by event category. The erasure flow has a reason field and a type-to-confirm "ERASE" gate. The DSAR flow shows what data would be included in an export.

### Files to read before starting

- `wireframes-admin.jsx` — `Audit` object (lines 443–480) and `Comp` object (lines 482–520)
- `src/app/(admin)/admin/audit/page.tsx`
- `src/app/(admin)/admin/erasure/page.tsx`
- `src/app/(admin)/admin/dsar/page.tsx`
- `src/server/trpc/routers/audit.ts`
- `src/server/trpc/routers/compliance.ts`

### Pre-flight

- [ ] Read `wireframes-admin.jsx` `Audit` and `Comp` objects in full
- [ ] Confirm the audit tRPC query accepts a `category` or `action` filter parameter
- [ ] Confirm the erasure tRPC procedure accepts a `reason` string parameter and writes it to the audit log

### Implementation

**Audit Log page (`src/app/(admin)/admin/audit/page.tsx`):**

- **Page heading:** "Audit · last 7 days" (date range adjusts based on active filter).
- **Filter chip row** (horizontal scrollable on mobile):
  - Chips: All · Activation · User · Legal · Erasure · Reveal
  - Active chip is filled. Clicking a chip passes the category filter to the tRPC query.
  - Right-aligned search input: "🔍 search…" — filters by actor email or action string.
- **Table columns:** When · Actor · Action · Target · Diff (monospace, small).
- **Diff column** — shows a concise change description, e.g. `SCHEDULED → LIVE`, `false → true`, `consentNotice (-2/+4 lines)`, `reason: DSAR`.
- Rows are read-only. No actions column.

**Erasure page (`src/app/(admin)/admin/erasure/page.tsx`):**

The erasure flow is a two-step pattern: list of pending erasure requests → confirm modal.

- **Erasure list** (behind the modal in the wireframe — implement a simple table):
  - Columns: Requested at · Email (masked) · Activation · Source · Actions.
  - "Process" button per row opens the confirm modal.

- **Confirm modal:**
  - Header label: "DESTRUCTIVE" in red/critical colour.
  - Heading: "Erase 1 record"
  - Email displayed (unmasked, inside the modal only): `example@email.com` in monospace.
  - Horizontal rule.
  - Bullet list of consequences (fixed copy):
    - · delete the registration row
    - · add the email's HMAC hash to suppression
    - · write an erasure entry to audit (visible)
    - · remove from any future CSV export
  - Horizontal rule.
  - **Reason field** (required): label "Reason (required)", text input, must be non-empty before the confirm button enables. Example placeholder: "User requested · ticket #XXXX".
  - **Type-to-confirm field**: label "Type ERASE to confirm", text input. Confirm button disabled until input value is exactly `ERASE` (case-sensitive).
  - **Button row:** "Cancel" ghost button + "Erase" button in critical/red colour.
  - On confirm: call the erasure tRPC procedure with `{ registrationId, reason }`. Show a success toast and close the modal.

**DSAR page (`src/app/(admin)/admin/dsar/page.tsx`):**

- **Search form:** email input + "Look up" button.
- **Results card** (after search): shows what data exists for that email — registration records, audit entries, consent version accepted. This is a read-only preview.
- **Export button:** "Download ZIP" — triggers the existing `/api/admin/dsar/export` route.
- No destructive actions on the DSAR page — erasure is handled on the Erasure page.

### Verification

- [ ] Audit filter chips filter the table correctly — **needs human verification**
- [ ] Search filters by actor or action — **needs human verification**
- [ ] Diff column shows concise change descriptions — **needs human verification**
- [ ] Erasure confirm button is disabled until reason is filled and "ERASE" is typed — **needs human verification**
- [ ] Erasure writes reason to audit log — **needs human verification**
- [ ] DSAR search returns registration data for a known email — **needs human verification**
- [ ] DSAR ZIP download works — **needs human verification**
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean

### Checkpoint

> Phase 8 approved — build complete

---

## Appendix A — Design tokens

All tokens are defined in `src/app/globals.css` under `@theme inline`. Do not hard-code hex values in component files. Reference these CSS variables when the wireframe calls for specific colours:

| Token | Usage |
|---|---|
| `--accent` | Primary CTA buttons, active pills, countdown timer, OTP slot focus, booth bars, sparkline stroke |
| `--ink-1` | Headings, primary body text |
| `--ink-3` | Muted / helper text, sub-labels |
| `--warn` | Expired state heading, warning backgrounds |
| `--crit` | Erasure modal "DESTRUCTIVE" label, erase button background |

If any of these tokens are not present in `globals.css`, add them in Phase 3 (admin chrome) at the latest. Do not add them piecemeal — add the full set in one change and surface it in the Phase 3 open questions if the correct values are unclear.

---

## Appendix B — Copy guidelines

- No gambling references anywhere in the UI. The product registers participants for brand experiences — boxing match tickets, live event passes, festival access.
- British English throughout: "colour", "behaviour", "authorised", "organisation".
- Tone on participant screens: warm, direct, low-friction. "Pop your email in." "You're in." "Code expired — sorry."
- Tone on admin screens: professional, factual. "Legal approved." "Status transition." "Erasure request."
- Error messages: specific and actionable. Never "Something went wrong." Always tell the user what to do next.

---

## Appendix C — Phase summary

| Phase | Surface | Screens | Effort |
|---|---|---|---|
| 1 | Participant | Landing, Edge States (Expired, Not Yet Open, Ended) | 0.5 day |
| 2 | Participant | OTP Verify, Success | 0.5 day |
| 3 | Admin | Chrome alignment, Sign-in, Forgot password | 0.5 day |
| 4 | Admin | Activation List, Activation Builder | 1 day |
| 5 | Admin | Live Dashboard | 0.5 day |
| 6 | Admin | Registrations Table | 0.5 day |
| 7 | Admin | Status Transitions, Users & Roles | 0.5 day |
| 8 | Admin | Audit Log, Compliance (Erasure + DSAR) | 0.5 day |
| **Total** | | **13 screens** | **~4.5 days** |

# Invariants — code that must change together

Pairs (or groups) of code locations where modifying one without the others
creates a bug the type system won't catch. Keep this list short: anything
in here represents a real correctness risk we couldn't refactor away.
**If you can refactor an invariant out** (e.g. by deduplicating into a
single function or moving the logic behind a typed boundary), do that
and remove the entry.

Each entry has an **ID** (`INVARIANT-NNN`) so code comments can reference
it. Search the codebase for the ID to find the call sites; search this
doc for the ID to find the rationale.

---

## INVARIANT-001 · Winner-picking eligibility filter

**Files (must stay equivalent):**

- `src/server/trpc/routers/winner.ts` → `eligibilityWhere()` function (Prisma `WhereInput` for `previewEligiblePool` + the eligible-pool count inside `pickWinners`)
- `src/server/trpc/routers/winner.ts` → raw SQL `WHERE` clause inside `pickWinners`. **Appears twice in the same mutation** — once in the pool-snapshot `INSERT INTO "WinnerDrawPoolEntry" ... SELECT ... FROM "Registration" r WHERE ...` and once in the shuffle `INSERT INTO "WinnerDrawSelection" ... SELECT ... FROM "Registration" r WHERE ...`. Both must match the JS `eligibilityWhere()` exactly.

**Why duplicated:**

- The count uses Prisma's typed query builder — type safety matters when changing eligibility rules under refactor pressure.
- The shuffle needs raw SQL because the deterministic ordering relies on Postgres's `digest()` and `row_number() OVER (...)` window function. Prisma's query builder cannot express either.
- The pool-snapshot insert is also raw SQL because composing it via Prisma would force a round-trip to JS to enumerate and re-insert each ID — at scale that's slow and pointless.

**Risk if drift:**

- Most likely failure mode: a participant passes one filter but not the other. They appear in the modal's "eligible pool: N" preview but get silently excluded from the actual draw (or vice versa). Either case breaks trust in the draw — the modal said one thing, the audit log says another.
- Worst case: the count says the pool is large enough but the SELECT returns fewer rows than `winnerCount + reserveCount`. The `INSERT ... SELECT ... LIMIT` succeeds with fewer rows than expected; the draw runs short and we silently produce fewer winners than the admin requested.

**How drift is caught today:**

- Code review (rely on a reviewer noticing).
- The Phase 2 unit tests in `winner.test.ts` exercise the JS path but mock Prisma, so they don't catch SQL drift.
- Phase 6 includes a staging integration check that runs the mutation against a real Postgres and asserts the outcome matches the count — that's the first line of automated defence.

**To remove this invariant:** the cleanest path is to express the shuffle SQL as a Prisma `$queryRaw` template parameterised by a single shared filter fragment (constructed via `Prisma.sql` from a single source). That's a refactor we can do in a future iteration once Phase 2's behaviour is locked in. Don't attempt the refactor mid-feature.

---

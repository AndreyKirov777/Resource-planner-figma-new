---
title: 'Isolate Integration Tests from prisma/dev.db'
type: 'chore'
created: '2026-08-12'
status: 'done'
baseline_commit: 'c0d70aac48fe605bf5e0ff4692b13b81c67938ba'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `api.integration.test.ts` and `wbs.integration.test.ts` both import `./server`, which connects to `prisma/dev.db` — the same file a running app instance uses. `api.integration.test.ts`'s rate-card tests intentionally bulk-replace and delete-all against that table, with no isolation. This already caused real, repeated data loss today. A backup/restore band-aid was tried and rejected after adversarial review found it has its own silent-data-loss failure modes (a failed backup is indistinguishable from "table was empty," no protection against process interruption, lossy `||`-fallback round-tripping, unrestorable `importedAt`).

**Approach:** Give the whole suite a throwaway SQLite file (`prisma/test.db`), recreated fresh every `npm test` run via a Vitest `globalSetup`, seeded with 2 fake rate-card rows (2 disciplines) so `wbs.integration.test.ts`'s existing dynamic discipline-fetching keeps exercising real validation instead of the empty-card bypass. Redirect `DATABASE_URL` in the existing global `src/test/setup.ts`, before any test file's imports resolve. `api.integration.test.ts` needs no special-casing anymore — the table it mutates becomes disposable.

## Boundaries & Constraints

**Always:**
- Test DB is `prisma/test.db`, gitignored. `globalSetup` deletes it (if present) and recreates it fresh via `npx prisma db push --skip-generate` at the start of every `npm test` run — deterministic, no cross-run accumulation.
- The `db push` child process gets `DATABASE_URL` via an explicit `env` override passed to `execSync`'s options — never mutate the parent (globalSetup's own) `process.env`.
- Redirection happens in `src/test/setup.ts` (the existing global `setupFiles` entry — already runs before every test file, per-file, before that file's imports resolve) by setting `process.env.DATABASE_URL` as the first statement in the file. `server.ts`'s own `if (!process.env.DATABASE_URL)` default-setter must see it already set and back off.
- Seed exactly 2 fake `GlobalRateCard` rows spanning 2 disciplines (all 9 region rate columns are required, non-nullable `Float` — supply all of them) via a `PrismaClient` instantiated with an explicit `datasources.db.url` override, never via `process.env` mutation.
- `api.integration.test.ts` reverts to its original, unmodified form — no backup/restore logic.
- `.gitignore` gains `prisma/test.db*` (covers `-journal`/`-wal`/`-shm` siblings).

**Ask First:** If `npx prisma db push` prompts for confirmation or reports anything destructive against the freshly-deleted test file, HALT and report — shouldn't happen against a nonexistent DB, but don't auto-confirm through it.

**Never:**
- No test file or setup script touches `prisma/dev.db`, directly or indirectly — that is the entire point of this change, and must be empirically verified, not assumed.
- ~~No per-test-file DB isolation...~~ **Superseded 2026-08-12 — see Spec Change Log.** `api.integration.test.ts` and `wbs.integration.test.ts` each now get their own SQLite file (`prisma/test-api.db`, `prisma/test-wbs.db`) via `testDb.ts`. The original assumption — that the shared-file cross-file race was a rare, low-stakes flake — was empirically wrong (measured 100% reproducible, would fail CI). The shared `prisma/test.db` + `globalSetup.ts` mechanism is kept as a defense-in-depth fallback (still exercised every run) for any future test file that imports `./server` without its own isolation, but no current test file relies on it.
- ~~No change to `wbs.integration.test.ts`'s test logic — only its comment~~ **Superseded 2026-08-12.** Both integration files now switch from a static `import { app } from './server'` to `let app` assigned via `await import('./server')` inside `beforeAll`, after each file calls `isolateTestDb(name, seed?)`. This is a structural, not cosmetic, change to both files — required because ESM import hoisting means a static top-level import would resolve (and connect Prisma) before any per-file `DATABASE_URL` override could run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh `npm test` run | no `prisma/test.db` exists | created, schema synced, 2 rate-card rows seeded | — |
| Repeated `npm test` run | `prisma/test.db` exists from a prior run | deleted and recreated fresh | — |
| `api.integration.test.ts` rate-card tests | run against `prisma/test.db` | pass; mutate/wipe test.db only | — |
| `prisma/dev.db` row counts, before vs. after `npm test` | any pre-existing state | byte-for-byte identical | — |

</frozen-after-approval>

## Code Map

- `globalSetup.ts` (new, repo root) -- deletes/recreates `prisma/test.db`, runs `prisma db push`, seeds 2 fake rate-card rows. Kept as a fallback default for future test files; unused by the two current integration files after the 2026-08-12 revision below.
- `src/test/setup.ts` -- redirect `DATABASE_URL` to `prisma/test.db`, first statement, before existing jsdom mocks
- `vite.config.mts` -- wire `test.globalSetup: ['./globalSetup.ts']`
- `.gitignore` -- add `prisma/test.db*`, `prisma/test-*.db*`
- `testDb.ts` (new, repo root, added 2026-08-12) -- `isolateTestDb(name, seed?)`: deletes/recreates `prisma/test-<name>.db`, runs `prisma db push`, sets `process.env.DATABASE_URL`, optionally seeds via a caller-supplied callback
- `api.integration.test.ts` -- dynamic `import('./server')` inside `beforeAll` after `isolateTestDb('api')`; own DB, no seed needed
- `wbs.integration.test.ts` -- dynamic `import('./server')` inside `beforeAll` after `isolateTestDb('wbs', seed)`; own DB, seeded with the same 2 fake disciplines `globalSetup.ts` used to provide; docstring updated

## Tasks & Acceptance

**Execution:**
- [x] `globalSetup.ts` -- `export default async function` that: removes `prisma/test.db`(+ `-journal`/`-wal`/`-shm`) if present; runs `execSync('npx prisma db push --skip-generate', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testDbUrl } })`; opens a `PrismaClient({ datasources: { db: { url: testDbUrl } } })`, creates 2 `GlobalRateCard` rows (distinct `discipline` values, all 9 region rates supplied, `role` prefixed `"Test "` so they're unmistakably fake), disconnects -- gives every test run a clean, schema-current, minimally-seeded DB with zero manual setup
- [x] `src/test/setup.ts` -- add `process.env.DATABASE_URL = \`file:${path.resolve(process.cwd(), 'prisma', 'test.db')}\`;` as the first statement, before the existing `@testing-library/jest-dom` import -- must run before `./server`'s own default-setting `if` block in any test file that imports it
- [x] `vite.config.mts` -- add `globalSetup: ['./globalSetup.ts']` inside the existing `test: {}` block -- wires the one-time setup into the Vitest run
- [x] `.gitignore` -- add `prisma/test.db*` near the existing `prisma/dev.db` entry -- keeps the disposable file out of version control
- [x] `api.integration.test.ts` -- confirm it is byte-identical to its pre-incident committed state (the backup/restore attempt was already reverted; re-verify with `git diff`) -- superseded, see below
- [x] `wbs.integration.test.ts` -- update the docstring explaining why the "empty rate card" I/O-matrix row stays untested (lines ~18-27): reason changes from live-data-safety to shared-test-DB-race-with-`api.integration.test.ts` -- superseded, see below
- [x] **(2026-08-12)** `testDb.ts` -- new `isolateTestDb(name, seed?)` helper: delete/recreate `prisma/test-<name>.db`, `prisma db push`, set `process.env.DATABASE_URL`, optional seed callback -- one source of truth for per-file DB lifecycle, used by both integration files
- [x] **(2026-08-12)** `api.integration.test.ts` -- switch from static `import { app } from './server'` to `let app: Express` assigned via `await import('./server')` inside `beforeAll`, after `await isolateTestDb('api')` -- gives this file its own DB instead of the shared one
- [x] **(2026-08-12)** `wbs.integration.test.ts` -- same dynamic-import switch, with `isolateTestDb('wbs', seed)` seeding the same 2 fake disciplines `globalSetup.ts` used to provide; docstring rewritten (empty-card bypass is now untestable-by-design since this file's own DB is always pre-seeded, not a cross-file race concern anymore)

**Acceptance Criteria:**
- Given `prisma/dev.db`'s row counts are recorded before `npm test`, when the full suite finishes, then every table's row count is unchanged (verify via `sqlite3 prisma/dev.db "SELECT COUNT(*) FROM ..."` for `Project`, `ResourcePlan`, `Allocation`, `GlobalRateCard`, `WbsItem`, `WbsEstimate`).
- Given `prisma/test-api.db` / `prisma/test-wbs.db` do not exist, when `npm test` runs, then each is created, schema-synced, and (for `wbs`) seeded, independently of the other.
- Given `wbs.integration.test.ts` and `api.integration.test.ts` both run in the same `npm test` invocation, when the suite completes, then all tests in both files pass, deterministically — **revised 2026-08-12**: the original wording ("must not fail... in the common case... flag as defer if it still flakes intermittently") assumed the failure would be rare; review measured it at 100% (13/13 and 2/2 independent reproductions, including the exact `npx vitest run` command CI invokes). Per-file DB isolation eliminates the shared state entirely, so "intermittent" no longer applies — this AC is now a hard pass/fail, verified by 8 consecutive clean `npx vitest run` invocations (see Verification).
- Given the full suite (`npm test`), when it completes, then it is green including `readme.test.ts`.

## Spec Change Log

**2026-08-12 — Per-file DB isolation, superseding the shared-`prisma/test.db` "Never" boundary.**
Three parallel reviews (blind hunter, acceptance auditor, edge case hunter) of the original shared-DB implementation independently found the same cross-file race between `api.integration.test.ts` and `wbs.integration.test.ts`, and independently measured it as the *dominant* outcome, not an occasional flake as the frozen AC assumed:
- Acceptance auditor: 13/13 `npm test` runs failed 1-3 `wbs.integration.test.ts` assertions; one run additionally produced a `socket hang up`.
- Edge case hunter: 2/2 runs of `npx vitest run` (the literal command `.github/workflows/ci.yml` invokes) reproduced the same 3 failures; traced to `api.integration.test.ts`'s rate-card bulk-import/delete tests emptying or mutating `GlobalRateCard` mid-run while `wbs.integration.test.ts`'s `beforeAll` or discipline checks read it. Confirmed this would fail CI on this branch as originally implemented.
- Root cause: `globalSetup.ts` seeded the shared `GlobalRateCard` table once per whole `npm test` invocation, and nothing prevented the two files from mutating it concurrently (Vitest's default file parallelism).

Findings were surfaced to the human (dev.db safety itself was independently re-confirmed intact by all three — MD5 unchanged across every run). Human explicitly chose **full per-file DB isolation** over serializing test files or documenting the race as an accepted limitation — reopening the "Never: No per-test-file DB isolation... out of scope" line this spec had frozen. Implemented via `testDb.ts` (see Code Map); reverified: `npx tsc --noEmit` clean, 8 consecutive `npx vitest run` passes (19/19 files, 221/221 tests), `prisma/dev.db` MD5 (`0c8b2c357f3cff50f9785d15f9bbc940`) unchanged across all 8, and `prisma/test-api.db` / `prisma/test-wbs.db` independently inspected post-run to confirm they hold different, non-interfering data.

**2026-08-12 — Two follow-up reviews of the per-file isolation implementation itself.**
One real bug found and patched: neither integration file's `afterAll` guarded against `beforeAll` throwing before `app` was assigned, so a real `isolateTestDb` failure would surface as a confusing secondary `TypeError` from `supertest` instead of the real error. Fixed with an `if (!app) return;` guard at the top of both `afterAll` hooks. Two lower-severity, out-of-scope findings documented in `deferred-work.md` instead of fixed here — a cross-*process* (not cross-file) race if two `vitest run` invocations hit the same checkout concurrently (pre-existing pattern, not a regression, fails loud, doesn't affect this repo's single-job CI), and an unconfirmed watch-mode-only Prisma client leak. Everything else reviewers checked (process isolation model, TypeScript soundness, `execSync` concurrency between the two files, stale-file recovery, other importers of `./server`) came back clean under direct empirical testing.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no new type errors — ran clean
- `rm -f prisma/test.db* prisma/test-*.db* && npx vitest run` (run 8 times in a row) -- expected: all runs green, `prisma/test-api.db` and `prisma/test-wbs.db` present after — confirmed, 19/19 files & 221/221 tests every time
- Before/after MD5 on `prisma/dev.db` across all 8 runs -- expected: identical — confirmed, `0c8b2c357f3cff50f9785d15f9bbc940` throughout

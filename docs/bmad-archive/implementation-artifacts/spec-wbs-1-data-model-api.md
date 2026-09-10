---
title: 'WBS-1 — Data Model, API & Client Wrapper'
type: 'feature'
created: '2026-08-12'
status: 'done'
baseline_commit: '9ddd139dce8fbbd191dcd16b2cc5aaa6ca57db67'
context: ['{project-root}/docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The approved WBS & Estimate Reconciliation feature has no data model or API — there is nothing yet to persist a Work Breakdown Structure against.

**Approach:** Add `WbsItem` (self-referencing tree) and `WbsEstimate` (multi-disciplinary hours per item) Prisma models, five REST endpoints mirroring existing `ResourcePlan`/`Allocation` conventions exactly, and a `src/services/api.ts` client wrapper. UI (WBS-2) and the reconciliation engine (WBS-3) are separate slices — not in scope here.

## Boundaries & Constraints

**Always:**
- Match existing conventions exactly: `.strict()` Zod schemas in `server-validation.ts` (create schema required fields, update schema same fields all `.optional()`); routes registered above the SPA catch-all in `server.ts`; `README.md` "Endpoints" section updated per route (`readme.test.ts` is a real drift gate); three aligned field definitions across `schema.prisma` / `server-validation.ts` / `src/services/api.ts`.
- `WbsEstimate.role` defaults to `""` (empty string), never `null` — SQLite/Prisma unique constraints treat `NULL` as distinct from itself, so a nullable `role` would let duplicate discipline-only rows silently bypass `@@unique([wbsItemId, discipline, role])`.
- On write, `discipline` must be a member of the live `buildDisciplineEnum(await prisma.globalRateCard.findMany())` (`server/planner/rateCard.ts`) — **unless** the rate card is currently empty, in which case skip the check. Mirrors the same empty-rate-card guard already required for plan-role validation elsewhere in this feature; a hard enum check against an empty enum bricks every write.
- Bulk-replace of `estimates` is delete-then-recreate as two sequential Prisma calls (not `$transaction`) — matches the existing `ResourcePlan`/`Allocation` convention in `server.ts` precisely.
- `onDelete: Cascade` on `WbsItem.parentId` (self-relation) and `WbsItem → WbsEstimate` — deleting an item deletes its subtree and their estimates.
- After the schema change: `npx prisma generate && npx prisma db push`, then verify `Project`/`ResourcePlan`/`Allocation`/`GlobalRateCard` row counts are unchanged via `sqlite3 prisma/dev.db`. This is the live DB that had a same-day data-loss incident — additive-only migration, zero tolerance for row loss.

**Ask First:** If `prisma db push` reports any destructive/reset step for this migration, HALT and confirm before proceeding.

**Never:**
- No reorder endpoint, no `GET .../reconciliation`, no UI component — WBS-2/WBS-3 territory.
- No deep cycle detection on reparenting (A→B→C→A) — only reject the trivial `parentId === id` self-parent case.
- No cross-project `parentId` — if provided, it must reference a `WbsItem` with the same `projectId`, else 400.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create root item | `POST wbs-items`, no `parentId` | 201, `phaseName: null` (Unassigned) | — |
| Create with nested estimates | `POST wbs-items` with `estimates[]` | 201, item + estimates | unknown discipline → 400 |
| Self-parent | `PUT :id { parentId: <own id> }` | rejected | 400 |
| Cross-project parent | `PUT :id { parentId: <item in other project> }` | rejected | 400 |
| Replace estimates | `PUT :id/estimates [...]` | old estimates gone, new set returned | unknown discipline → 400 |
| Delete item with children | `DELETE :id` | item + subtree + their estimates gone | — |
| Empty rate card | any write carrying `discipline` | accepted unchecked | — |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- add `WbsItem`, `WbsEstimate` models after `Allocation`
- `server-validation.ts` -- `wbsItemCreateSchema`/`wbsItemUpdateSchema`, `wbsEstimateSchema` (reused in both), exported inferred types
- `server.ts` -- 5 routes above the SPA catch-all; discipline-enum check reads `GlobalRateCard` per request
- `src/services/api.ts` -- `getWbsItems`, `createWbsItem`, `updateWbsItem`, `deleteWbsItem`, `replaceWbsEstimates` + `WbsItem`/`WbsEstimate` interfaces
- `README.md` -- new `#### WBS` block under `### Endpoints`
- `server/planner/rateCard.ts` -- reused as-is (`buildDisciplineEnum`), no changes

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma` -- add `WbsItem` (self-relation `parentId`/`children`, `phaseName String?`, `displayOrder Int @default(0)`, `projectId` FK `onDelete: Cascade`) and `WbsEstimate` (`discipline String`, `role String @default("")`, `hours Float @default(0)`, `wbsItemId` FK `onDelete: Cascade`, `@@unique([wbsItemId, discipline, role])`) -- establishes the persistence shape locked in the approved proposal
- [x] `server-validation.ts` -- add `wbsEstimateSchema` (`discipline` non-empty string, `role` string default `""`, `hours` non-negative number), `wbsItemCreateSchema`/`wbsItemUpdateSchema` (`name`, `parentId` nullable int, `phaseName` nullable string, `displayOrder` int, `estimates` optional array), all `.strict()` -- enforces the write contract
- [x] `server.ts` -- add `GET /api/projects/:projectId/wbs` (flat list, `include: { estimates: true }`, ordered by `displayOrder`), `POST /api/projects/:projectId/wbs-items` (nested create if `estimates` present), `PUT /api/wbs-items/:id` (scalar fields only; validate self-parent and cross-project parent), `DELETE /api/wbs-items/:id`, `PUT /api/wbs-items/:id/estimates` (delete-then-recreate; validate `discipline` against live enum unless card empty) -- the persistence surface
- [x] `src/services/api.ts` -- add `WbsItem`/`WbsEstimate` interfaces and the five wrapper functions following the `get<Plural>`/`create<Singular>`/`update<Singular>`/`delete<Singular>` naming convention -- the only sanctioned path for UI (WBS-2) to reach this API
- [x] `README.md` -- add `#### WBS` block listing all 5 routes in the exact `` `METHOD /path` - description `` format -- keeps `readme.test.ts` green
- [x] `src/services/wbsApi.test.ts` or equivalent -- unit/integration test per Zod edge case in the I/O matrix, plus a cascade-delete assertion -- this feature's pure validation logic needs the same coverage bar as the rest of `src/utils`

**Acceptance Criteria:**
- Given an empty project, when `GET /api/projects/:id/wbs` is called, then it returns `[]` (not 404).
- Given a `WbsItem` with children and estimates, when it is deleted, then all descendant items and all estimates under the whole subtree are gone (cascade, not orphaned).
- Given the live rate card is populated, when an estimate is written with a `discipline` not in `GlobalRateCard`, then the request is rejected with 400 and no row is written.
- Given the schema migration has run, when `Project`/`ResourcePlan`/`Allocation`/`GlobalRateCard` row counts are compared before/after, then they are identical.

## Spec Change Log

- **Implementation judgment calls (2026-08-12, non-frozen sections only):**
  - `wbsItemUpdateSchema` intentionally does **not** include an `estimates` field (unlike `wbsItemCreateSchema`). The Code Map explicitly scopes `PUT /api/wbs-items/:id` to "scalar fields only," and estimates have their own dedicated bulk-replace endpoint (`PUT /api/wbs-items/:id/estimates`) — including a redundant, silently-ignored `estimates` key on the scalar-update schema would contradict that route split. This is a narrower reading than the general "create/update schemas share the same field set" convention stated in Boundaries.
  - `POST /api/projects/:projectId/wbs-items`'s `displayOrder` is **not** auto-incremented server-side (unlike `ResourcePlan` creation, which computes `maxOrder + 1`). The spec's Task bullet for this route doesn't mention that behavior, reorder endpoints are explicitly out of scope for WBS-1, and WBS-2 (UI) — the only consumer that would care about ordering — is a separate slice. Defaults to the client-supplied value or `0`.
  - The test file is `wbs.integration.test.ts` at the repo root (not `src/services/wbsApi.test.ts`) — the spec allowed "or equivalent," and nearly all of the required coverage (nested create, self-parent/cross-project-parent 400s, bulk-replace, cascade delete) is only observable via supertest against the real Express app/DB, matching `api.integration.test.ts`'s existing placement and pattern more closely than a colocated client-side unit test would.
  - The "empty rate card → any discipline accepted unchecked" I/O-matrix row is **not** covered by an integration test. This repo's tests run against the live `prisma/dev.db` (no isolated test DB), and `GlobalRateCard` holds real production rows; emptying it — even temporarily and even with a try/finally restore — was judged unsafe given the explicit same-day data-loss-incident context. The guard itself (`rows.length === 0` → skip the check) is a one-line conditional in `server.ts`'s `validWbsDisciplines`, identical in shape to the already-exercised empty-rate-card guard on `generatePlanRequestSchema`.
- **Discovered pre-existing defect (out of scope to fix here):** `api.integration.test.ts`'s "Global rate card" describe block ends by calling `DELETE /api/rate-cards`, which clears the entire live `GlobalRateCard` table with no restoration in `afterAll`. This is unconditional and independent of WBS-1 — it reproduces on a plain `npm test` run even without `wbs.integration.test.ts` present. Combined with Vitest's default cross-file concurrency, it intermittently empties the rate card while `wbs.integration.test.ts`'s discipline-enforcement assertions are mid-flight, causing 1 flaky failure in the full suite (`PUT /api/wbs-items/:id/estimates > rejects an unknown discipline...`, expects 400, observes 200 because the empty-card bypass activated). `wbs.integration.test.ts` passes 30/30 reliably in isolation against a populated rate card. Recommend a follow-up (outside WBS-1) to add rate-card backup/restore to that describe block, or move integration tests to an isolated test database.
- **Review findings, patched (2026-08-12):** three parallel reviews (blind hunter, edge case hunter, acceptance auditor) surfaced one severe and three minor issues, all fixed without touching frozen Boundaries — none required renegotiating intent:
  1. **Data-loss risk in `PUT /api/wbs-items/:id/estimates`** (edge case hunter, empirically verified): the delete-then-recreate bulk-replace has no transaction (per this endpoint's own frozen "not `$transaction`" boundary), so a payload with a duplicate `(discipline, role)` pair would let `deleteMany` succeed and `createMany` then fail on the unique constraint — permanently losing the item's prior estimates while the client sees only a 500. **Fix:** reject duplicate `(discipline, role)` pairs at the Zod layer (`refineNoDuplicateEstimatePairs` in `server-validation.ts`, applied via `.superRefine()` to both `wbsItemCreateSchema`'s nested `estimates` array and `wbsEstimatesReplaceSchema`) — the bad payload never reaches `deleteMany` at all, so the frozen "two sequential calls, not `$transaction`" boundary didn't need to change. KEEP: the delete-then-recreate mechanism itself is unchanged and still correct for its intended (deduplicated) inputs.
  2. **`PUT /api/wbs-items/:id/estimates` had no existence check** (edge case hunter + acceptance auditor, both verified live): a non-existent `:id` produced a raw Prisma `P2003`/500 instead of 404, unlike `PUT /api/wbs-items/:id` which does check first — a deviation from the frozen "matches the existing ResourcePlan/Allocation convention... precisely" boundary (that sibling pattern checks existence before mutating). **Fix:** added a `findUnique` existence check before the delete/create pair, returning 404 when absent.
  3. **`hours` accepted `Infinity`** (blind hunter + edge case hunter, verified: a JSON body of `1e400` parses to `Infinity`, and `z.number().min(0)` alone accepts it). **Fix:** `wbsEstimateSchema.hours` is now `z.number().finite().min(0)`.
  4. **`GET /api/projects/:projectId/wbs` had no ordering tiebreaker** (acceptance auditor): `orderBy: { displayOrder: 'asc' }` alone is nondeterministic among same-`displayOrder` siblings (already logged above: `displayOrder` isn't auto-incremented, so untouched siblings default to `0`), unlike the sibling `resourcePlans` query's `[{ displayOrder: 'asc' }, { id: 'asc' }]` — a deviation from the same "matches conventions precisely" boundary. **Fix:** added `{ id: 'asc' }` as the secondary sort key.
  All four fixes are covered by new tests in `wbs.integration.test.ts` (39 tests total, up from 30). Remaining findings (destructive rate-card test above, generic `parseInt`/DELETE-existence gaps shared with sibling endpoints, `phaseName` rename-cascade, error-message formatting, empty-card-bypass re-validation) were pre-existing patterns or explicitly out of WBS-1's scope — deferred to `deferred-work.md`, not patched here.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no new type errors
- `npx prisma generate && npx prisma db push` -- expected: additive only; manually diff row counts before/after via `sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Project; ..."` for the four existing tables
- `npm test` -- expected: full suite green, including `readme.test.ts`

## Suggested Review Order

**Data model**

- Self-referencing tree + multi-disciplinary estimate collection — the shape everything else builds on.
  [`schema.prisma:111`](../../../prisma/schema.prisma#L111)

- `role String @default("")`, not nullable — SQLite treats `NULL` as distinct from itself in `UNIQUE`, so a nullable role would let duplicate discipline-only rows slip past this constraint.
  [`schema.prisma:143`](../../../prisma/schema.prisma#L143)

**Validation — the data-loss fix**

- Rejects duplicate `(discipline, role)` pairs before any DB call — closes the estimates-replace data-loss path without touching the frozen "not `$transaction`" boundary.
  [`server-validation.ts:191`](../../../server-validation.ts#L191)

- `.finite()` added — plugs the `Infinity`-passes-`.min(0)` gap found in review.
  [`server-validation.ts:179`](../../../server-validation.ts#L179)

- Both the nested-create array and the bulk-replace array route through the same duplicate-pair guard.
  [`server-validation.ts:209`](../../../server-validation.ts#L209)
  [`server-validation.ts:227`](../../../server-validation.ts#L227)

**API — the 5 endpoints**

- Live discipline-enum check against `GlobalRateCard`, with the empty-card bypass so it can't brick every write before a rate card exists.
  [`server.ts:987`](../../../server.ts#L987)

- Flat list, ordered by `displayOrder` then `id` — the tiebreaker review caught missing (ties are real: `displayOrder` isn't auto-incremented on create).
  [`server.ts:996`](../../../server.ts#L996)

- Nested create with cross-project-parent and discipline guards before the write.
  [`server.ts:1010`](../../../server.ts#L1010)

- Scalar-only update; self-parent and cross-project-parent rejected before the write.
  [`server.ts:1056`](../../../server.ts#L1056)

- Cascade delete — relies entirely on the schema's `onDelete: Cascade`, no application-level fan-out.
  [`server.ts:1093`](../../../server.ts#L1093)

- Bulk-replace: existence check added in review (previously a bogus `:id` produced a raw 500, not 404) then delete-then-recreate.
  [`server.ts:1109`](../../../server.ts#L1109)
  [`server.ts:1117`](../../../server.ts#L1117)

**Client wrapper**

- `WbsItem`/`WbsEstimate` interfaces mirror the API response shape.
  [`api.ts:143`](../../../src/services/api.ts#L143)

- `createWbsItem` / `replaceWbsEstimates` — the two writes with the most invariants behind them.
  [`api.ts:457`](../../../src/services/api.ts#L457)
  [`api.ts:493`](../../../src/services/api.ts#L493)

**Peripherals**

- New `#### WBS` block — keeps `readme.test.ts`'s drift gate green.
  [`README.md:169`](../../../README.md#L169)

- Regression tests for the 4 review-driven patches: `Infinity` rejection, deterministic ordering, 404 on a bogus id, and the duplicate-pair data-loss guard (verifies the original estimate survives untouched).
  [`wbs.integration.test.ts:66`](../../../wbs.integration.test.ts#L66)
  [`wbs.integration.test.ts:249`](../../../wbs.integration.test.ts#L249)
  [`wbs.integration.test.ts:396`](../../../wbs.integration.test.ts#L396)
  [`wbs.integration.test.ts:403`](../../../wbs.integration.test.ts#L403)

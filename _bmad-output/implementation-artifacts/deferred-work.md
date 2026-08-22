# Deferred Work

Goals split out of the AI Resource Plan Generation feature
([docs/ai-resource-plan-generation-spec.md](../../docs/ai-resource-plan-generation-spec.md)).
Quick Dev run on 2026-06-30 narrowed scope to **Goal 1a — LLM seam & config**
(`spec-ai-llm-seam.md`). Goal 1 (generation backend) was further split into **1a** (current
spec) and **1b** (below). The items below are deferred and should be picked up as their own
Quick Dev specs.

## Goal 1b — Planner & generate-plan endpoint (spec §7–§10, build steps 2–3)

The resource-planner-specific generation logic. **Depends on Goal 1a's `generateStructured()` seam.**

- `server/planner/rateCard.ts` — §7.4 role taxonomy `{discipline, track, seniority}` (normalize from
  `namingInPM`, NOT the role name; ~30 curated deviation rows); role-enum builder; grouped menu;
  `resolveIntRate(rows, role, region)`. Unit test: every `prisma/client_roles.json` role classifies.
- `server/planner/schema.ts` — Zod output schema (role enum built at request time) per §7.1.
- `server/planner/prompt.ts` — selection-policy system prompt (§7.5) + grouped-menu rendering (§7.2).
- `server/planner/phases.ts` — `phaseAllocations` → `Allocation[]` expansion per period.
- `server/planner/generateResourcePlan.ts` — orchestration (§5/§8): build enum+menu → prompt →
  `generateStructured` → resolve rates, convert margin/100 (default fallback), compute `clientHourlyRate`,
  expand `count>1` to N rows, run the `server-validation.ts` gate, collect soft warnings; return
  `{draft, warnings}`; accept an injected model for tests.
- `server.ts` — `POST /api/projects/generate-plan` (modes current/new; in-memory sliding-window
  rate-limit keyed by `req.ip` → 429; empty-rate-card → 409; `NoObjectGeneratedError` → 422; provider
  errors → 502/503; honor `AbortSignal`); declared **above** the SPA catch-all. Endpoint is read-only —
  never writes to the DB.
- `server-validation.ts` — `generatePlanRequestSchema` (`.strict()`; `projectId` required when
  `mode:"current"`; `region` `z.enum` of the 9 `GlobalRateCard` columns).
- Tests: pure-function unit tests with fixture rows + an endpoint guard test (400/429) via supertest.
  **Never seed/wipe the global `GlobalRateCard` in tests** (destructive on the shared `dev.db`).
- Heads-up: the live `GlobalRateCard` is currently **empty** — a real generation needs an Excel import
  first, and `ANTHROPIC_API_KEY` in `.env`. Neither blocks the mock-model tests.

## Goal 2 — AI Assistant UI + draft preview (spec §11)

The user-facing surface. **Depends on Goal 1's `POST /api/projects/generate-plan` contract.**

- `src/components/AIAssistant.tsx` — right-docked, collapsible overlay; launcher FAB mounted once at the
  `App` root; owns chat/draft state; context-aware to `currentProject`.
- `src/components/AssistantComposer.tsx` — prompt input + region selector + send/cancel (non-streaming
  loading state with `abortSignal`).
- `src/components/AssistantReview.tsx` — in-panel control surface: `teamShape` + `selectedDisciplines`
  chips + warnings callout + append/replace selector + Accept/Regenerate/Discard.
- `src/components/ResourcePlan.tsx` — non-destructive draft-preview state (proposed rows tinted/badged,
  editable in place, per-row rationale).
- `src/App.tsx` — mount `<AIAssistant>` once at root (NO new tab).
- `src/services/api.ts` — client wrapper for `generate-plan` (the call itself; types align with Goal 1).

## Goal 3 — Transactional apply + Undo / revisions (spec §16)

The robust acceptance/persistence + undo mechanism. General-purpose ("not AI-specific" per §16.4);
Goal 2's "Accept" should route through this rather than the non-atomic per-row CRUD loop (§16.1).

- `prisma/schema.prisma` — `+ PlanRevision` model (snapshot Json; `@@index([projectId, createdAt])`);
  then `npx prisma generate` + `npx prisma db push`.
- `server.ts` — `+ POST /api/projects/:id/apply-plan` (append/replace, snapshot in a `$transaction`) and
  `+ POST /api/projects/:id/revisions/:revId/restore`.
- `server/planner/applyPlan.ts` — transactional apply (snapshot → mutate), append/replace.
- `server/planner/revisions.ts` — snapshot serialize/restore + retention pruning (~10 per project).
- `src/services/api.ts` — `+ applyPlan()`, `restoreRevision()`, `listRevisions()`.
- `src/components/AIAssistant.tsx` / `ResourcePlan.tsx` — "Plan applied — Undo" toast + History list.
- Note for `mode: "new"`: Undo is just `deleteProject` — handle in UI, don't route through `apply-plan`.

## CAP-13 — Draft plan from roadmap (frozen 2026-08-22)

Feature ships and works (`_bmad-output/specs/spec-roadmap/SPEC.md` CAP-13), but is frozen at
product's request — not a bug, not a technical blocker. The "Draft plan from roadmap" button in
the roadmap toolbar (`src/components/roadmap/Roadmap.tsx`, `openDraftPlan`) is unconditionally
`disabled` with an explanatory `title`, in place of its old `totalDemandHours(roadmapLoad) > 0`
condition. `buildDraftFromRoadmapLoad` (`src/utils/roadmapDraftPlan.ts`) and its unit tests are
untouched. To unfreeze: restore the demand-based `disabled` condition (and drop the `title`) on
the button in `Roadmap.tsx`.

## Deferred from spec-2-generate-plan-ui review (2026-06-30)

Minor issues surfaced during the Goal 2 step-04 review; not blocking, deferred for focused attention.

- **`_planningMode` prop unused** — `GeneratePlanSheet` accepts `planningMode?: string` but the prop is never read (destructured as `_planningMode`). Currently harmless (mode is always `'current'` in v1), but if future work needs to differentiate weekly/monthly in the sheet, this will need wiring.
- **O(P²) ariaLabel loop** — `AllocTimeline` builds the aria-label string with `phaseBands.slice(0, idx).reduce(...)` inside `.map()` over `phaseBands`. O(P²) in phase count; negligible at typical scale (≤10 phases) but worth fixing if plans grow larger.
- **O(weeks × allocations) bar rendering** — `AllocTimeline` uses `.find()` inside `weekNums.map()` inside `phaseBands.map()`. O(W×A) per component render; negligible for ≤52 weeks and ≤20 allocations but a `Map<periodNumber, allocation>` pre-index would be cleaner.
- **ariaLabel averaged % mismatch** — the aria-label reports the mean of snapped per-week values per phase (e.g., "38%") which may not match any individual bar's visual height. The screen-reader summary is informative but technically imprecise; consider reporting a range or predominant value instead.
- **`resolvePhases` fallback name diverges from `parsePhases`** — when no phases exist, `resolvePhases()` returns `[{ name: 'Plan', … }]` while `parsePhases` (the rest of the app) returns `[{ name: 'Phase 1', … }]`. Cosmetic divergence; align them if the fallback ever becomes user-visible.
- **Out-of-range `periodNumber` inflates ariaLabel** — `getPhaseForPeriod` maps any period beyond the last phase's end to the last phase. In the ariaLabel loop, stray out-of-range periods silently count toward the last band's `avgPct`. Not a visual bug (bar rendering uses `band.weekCount` bounds), but aria output is inaccurate for plans whose allocations exceed the declared phase timeline.

## Deferred from spec-wbs-1-data-model-api review (2026-08-12)

Findings from three parallel adversarial/edge-case/acceptance reviews of WBS-1; the
data-loss-risk finding (non-transactional estimates replace + duplicate payload) and three
other concrete bugs were patched directly (see spec's Spec Change Log). These are the
remainder — pre-existing patterns or genuinely out-of-scope, not caused by WBS-1.

- **✅ FIXED (2026-08-12, see `spec-isolate-test-database.md`):** `api.integration.test.ts`'s
  "Global rate card" tests used to destroy the live `prisma/dev.db` rate card with no
  restore. A backup/restore band-aid was tried first and rejected — adversarial review found
  it had its own silent-data-loss modes (failed backup indistinguishable from "table was
  empty," no crash protection, lossy `||`-fallback round-tripping, unrestorable
  `importedAt`). Fixed properly instead: the whole suite now runs against a disposable
  `prisma/test.db`, recreated fresh every `npm test` via a Vitest `globalSetup`. Verified
  `prisma/dev.db` is now byte-for-byte identical (MD5) before and after a full `npm test`
  run.
- **✅ FIXED (2026-08-12, see `spec-isolate-test-database.md`'s Spec Change Log):** the
  cross-file race between `api.integration.test.ts` and `wbs.integration.test.ts` over the
  shared `prisma/test.db`'s fake rate-card rows was initially scoped out as a "lower-stakes
  accepted residual." Follow-up review (3 independent reviewers) found it was actually
  deterministic — 13/13 and 2/2 reproductions, including the exact command CI runs — not
  occasional. Fixed via full per-file DB isolation (`testDb.ts`, `prisma/test-api.db` /
  `prisma/test-wbs.db`); reverified 8/8 clean `npx vitest run` passes with `prisma/dev.db`'s
  MD5 unchanged throughout.
- **`errorData.details` renders as `"[object Object]"` in thrown client errors.**
  `src/services/api.ts`'s error branches do `errorData.details || errorData.error`, but
  `details` comes from the server's `parsed.error.flatten()` — an object, not a string.
  `new Error(object)` stringifies to `[object Object]`. Pre-existing pattern (present in
  `updateResourcePlan` etc. before WBS-1 added more instances of it) — worth a shared
  fix (e.g. a `formatApiError()` helper) across all entities, not a WBS-specific patch.
- **No `parseInt` validation on route params anywhere in `server.ts`** (not just the new WBS
  routes) — a non-numeric ID produces `NaN`, Prisma rejects it, and the generic `catch`
  reports a 500 instead of a clean 400. Existing codebase-wide convention, not a WBS-1
  regression; worth a focused pass if/when this becomes a real pain point.
- **`DELETE` endpoints across the codebase (not just WBS) don't check existence before
  deleting** — a non-existent id throws Prisma P2025, caught generically as 500 instead of
  404. Confirmed as an existing pattern shared by `resource-plans`/`allocations`/
  `resource-lists` DELETE handlers, not introduced by WBS-1.
- **`POST /api/projects/:projectId/wbs-items` with a non-existent `projectId`** returns a
  generic 500 (Prisma FK violation) instead of 404. Not in the spec's I/O matrix; low
  severity; worth checking whether sibling POST endpoints (e.g. `resource-plans`) have the
  same gap before fixing WBS's in isolation.
- **`phaseName` is free text with no validation against `Project.phases` and no
  rename-cascade.** Per the WBS design (approved 2026-08-12), phase linkage is intentionally
  soft/by-name — but renaming a phase in `Project.phases` will silently orphan any
  `WbsItem.phaseName` that referenced the old name. The rename-cascade behavior was
  discussed as a locked decision during design but isn't implemented anywhere yet — likely
  belongs in WBS-2 (phase UI) or its own slice.
- **The empty-rate-card discipline-validation bypass has no re-validation pass.** WBS
  estimates written while `GlobalRateCard` is empty accept any discipline string
  unchecked (by design — see spec-wbs-1). If a rate card is imported afterward, nothing
  re-checks previously-written disciplines against it. Worth considering for WBS-3
  (reconciliation), which will need to handle "discipline doesn't match rate card" as a
  case regardless.

## Deferred from spec-isolate-test-database per-file-isolation review (2026-08-12)

Findings from two focused reviews of the per-file DB isolation fix (`testDb.ts`). The
missing-`afterAll`-guard bug (confusing secondary crash when `beforeAll` fails before `app`
is assigned) was patched directly in both integration files. These two are lower-severity
and out of scope for this story — both fail loudly (crash, not silent wrong results), never
touch `prisma/dev.db`, and don't affect this repo's actual CI (`.github/workflows/ci.yml` is
a single job, no matrix, no shared checkout).

- **Two concurrent `vitest run` invocations against the same checkout race on `db push` for
  the same test-DB path.** `isolateTestDb()` and `globalSetup.ts` both delete-then-recreate a
  fixed-path SQLite file with no locking. Deliberately reproduced 4/4 trials: one process
  crashes with `table "Project" already exists` while the other passes. This isn't new to
  the per-file mechanism — `globalSetup.ts`'s original single-shared-DB design had the
  identical vulnerability, just never exercised since nobody ran two `npm test` invocations
  in the same checkout concurrently before. A future CI change (matrix build, self-hosted
  runner reusing a checkout) would need per-invocation-unique DB paths (e.g. a PID suffix) to
  avoid this — not needed for the current single-job CI.
- **`isolateTestDb`'s `name` uniqueness is convention-only, not enforced.** A third
  integration test file reusing `'api'` or `'wbs'` would silently reintroduce the exact race
  this fix eliminated. No runtime registry is possible across files (Vitest gives each test
  file its own OS process under the default `forks`/`isolate:true` pool, confirmed via
  distinct PIDs). Documented in `testDb.ts`'s docstring; worth a lint/convention check if a
  third integration test file is ever added.
- **Neither integration file calls `prisma.$disconnect()` on the dynamically-imported
  server's Prisma client in `afterAll`.** `server.ts` doesn't export its internal `prisma`
  instance, so there's no handle to disconnect from the test file. Only a theoretical concern
  in `vitest --watch` (never used in CI, which always runs `vitest run` once per invocation)
  — repeated re-triggers in a long local watch session could accumulate orphaned Prisma
  client connections. Not reproduced empirically (watch-mode reruns weren't observable in the
  sandbox used for review); flagged as a plausible risk, not a confirmed bug.

## Deferred from spec-wbs-0-close-daysinfte-semantics review (2026-08-12)

Pre-existing issues surfaced while closing the `daysInFTE` SPEC open question; not caused by
that change, out of its scope, deferred for focused attention.

- **`issues-tasks.md` M1 is stale and factually wrong.** It claims `daysInFTE` is "never used in
  cost/effort calculations... completely ignoring `daysInFTE`... everywhere," but `hoursPerPeriod()`
  already multiplies by it in monthly mode. Needs re-verification against current code and either
  closing or rewording to the real gap (if any remains).
- **`daysInFTE` default value drift.** `prisma/schema.prisma` and `src/config/defaults.ts` default
  to `21`; `hoursPerPeriod()`'s own parameter default and `src/App.tsx`'s new-project fallback use
  `20`. Pick one canonical default and align all four sites, or document why they intentionally differ.

## Deferred from spec-wbs-2-wbs-page-ui review (2026-08-13)

Findings from three parallel adversarial/edge-case/acceptance reviews of WBS-2. Three
concrete bugs (lost-update race in the estimate-matrix cell editor, an "+ Add discipline"
dead end, and missing test coverage for several I/O-matrix rows) were patched directly —
see the spec's Spec Change Log. These two are lower-severity, genuinely rooted in a data
shape or risk that predates WBS-2 (established by WBS-1's data model), and not reachable
through WBS-2's own UI today.

- **"Total hours" rollup can silently include hours invisible in every matrix column.**
  `rollupHours()` (`src/utils/wbsTree.ts`) sums an item's estimates by discipline only,
  with no `role` filter — correct per the spec's literal text ("rollup of own + all
  descendant estimates"). But every matrix cell only reads/writes the `(discipline,
  role: "")` entry (`src/components/Wbs.tsx`), per WBS-2's explicit "no matrix support for
  role-specific estimates beyond the default bucket" boundary. If a role-specific estimate
  ever exists on an item (the data model and API both permit it — WBS-2's own boundary
  text acknowledges "the model allows it"), its hours are invisible in every column yet
  still counted in that row's Total, so the displayed total and the sum of visible cells
  can permanently disagree. Not reachable today: WBS-2 is currently the *only* write path
  to WBS estimates, and it never writes a non-empty `role`, so this can only manifest via
  external/future data (e.g. a hand-crafted API call, or a future tool). Two candidate
  fixes were considered and rejected as premature: filtering `rollupHours` to
  `role === ''` would make it wrong for WBS-3's reconciliation math (which almost
  certainly wants all-roles-included discipline totals); showing the combined
  cross-role total in the cell but only writing the default-role slice on edit would let a
  user's typed value silently *not* become the new total. Needs a real product decision,
  likely alongside WBS-3 (reconciliation), which will have to decide how role-level detail
  factors into the numbers it reports anyway.
- **No cycle detection in the WBS tree helpers.** `buildWbsTree`/`flattenVisibleTree`/
  `rollupHours`/`descendantIds` (`src/utils/wbsTree.ts`) all do unbounded recursive walks
  with no guard against a cyclic `parentId` chain (item A's parent is B, B's parent is A).
  WBS-2 itself can never create a cycle — it exposes no reparenting UI at all (`parentId`
  is set once at creation and never changed afterward). WBS-1's own spec explicitly
  disclaims "deep cycle detection on reparenting" for the API layer, so a cycle could only
  reach the DB via direct manipulation or a future path that edits `parentId`. If one ever
  did, every one of these pure functions would recurse infinitely and crash the WBS tab.
  Worth a defensive guard (track visited ids, treat a revisited id as a root) whenever a
  reparenting UI or endpoint is eventually built — WBS-1's own "Never: deep cycle
  detection" note already flagged this as a known gap at the API layer.

## Deferred from spec-client-view-png-export review (2026-08-11)

- **Unbounded Client View PNG canvas** — Period columns grow canvas width with plan length (intentional for Excel fidelity). Very long plans (e.g. 52+ weeks × many roles) can produce huge bitmaps and risk UI jank/OOM. Same class of risk as App’s internal PNG. Consider a max-width warning, pagination, or dropping period columns for oversized plans — product decision, not a silent cap.
- **PNG export double-click debounce** — Sync canvas draw has no disabled/loading state; rapid double-clicks can spawn multiple downloads on large datasets.

## Deferred from spec-wbs-3-reconciliation-engine review (2026-08-13)

Findings from three parallel adversarial/edge-case/acceptance reviews of WBS-3. The
acceptance auditor found zero violations of the frozen spec. Several concrete issues
(unsafe `as string` casts, non-deterministic `localeCompare` sorting, a floating-point
epsilon gap that could paint a conceptually-zero variance as a colored non-zero figure,
a `planningMode` cast missing the `|| 'weekly'` fallback every other call site has, a
React-key collision risk, ambiguous empty-state copy, and a missing test for the
literal two-sided AC1 scenario) were patched directly — see `wbs.ts`/
`ReconciliationPanel.tsx`/`Wbs.tsx`/`wbs.test.ts`. These remaining items are pre-existing
patterns this story reuses (per its own "reuse, don't re-derive" boundary) rather than
defects introduced by it, or genuinely out-of-scope data-quality gaps.

- **`hoursPerPeriod`/`estimatedEffortHours` have no guard against `daysInFTE <= 0`.**
  `src/utils/calculations.ts:77-94` will happily propagate `0`/negative `daysInFTE` into
  `0` or negative hours; nothing catches this before it reaches `estimatedEffortHours`.
  Confirmed pre-existing: none of `ResourcePlan.tsx:246`, `ClientView.tsx:66`, or
  `App.tsx:591`/`854` guard against this either — WBS-3's `Wbs.tsx` reuses the same
  unguarded call shape by design. If it ever fires, the effect is now also visible in the
  reconciliation report's `projectTotal`/`byDiscipline`/`byPhaseDiscipline` figures
  (`ReconciliationPanel.tsx`'s `formatHours`/`formatVariance` were hardened to render `—`
  instead of literal `"NaN"`/`"Infinity"` text, but the underlying zero/garbage totals
  would still be wrong, just not crash-ugly). Worth a focused pass on `daysInFTE` input
  validation (UI already has a `min` on the `Input` at `ResourcePlan.tsx:1295-1300`, but
  nothing stops a value of exactly `0`).
- **No clamp/validation on `Allocation.allocation` percentage values anywhere in the app.**
  Negative or >100 values flow unclamped into `estimatedEffortHours` in
  `ResourcePlan.tsx`, `ClientView.tsx`, `clientViewPng.ts`, and now `wbs.ts`. Pre-existing,
  app-wide; not introduced by WBS-3.
- **`getPhaseForPeriod` has no explicit handling for `periodNumber <= 0`.**
  `src/utils/phases.ts:172-185` will fold a non-positive period number into phase index 0
  without complaint (not a crash, just an odd attribution) — the same behavior every
  existing caller (`ResourcePlan.tsx`, `GeneratePlanSheet.tsx`) already relies on
  implicitly. Low reachability: normal allocation-editing UI only ever creates
  `periodNumber >= 1`.
- **A `GlobalRateCard` row with an empty-string `discipline` would resolve as a
  legitimate (but blank-labeled) discipline bucket instead of landing in Unmapped.**
  `resolveDiscipline` (`wbs.ts:51-53`) only treats `undefined` as "no match" — an empty
  string is falsy but not `undefined`, so a plan row matching such a row would produce a
  blank-labeled row in the "By discipline" table. This is a rate-card data-quality
  concern (an import that leaves `discipline` blank), not something reconciliation should
  paper over by guessing; belongs with the rate-card import path (WBS-4 or a dedicated
  data-quality pass), not this story.
- **WBS-side estimate `discipline` values are never validated against the live rate
  card during reconciliation — explicit scope decision, not an oversight.** WBS-1's own
  deferred-work entry ("The empty-rate-card discipline-validation bypass has no
  re-validation pass…") flagged this as "worth considering for WBS-3." Decision made now:
  out of scope for WBS-3, since the frozen spec's Boundaries only require validating the
  *plan* side's role→discipline resolution (the Unmapped bucket) and say nothing about a
  parallel "unmapped WBS discipline" bucket. Worth a focused follow-up if the product
  wants a third gap bucket for WBS estimates whose `discipline` no longer matches any
  live rate-card row (e.g. after a rate-card import changes the taxonomy).

## Split out of spec-wbs-2r-wbs-table-redesign (2026-08-13)

The WBS page redesign was scoped down to a single goal at the multi-goal check (user chose
**[S] Split** on 2026-08-13): the new table itself (outline numbering, phase inheritance,
role×hours cells, `notes`, removal of the discipline matrix, reconciliation accordion). The
interaction layer below was deferred as its own slice — it ships independently on top of
the redesigned table, and the existing "Add root item" / "+ Child" / "Delete" controls keep
structure editing working until it lands.

- **Keyboard outliner for WBS rows (Enter / Tab / Shift+Tab).** Enter creates a sibling row,
  Tab indents (reparent to previous sibling), Shift+Tab outdents (reparent to grandparent),
  replacing the current per-row "+ Child" / "Delete" buttons with hover-revealed actions.
  Deferred because it is the first UI path to **reparenting** anywhere in the app —
  WBS-2's own Boundaries state "no reparenting UI — items are created as a root or as a
  fixed parent's child and can't be moved afterward (`parentId` update exists in the API but
  is unused here)". That makes it a distinct risk profile and the only part of the redesign
  that would touch `server.ts`.
- **Cycle guards, required by the above.** `buildWbsTree` / `flattenVisibleTree` /
  `rollupHours` / `descendantIds` (`src/utils/wbsTree.ts`) all do unbounded recursive walks
  with no guard against a cyclic `parentId` chain — already logged under "Deferred from
  spec-wbs-2-wbs-page-ui review (2026-08-13)", where it was judged unreachable precisely
  *because* no reparenting UI existed. The keyboard outliner makes it reachable, so the
  guard becomes a hard prerequisite rather than a defensive nicety: client-side in the tree
  helpers, and server-side in `PUT /api/wbs-items/:id` (WBS-1 explicitly disclaimed "deep
  cycle detection on reparenting" at the API layer).
- **Note on Glide:** the table now renders through `@glideapps/glide-data-grid` (decided
  2026-08-13), so this slice's keyboard handling must go through the grid's own key
  handling (`onKeyDown` / selection API) rather than DOM row focus.

### Deferred from spec-wbs-2r review round 1 (2026-08-13)

Surfaced by four independent reviewers during WBS-2R's first review round. These are
pre-existing or out-of-scope; the defects actually caused by that slice triggered a
`bad_spec` loopback instead and are recorded in its Spec Change Log.

- **CORRECTION to an earlier entry — cyclic `parentId` has TWO distinct failure modes, and
  the WBS-2 entry above describes neither accurately.** That entry claims the tree helpers
  would "recurse infinitely and crash the WBS tab" for any cycle. Two review rounds traced
  the code and the truth is split:
  - **A closed cycle with no external entry point** (A→B, B→A): `buildWbsTree`
    (`src/utils/wbsTree.ts:31-39`) finds a parent for every member, so none is pushed into
    `roots`. Recursion walks from roots only and therefore never reaches them — **no crash**.
    Instead the entire cycle and everything beneath it **silently disappears** from the grid
    and from `descendantIds`, so a delete confirmation under-reports its own cascade. This
    violates `buildWbsTree`'s documented promise that "no item is ever silently hidden".
  - **A cycle hanging off a reachable root** (A→B, B→C, C→B): the walk *does* reach it and
    `flattenVisibleTree` / `rollupHours` / `outlineNumbers` / `effectivePhases` — none of
    which carries a visited set — recurse until `RangeError: Maximum call stack size
    exceeded`, white-screening the whole tab including the reconciliation strip.
  So the fix needs **both**: a visited set in the walkers (crash), and surfacing unreachable
  cycle members as roots (silent hiding). Still reachable only by direct API manipulation —
  no shipped UI writes `parentId` after creation, and `PUT /api/wbs-items/:id` accepts an
  arbitrary `parentId` with no cycle check (`server.ts:983` says so in a comment). Remains
  deferred alongside the reparenting slice, which is what would make it reachable.
- **`api.integration.test.ts` is still flaky in a full-suite run, despite the per-file DB
  isolation that was supposed to close this.** Observed 2026-08-13 while verifying WBS-2R:
  `Global rate card > DELETE /api/rate-cards clears all rate cards and metadata` failed in
  1 of 3 consecutive `npx vitest run` invocations, and iteration 1 of the same slice saw
  `PUT /api/projects/:id` in the same file fail 1 in 6. So it is the *file* that is
  unstable, not one test. Evidence it is not caused by WBS-2R: `git diff` vs baseline
  `2cde1e7` is **empty** for `api.integration.test.ts`, `testDb.ts` and `globalSetup.ts`,
  and the file passes **4/4 in isolation** (`npx vitest run api.integration.test.ts`) while
  failing intermittently only when the whole suite runs. That is the signature of
  cross-file interference during a parallel run, which is exactly what the earlier
  `testDb.ts` per-file isolation (`prisma/test-api.db` / `prisma/test-wbs.db`) was
  introduced to eliminate — so that fix is incomplete, or a different shared resource is
  involved. The earlier entry above already flags that `isolateTestDb` and `globalSetup.ts`
  both delete-then-recreate fixed-path SQLite files with no locking; that is the first place
  to look. Worth a focused pass, because an intermittently-red suite trains everyone to
  re-run instead of read the failure.
- **A write that never settles wedges an item's commit queue permanently.**
  `createEstimateCommitter` (`src/utils/wbsGrid.ts`) chains per-item writes so they cannot
  clobber one another, and clears the chain from the settled handler. Rejection is handled;
  a request that simply *hangs* is not, because there is no timeout anywhere in the client.
  Every later commit for that item then queues behind a promise that never resolves, while
  the UI keeps showing the optimistic value, so the user believes it saved. Not specific to
  WBS — `src/services/api.ts` has no timeout on any call — so the right fix is a shared
  request timeout at the api.ts layer rather than a WBS-local workaround.
- **Changing a role on an existing estimate is remove-then-re-add, as two separate writes.**
  The Roles editor can change a pair's hours atomically (the whole set is replaced in one
  call), but there is no path to change the *role* itself: the user removes the pair and adds
  a new one, each persisting independently. If the second write fails, the original pair is
  already gone from the server, leaving the item short one estimate with only a transient
  in-overlay message. Low frequency and it fails visibly rather than silently, so it is not
  blocking — but a proper in-place role edit would remove the window entirely.
- **`nextDisplayOrder` propagates `NaN`.** `Math.max(max, NaN)` is `NaN`, so a single sibling
  with a corrupt `displayOrder` makes every subsequent value `NaN`, which serializes to
  `null` and is rejected by `wbsItemCreateSchema` — the Add action then fails permanently for
  that parent. Reachable only via direct API/DB manipulation, since the write schema requires
  an integer ≥ 0.
- **`phaseName: ''` is treated as an explicitly-set phase.** `wbsItemCreateSchema.phaseName`
  is `z.string().max(200)` with no `.min(1)` (`server-validation.ts:212`), so the API accepts
  an empty string. Any phase-inheritance resolution that tests `!= null` will treat `''` as
  "this row owns a phase", propagate it to the whole subtree, and give reconciliation a
  bucket labelled with the empty string. Not reachable through the UI (the phase editor only
  ever writes a real name or `null`). Cleanest fix is at the schema: make `phaseName` either
  `null` or a non-empty string, which is a server change and therefore outside WBS-2R's
  front-end-only boundary.
- **Renaming a phase still orphans `WbsItem.phaseName`.** Already logged under WBS-1, and
  re-confirmed here: `renamePhase` (`ResourcePlan.tsx:890-906`) rewrites `Project.phases`
  but never the WBS rows referencing the old name, and there is no FK
  (`prisma/schema.prisma:119-120`). WBS-2R makes the consequence more visible (the grid must
  now render such a row as `Unassigned`), but the underlying rename-cascade gap is untouched.
- **Accessibility regression from the canvas grid.** Moving the WBS table from a DOM
  `<table>` of labelled inputs to a `<canvas>` removes it from the accessibility tree
  entirely — no roles, no labels, no keyboard traversal outside Glide's own handling. This
  is an inherent consequence of the Glide decision (made deliberately on 2026-08-13), not a
  defect in the implementation, and it applies equally to the pre-existing `ResourcePlan`
  and `ClientView` grids. Worth a deliberate product decision if the tool ever needs to meet
  an accessibility bar.
- **`api.ts` error messages still stringify objects.** Re-confirmed: the `errorData.details
  || errorData.error` pattern renders `[object Object]` when the server returns Zod's
  `flatten()` output. Already logged under WBS-1; unchanged and still worth a shared
  `formatApiError()` helper.

### `WbsItem.notes` — free-text notes column (split out 2026-08-13)

Carved out of `spec-wbs-2r-wbs-table-redesign` at the token-count check (spec came in at
~2× the 1600-token ceiling; user chose **[S] Split**). `notes` was the *only* reason that
slice touched the database and server at all — removing it makes the table redesign purely
front-end, with no schema migration and a much smaller review surface. The `Notes` column
stays in the target design; it just arrives in its own slice.

No logic, just one nullable field threaded through every layer. The full trace, already
verified against the code on 2026-08-13:

- `prisma/schema.prisma` — `notes String?` on `WbsItem`. **No migration file**: this repo has
  used `db push` since before `WbsItem` existed (`prisma/migrations/` contains no WBS tables
  at all). Run `npx prisma generate` (output is non-default: `src/generated/prisma`) then
  `npx prisma db push`.
- `server-validation.ts` — add to **both** `wbsItemCreateSchema` and `wbsItemUpdateSchema`,
  following the `phaseName` precedent (`z.string().max(N).optional().nullable()`). The
  schemas are `.strict()`, so an undeclared field makes the whole request fail.
- `server.ts` — **asymmetry worth knowing**: the `PUT /api/wbs-items/:id` handler writes
  `data: parsed.data` wholesale, so the field flows through with no edit; the `POST
  .../wbs-items` handler enumerates fields explicitly and needs `notes` added by hand.
- `src/services/api.ts` — `notes: string | null` on the `WbsItem` interface (line ~143),
  **and** add `'notes'` to the `pickDefined(data, ['name','parentId','phaseName',
  'displayOrder'])` allowlist at line 477. Miss the second one and every notes edit is
  silently discarded client-side with no error anywhere.
- `wbs.integration.test.ts` — cover `notes` on create and update. Existing strict-rejection
  probes use `projectId`/`id`/`estimates`, so none collide.
- `README.md:172` — prose lists the PUT's scalar fields; not drift-guarded (`readme.test.ts`
  compares method+path sets only), but should be corrected by hand.
- **Export/import: nothing to do.** WBS items are not in the project export payload at all
  today, so `notes` has zero effect there. Once WBS-4 adds the WBS arm, `notes` rides along
  automatically on export (Prisma returns all scalars) but must be added explicitly to the
  import handler, which reconstructs each field by hand. Land `notes` before or with WBS-4's
  `schemaVersion` 2→3 bump rather than forcing a separate version.

## Split out of Quick Dev 2026-08-14 (WBS-4 / D6 bundle)

User chose **[S] Split**. First goal in this run: WBS Roles column picks from the **project
resource list** (not the global rate card). Resource Plan rows already work that way; original
D6 (plan-side rate-card picker) is therefore a no-op and is not deferred.

- **WBS-4 — JSON export/import (`schemaVersion` 2 → 3).** WBS tree + estimates must round-trip
  with project export/import (CAP-9). Independently shippable; no WBS UI change. Still the last
  planned v1 slice from `sprint-change-proposal-2026-08-12.md`. Land `notes` before or with this
  bump (see notes entry above) so the version only moves once.
- **`WbsItem.notes`.** Already split out of WBS-2R (entry above). Unchanged.

## Deferred from spec-wbs-structure-edit review (2026-08-14)

The WBS-2R split (keyboard outliner + cycle guards) is implemented by
`spec-wbs-structure-edit.md`. These leftovers are pre-existing or corrupt-data
paths, not contract breaks.

- **`PUT /api/wbs-items/:id` cycle check is not transactional.** Two concurrent
  reparents (A under B and B under A) can both pass `wouldCreateCycle` and still
  persist a cycle. Same non-transactional PUT pattern as the rest of `server.ts`.
- **Closed cycle with an extra descendant.** Promoting unreachable cycle members
  to roots unlinks only those members. A child hanging off the cycle can appear
  as a false root, and `descendantIds` / delete-confirm can under-count the DB
  cascade. Reachable only via direct API/DB `parentId` cycles.
- **Tied or corrupt `displayOrder` among siblings.** Insert-below bumps
  `displayOrder + 1` and does not resequence ties. Related to the existing
  `nextDisplayOrder` / `NaN` note under WBS-2R review.
- **Canvas WBS has no focusable ⋮.** Inherent Glide `<canvas>` a11y gap, already
  logged under WBS-2R. Keyboard structure actions still work via `onKeyDown`.

- source_spec: `_bmad-output/implementation-artifacts/spec-planning-table-column-visibility.md`
  summary: Planning Table hourly cost/rate cell edits still accept negative or non-finite numbers.
  evidence: Pre-existing `onCellEdited` bodies write `newValue.data || 0` with no finite/min clamp; this story was required to keep those mutation bodies verbatim.

## Deferred from spec-roadmap-vertical-drag review (2026-08-22)

Pre-existing `server.ts`/`App.tsx` conventions this story's new endpoint and handler faithfully
matched rather than fixed. None are regressions caused by this change.

- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: `api.reorderRoadmap`'s error handling can throw `new Error("[object Object]")` when the server returns a Zod `.flatten()` object as `details`.
  evidence: Identical `errorData.details || errorData.error || '...'` pattern already exists in the pre-existing `updateRoadmapItem`; not something this story introduced.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: `parseInt(req.params.id)` in the new reorder route is not NaN-checked, so a non-numeric `:id` falls through to a generic 500 instead of a 400.
  evidence: The pre-existing single-item `PATCH /api/roadmap-items/:id` handler has the identical unchecked `parseInt`.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: The reorder endpoint has no optimistic-locking/version check, so two concurrent overlapping reorder requests touching the same lane can silently last-write-wins.
  evidence: No endpoint anywhere in `server.ts` does optimistic locking; this is an app-wide architectural gap, not specific to this endpoint.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: The reorder endpoint's existence checks and its `prisma.$transaction` are two separate round trips, so a referenced lane/item deleted in between surfaces as a 500 instead of a 400/404.
  evidence: The same check-then-write (non-transactional-together) shape is used throughout `server.ts`, including the pre-existing single-item PATCH handlers.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: The new reorder endpoint never validates `startPeriod + periodCount` against the project's total period count.
  evidence: Verified the pre-existing single-item `PATCH /api/roadmap-items/:id` handler has no such bound check either — the new endpoint matches existing behavior exactly, not a regression.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: `handleReorderRoadmap` silently no-ops when `currentProject` is null, same as every other App.tsx domain handler.
  evidence: The identical `if (!currentProject) return;` guard appears 11 times across `src/App.tsx`; this is the established house convention, not new.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: Holding both Alt and Ctrl while pressing an arrow key on a bar/grid row silently does the Alt (within-lane reorder) action instead of being rejected as an ambiguous chord.
  evidence: Low-impact, unusual key combination; behavior is deterministic (Alt wins), just undocumented — polish, not a functional break.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: `Esc` does not cancel an in-flight *pointer* drag (only the keyboard-selection path handles Escape).
  evidence: Confirmed via `git show` on the pre-story baseline (`3a0949e`) that no such listener existed before this change either — the keyboard table's claim predates this story.
- source_spec: `_bmad-output/implementation-artifacts/spec-roadmap-vertical-drag.md`
  summary: No guard prevents two overlapping drag/keyboard reorder commits from firing concurrent `PATCH .../reorder` requests whose responses could resolve out of order.
  evidence: Confirmed via `git show` on the pre-story baseline that the old two-PATCH `commitDrag` path had no such guard either — pre-existing gap in the commit path this story generalized, not introduced by it.

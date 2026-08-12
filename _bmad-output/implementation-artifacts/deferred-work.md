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

- **🔴 `api.integration.test.ts`'s "Global rate card" tests destroy the live `prisma/dev.db`
  rate card with no restore.** `POST /api/rate-cards/bulk` then `DELETE /api/rate-cards`
  run against the real DB (no isolated test DB exists in this repo), with no `afterAll`
  restore. A plain `npm test` empties a real, populated `GlobalRateCard` — reproduced twice
  during WBS-1 review, recovered both times from a manual backup. Pre-existing (confirmed
  byte-identical to the pre-WBS-1 baseline), but now a live landmine given the rate card is
  populated (179 rows) and this is the second data-loss incident involving this exact table
  in one day. Fix: back up/restore the rate card in that test's `beforeAll`/`afterAll`, or
  move to an isolated test DB (`DATABASE_URL` override for `npm test`).
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

## Deferred from spec-client-view-png-export review (2026-08-11)

- **Unbounded Client View PNG canvas** — Period columns grow canvas width with plan length (intentional for Excel fidelity). Very long plans (e.g. 52+ weeks × many roles) can produce huge bitmaps and risk UI jank/OOM. Same class of risk as App’s internal PNG. Consider a max-width warning, pagination, or dropping period columns for oversized plans — product decision, not a silent cap.
- **PNG export double-click debounce** — Sync canvas draw has no disabled/loading state; rapid double-clicks can spawn multiple downloads on large datasets.

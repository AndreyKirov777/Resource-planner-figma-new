---
title: 'WBS-3 — Reconciliation Engine + Panel'
type: 'feature'
created: '2026-08-13'
status: 'done'
baseline_commit: '79d2cacc9f1b06df0ef110b5e91746c4f1ce0251'
context: ['{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md', '{project-root}/_bmad-output/implementation-artifacts/spec-wbs-1-data-model-api.md', '{project-root}/_bmad-output/implementation-artifacts/spec-wbs-2-wbs-page-ui.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** WBS-1/2 shipped an independent, bottom-up hours estimate (the WBS), but nothing compares it to the resource plan's top-down estimate — a planner has no way to see where the two estimation viewpoints disagree.

**Approach:** Add a pure reconciliation engine (`src/utils/wbs.ts`) that computes project-total, per-discipline, and per-phase-×-discipline hour variance between WBS estimates and resource-plan allocations, plus a `ReconciliationPanel` rendered inside the existing WBS tab. Entirely client-side — every input (WBS items, resource plans, rate cards, phases) is already loaded in `App.tsx`, so no new API endpoint is needed despite the proposal's §4.3 listing one.

## Boundaries & Constraints

**Always:**
- Pure functions only in `src/utils/wbs.ts` (no React/DOM), unit-tested per the repo's `src/utils/` rule.
- Reuse, don't re-derive: `hoursPerPeriod`/`estimatedEffortHours` (`calculations.ts`) for plan-side hours; `getPhaseForPeriod` (`phases.ts`) to map each `Allocation.periodNumber` to a phase; `rollupHours({ ...item, children: [] })` (`wbsTree.ts`) for each WBS item's *own* per-discipline hours (all roles summed into one discipline total — matches WBS-2's on-screen Total hours semantics and the deferred-work note that reconciliation wants all-roles-included discipline totals).
- Role→discipline resolution: `rateCards.find(rc => rc.role === role)?.discipline`; no match → the plan row is Unmapped. First match wins if duplicate `role` strings exist (schema has no unique constraint on it).
- WBS-side phase bucketing: an item counts toward phase `P` only when `item.phaseName === P.name` for a `P` currently in `project.phases`. `phaseName === null` and a stale name matching no current phase both fold into the **Unassigned** bucket — both are equally unplaceable on the live timeline.
- Plan-side hours are always phase-attributable (`getPhaseForPeriod` clamps trailing periods to the last phase) — there is no plan-side "Unassigned"; its only gap bucket is **Unmapped** (role → discipline).
- `byPhaseDiscipline` includes a row per (phase, discipline) pair wherever `wbsHours > 0 || planHours > 0`; a `phaseLevelAvailable` flag is `true` only if ≥1 WBS item is phase-assigned to a live phase. One-sided rows are kept (not hidden) — a real gap, exactly what reconciliation exists to surface.
- `ReconciliationPanel.tsx` is read-only: reuses `project`/`resourcePlans`/`rateCards`/`wbsItems`/`phases` already available in/computed by `Wbs.tsx`; no new `App.tsx` props or state.

**Ask First:** If building this surfaces a real need for server-side data beyond what `App.tsx` already loads client-side, HALT before adding any endpoint — the whole design assumes pure client-side computation is sufficient.

**Never:**
- No writes to `WbsItem`/`WbsEstimate`/`ResourcePlan`/`Allocation` from this feature — reconciliation reports variance, never syncs either side (D4).
- No new server endpoint, no `GET /api/projects/:id/reconciliation`.
- No changes to `wbsTree.ts`'s `rollupHours` semantics or to `Wbs.tsx`'s existing matrix behavior.
- No role-specific reconciliation rows — the panel is discipline-level only, matching WBS-2's matrix.
- No phase rename-cascade fix — stale-`phaseName` handling here is reconciliation-side bucketing only (WBS-1's deferred item is separate).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty project | `wbsItems=[]`, `resourcePlans=[]` | all totals 0; `byDiscipline=[]`; `byPhaseDiscipline=[]`; `phaseLevelAvailable=false` | — |
| Unmapped plan role | Plan row's `role` not in `rateCards` | Excluded from `byDiscipline` plan side; hours land in `unmappedPlan.rows`/`totalHours`; still counted in `projectTotal.planHours` | — |
| WBS item, no phase | `phaseName: null`, has estimates | Excluded from `byPhaseDiscipline`; hours land in `unassignedWbs`; still counted in `projectTotal.wbsHours` and `byDiscipline` | — |
| WBS item, stale phase | `phaseName` set but absent from `project.phases` | Same as no-phase — folded into `unassignedWbs` | — |
| One-sided phase gap | Phase has WBS hours, 0 plan hours (or vice versa) | Row still appears in `byPhaseDiscipline` with the zero side and full-amount variance | — |
| Multi-role, one discipline | Two estimates, same discipline, different `role` | Summed into one discipline total, not two rows | — |

</frozen-after-approval>

## Code Map

- `src/utils/wbs.ts` (new) -- `resolveDiscipline`, plan-side and WBS-side aggregation, `buildReconciliationReport` -- the pure engine
- `src/utils/wbs.test.ts` (new) -- unit tests per I/O matrix
- `src/components/ReconciliationPanel.tsx` (new) -- renders the report: totals, per-discipline table, per-phase-×-discipline table, two gap-bucket callouts
- `src/components/ReconciliationPanel.test.tsx` (new) -- component test
- `src/components/Wbs.tsx` -- render `<ReconciliationPanel>` using its existing `phases` memo plus its `resourcePlans`/`rateCards`/`wbsItems`/`project` props; no new `App.tsx` wiring

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/wbs.ts` -- implement `resolveDiscipline(role, rateCards)`, `buildReconciliationReport(wbsItems, resourcePlans, rateCards, phases, hrsPerPeriod)` returning `{ projectTotal, byDiscipline, byPhaseDiscipline, phaseLevelAvailable, unassignedWbs, unmappedPlan }` -- the reconciliation math, per Boundaries
- [x] `src/utils/wbs.test.ts` -- one test per I/O matrix row -- required coverage for new pure logic
- [x] `src/components/ReconciliationPanel.tsx` -- read-only tables for totals/per-discipline/per-phase-×-discipline, plus Unassigned/Unmapped callouts (always rendered, even when empty, so a gap can't silently vanish from view) -- the panel itself
- [x] `src/components/ReconciliationPanel.test.tsx` -- renders totals; renders both gap buckets when populated; shows a "not enough phase-assigned data" state when `phaseLevelAvailable` is false -- locks the component/data contract
- [x] `src/components/Wbs.tsx` -- compute `hrsPerPeriod` via `hoursPerPeriod(project.planningMode, project.daysInFTE)`, call `buildReconciliationReport`, render `<ReconciliationPanel>` -- wires the panel into the existing WBS tab

**Acceptance Criteria:**
- Given a project with WBS estimates and resource-plan allocations sharing a phase and discipline, when the WBS tab is opened, then the panel shows a variance for that phase × discipline pair equal to WBS hours minus plan hours.
- Given at least one resource-plan row with an unmapped role and one WBS item with no phase, when the panel renders, then both the Unmapped and Unassigned buckets are visible and non-empty, and neither the WBS tree nor the resource plan's allocations are modified as a side effect.

## Spec Change Log

- **Implementation judgment calls (2026-08-13, non-frozen sections only):**
  - `project.planningMode` (typed `string` on `Project`) is cast to `'weekly' | 'monthly'` for `hoursPerPeriod` in `Wbs.tsx`, matching the identical pattern already used at every other call site (`ResourcePlan.tsx`, `ClientView.tsx`, `App.tsx` ×2).
  - `varianceClass` in `ReconciliationPanel.tsx` uses amber for a positive variance (WBS > plan) and red for negative, muted-foreground for zero — a visual/UX choice not specified by the spec.
  - `wbs.test.ts` includes two tests beyond the minimum one-per-I/O-matrix-row (plan-side multi-role-one-discipline, multi-period phase attribution) for extra confidence; no production-logic changes resulted.
- **Review findings, patched (2026-08-13):** three parallel reviews (blind hunter, edge case hunter, acceptance auditor) ran against the diff. The acceptance auditor found **zero violations** of this spec's frozen Boundaries, Never-list, or I/O matrix — every row has a corresponding test with matching assertions. The other two reviewers surfaced real-but-minor issues, all fixed without touching frozen Boundaries — none required renegotiating intent:
  1. **Floating-point variance could render as a colored non-zero figure when conceptually zero** (blind hunter, corroborated by edge-case hunter's independent "epsilon" finding): `varianceHours` is a sum of many `estimatedEffortHours` floats, so a value that should be exactly `0` can land on something like `4.5e-13` — `varianceClass`/`formatVariance` compared against literal `0` with no tolerance, so the badge would paint amber/red while displaying `"+0.0"`/`"-0.0"`, a "the number says one thing, the color says another" trust bug for a report whose entire purpose is flagging real disagreement. **Fix:** `ReconciliationPanel.tsx` now treats `|hours| < 1e-6` as zero in both `varianceClass` and `formatVariance`. Covered by a new regression test asserting a `4.5e-13` variance renders as plain `"0"` with no `+`/`-` sign.
  2. **Unsafe `as string` casts on `item.phaseName`** (blind hunter): `wbs.ts`'s `isLivePhase` boolean broke TypeScript's null-narrowing, so the code cast `item.phaseName as string` twice afterward — trusting logic the compiler never verified. **Fix:** hoisted `item.phaseName` into a local `const phaseName` and narrowed it directly in the `if` condition; both casts are gone.
  3. **`localeCompare` with no explicit locale is non-deterministic across environments** (blind hunter): three sort call sites relied on the runtime's default-locale ICU behavior for a "sorted alphabetically" contract the spec states plainly. **Fix:** replaced with a plain `compareStrings` helper (`a < b ? -1 : a > b ? 1 : 0`), fully deterministic.
  4. **`project.planningMode` cast omitted the `|| 'weekly'` fallback every other call site has** (found while verifying the edge-case hunter's "invalid planningMode" finding against the rest of the codebase): `ResourcePlan.tsx`, `ClientView.tsx`, and `App.tsx` (×2) all guard a falsy `planningMode` with `|| 'weekly'` before casting; the new `Wbs.tsx` code omitted it, a small deviation from established precedent. **Fix:** added the same fallback.
  5. **React key collision risk in the by-phase-×-discipline table** (blind hunter + edge-case hunter, same finding independently): `key={`${row.phaseName}:${row.discipline}`}` could collide for free-text names containing `:` (e.g. `phaseName="A:B", discipline="C"` vs `phaseName="A", discipline="B:C"`). **Fix:** key now includes the row's array index, which is unique and stable within a single render of a purely-presentational, no-internal-state row.
  6. **Ambiguous "not enough phase-assigned data" copy** (blind hunter): the message told users to "assign at least one WBS item to a live phase," which is impossible advice when the project has zero phases defined at all — the copy didn't distinguish that case from "phases exist, nothing's assigned yet." **Fix:** reworded to cover both ("Add a project phase (if none exist yet) and assign at least one WBS item to it…").
  7. **`formatHours`/`formatVariance` had no guard for non-finite input** (edge-case hunter): a `NaN`/`Infinity` hours value (reachable only via the separately-deferred `daysInFTE <= 0` gap, see `deferred-work.md`) would have rendered as literal `"NaN"`/`"Infinity"` text. **Fix:** both functions now return `'—'` for non-finite input — defense in depth, independent of whether the upstream cause is ever fixed.
  8. **Missing test coverage for AC1's literal two-sided scenario** (acceptance auditor): every existing `byDiscipline`/`byPhaseDiscipline` test had exactly one side at `0`; none asserted a row where `wbsHours > 0 AND planHours > 0` simultaneously, the exact case Acceptance Criterion 1 describes. Hand-tracing confirmed the arithmetic was already correct — this was a coverage gap, not a bug. **Fix:** added `wbs.test.ts`'s "AC1: reports a two-sided variance…" test.
  All 8 fixes are covered by tests (7 pre-existing tests + 2 new ones: the AC1 two-sided case and the floating-point-epsilon regression). Remaining findings — `daysInFTE <= 0`/invalid `planningMode` propagating `NaN`/wrong hours (pre-existing in `calculations.ts`, not introduced here), unclamped `Allocation.allocation` values (pre-existing, app-wide), `getPhaseForPeriod` with `periodNumber <= 0` (pre-existing, low reachability), a `GlobalRateCard` row with an empty-string `discipline` (rate-card data-quality, out of scope), and WBS-side discipline-vs-rate-card re-validation (explicit scope decision, not this story's job) — were pre-existing patterns or genuinely out of scope, deferred to `deferred-work.md`, not patched here.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no new type errors
- `npm test` -- expected: full suite green, including new `wbs.test.ts` and `ReconciliationPanel.test.tsx`

**Manual checks (if no CLI):**
- Dev server: open a project with both a WBS and a resource plan sharing at least one phase/discipline; confirm the panel's variance figures match a hand calculation; add a plan row with a nonsense role and confirm it appears under Unmapped.

## Suggested Review Order

**The engine — entry point and both aggregation passes**

- Entry point: pure function signature, the frozen contract's five report sections in one return shape.
  [`wbs.ts:75`](../../src/utils/wbs.ts#L75)

- WBS-side pass: each item's *own* hours via `rollupHours` on a childless synthetic node, bucketed into a live phase or folded into Unassigned — the null-narrowing fix (no more `as string` casts) lives here.
  [`wbs.ts:84`](../../src/utils/wbs.ts#L84)

- Plan-side pass: `getPhaseForPeriod` resolves each allocation's phase; an unmapped role still counts toward the project total but skips every discipline/phase bucket.
  [`wbs.ts:112`](../../src/utils/wbs.ts#L112)

- Role→discipline resolution — exact match, first-match-wins on duplicate rate-card roles, matching the server's existing `resolveIntRate` convention.
  [`wbs.ts:51`](../../src/utils/wbs.ts#L51)

- `byDiscipline`: phase-agnostic union of both sides, always available.
  [`wbs.ts:150`](../../src/utils/wbs.ts#L150)

- `byPhaseDiscipline`: one-sided rows kept intentionally — a real gap is exactly what this report exists to surface.
  [`wbs.ts:160`](../../src/utils/wbs.ts#L160)

**The panel — the review-driven fixes**

- Component entry point: pure `report` prop in, read-only tables/callouts out.
  [`ReconciliationPanel.tsx:38`](../../src/components/ReconciliationPanel.tsx#L38)

- The floating-point-epsilon fix — a conceptually-zero variance no longer paints amber/red.
  [`ReconciliationPanel.tsx:13`](../../src/components/ReconciliationPanel.tsx#L13)

- Per-phase table — the "not enough phase-assigned data" empty state, reworded to cover both "no phases yet" and "nothing assigned yet."
  [`ReconciliationPanel.tsx:105`](../../src/components/ReconciliationPanel.tsx#L105)

- The two always-rendered gap-bucket callouts — never silently dropped, even at zero.
  [`ReconciliationPanel.tsx:147`](../../src/components/ReconciliationPanel.tsx#L147)
  [`ReconciliationPanel.tsx:172`](../../src/components/ReconciliationPanel.tsx#L172)

**Wiring**

- `Wbs.tsx` computes `hrsPerPeriod`/the report and renders the panel — three added lines, nothing existing touched.
  [`Wbs.tsx:86`](../../src/components/Wbs.tsx#L86)
  [`Wbs.tsx:441`](../../src/components/Wbs.tsx#L441)

**Peripherals**

- Engine tests: one per I/O-matrix row, plus the AC1 two-sided case added after the acceptance-audit coverage gap.
  [`wbs.test.ts:106`](../../src/utils/wbs.test.ts#L106)
  [`wbs.test.ts:288`](../../src/utils/wbs.test.ts#L288)

- Panel tests: totals, both tables, both gap buckets (populated and zero-state), plus the epsilon regression test.
  [`ReconciliationPanel.test.tsx:18`](../../src/components/ReconciliationPanel.test.tsx#L18)
  [`ReconciliationPanel.test.tsx:88`](../../src/components/ReconciliationPanel.test.tsx#L88)

- Deferred findings from all three reviews, with rationale for why each is out of this story's scope.
  [`deferred-work.md:221`](deferred-work.md#L221)

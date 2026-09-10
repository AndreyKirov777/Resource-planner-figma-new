---
title: 'WBS Reconciliation — compact panel'
type: 'refactor'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'd55c004ff8101756c81ebafcee6a10270d0404bd'
context: ['docs/bmad-archive/project-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Reconciliation panel on the WBS tab stacks seven cards (~1300 px) of pure numbers: a "Project total" card duplicating figures the discipline table already sums, five gap-bucket cards whose normal state is "nothing wrong", and three number tables with no visual encoding — so the one row that is actually off carries the same weight as the balanced ones.

**Approach:** Rebuild the same report in ~800 px with visual encoding: one health strip (figures + coverage bar + status chips) replacing the total card and all five gap cards; bullet bars in *By discipline*; a discipline × phase variance heatmap replacing the flat phase list; delta-only tinted cells in *By period* with the raw pair kept for assistive tech. Data, sign conventions and upstream computation are untouched — this is presentation only.

## Boundaries & Constraints

**Always:**
- Keep real `<table>` semantics (`Table`/`TableHead`/`TableCell` from `ui/table`) for all three matrices. The compaction is visual; screen-reader structure must not regress.
- Every cell that visually shows only a delta MUST carry the underlying pair in a `sr-only` span (`"{wbs}/{plan}"`, `"{demand}/{supply}"` — same string format as today) plus a native `title=` for sighted hover. This is both the a11y contract and what keeps existing assertions green.
- Preserve the existing sign conventions and colors exactly: `varianceHours = wbs − plan` and by-period `variance = demand − supply`; positive → amber, negative → red, |x| < `VARIANCE_EPSILON` → neutral. Reuse `varianceClass`/`formatVariance`/`formatHours` — do not re-derive formatting.
- Render numeric figures and their unit in separate elements (`<span>120</span> <span>h</span>`) so exact-text queries on the number keep working.
- Guard every ratio against a zero or non-finite denominator.
- Compose classes with `cn()`; Tailwind v4 utilities only.

**Ask First:**
- Any change to `src/utils/wbs.ts`, `src/utils/roadmapLoad.ts` or `src/utils/roadmap.ts` (report shape or math).
- Dropping any datum currently rendered (unmapped role names, unplaced item names, empty-bar names, phase-mismatch triples must all still be reachable in the DOM when non-empty).
- Adding a new npm dependency or a new `ui/` primitive.

**Never:**
- No new charting library; bars and heatmap cells are divs/table cells with inline width/background.
- Do not touch `ReconciliationPanel`'s callers' data plumbing in `Wbs.tsx` (the four `useMemo`s at `Wbs.tsx:505-615` stay as-is).
- Do not introduce Radix `Tooltip` for the dense cells — the codebase convention for hover numerics is the native `title` attribute.
- No click-to-filter / drill-down interactions on the chips in this change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Healthy project | all buckets empty, variance 0 | Strip shows figures + full coverage bar + all chips in muted "clear" style with a check icon; no "Open issues" section renders at all | N/A |
| Under-planned discipline | `varianceHours > 0` on a row | Bullet bar: grey track = WBS, indigo fill = plan; amber `+N` chip | N/A |
| Over-planned discipline | `varianceHours < 0` | Plan overhang segment painted red beyond the WBS track; red `−N` chip | N/A |
| Zero WBS hours | `projectTotal.wbsHours === 0` | Coverage bar renders empty with an em-dash caption, not `NaN%` / `Infinity` | Guard the divide |
| Float noise | variance `4.5e-13` | Renders `0`, neutral color, not a tinted cell | `VARIANCE_EPSILON` |
| Roadmap not loaded | `coverage` prop `undefined` | Unplaced/Empty/Phase-mismatch chips absent; strip and other cards render normally | N/A |
| No phase data | `phaseLevelAvailable === false` | Heatmap replaced by the existing explanatory paragraph (text unchanged) | N/A |
| Discipline with no phase rows | present in `byDiscipline`, absent from `byPhaseDiscipline` | Row omitted from the heatmap (no all-empty rows) | N/A |
| Many periods | `periods.length` large | By-period table scrolls horizontally inside its own container; page never scrolls sideways | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ReconciliationPanel.tsx` — **the file being rewritten**. Keep exports `ReconciliationPanel`, `reconciliationSummary`, `RoadmapCoverageDisplay`; keep `VARIANCE_EPSILON:45`, `varianceClass:47`, `formatVariance:52` behavior. Props interface (`:32-41`) is unchanged.
- `src/components/ReconciliationPanel.test.tsx` — 13 tests. Four depend on the old table shape and must be updated (see Tasks); the rest must stay green untouched.
- `src/components/Wbs.tsx:1457-1482` — collapsed `Collapsible`; trigger's accessible name comes from `reconciliationSummary()` at `:1467`. Only insertion point for the strip's chips.
- `src/components/Wbs.test.tsx:1072-1098` — three tests on the collapsed trigger; the name regex `/WBS 24 h .* Plan 0 h .* \+24/` is unanchored, so chips added **outside** the button keep it green.
- `src/components/roadmap/Roadmap.test.tsx:733,816,832` — cross-check test asserting `getAllByText(\`${demand}/${supply}\`)` on the by-period matrix. The `sr-only` pair span is what keeps this passing; verify, do not edit.
- `src/utils/wbs.ts:37-44` (`ReconciliationReport`), `:160-181` — read-only. `byPhaseDiscipline` is emitted **phases in project order, disciplines alphabetical**, and only for pairs with hours on some side; the pivot must preserve that ordering rather than re-sorting.
- `src/utils/roadmapLoad.ts:518-539` — `ByPeriodCell {demand,supply,variance}`, `ByPeriodMatrix {periods,rows,totalRow}`. Read-only.
- `src/components/ui/` — available: `card`, `badge`, `table`, `toggle-group`, `collapsible`, `tooltip`, `popover`. **Absent: `progress`, `separator`, `hover-card`** — build the coverage bar as two nested divs, not a new primitive.
- `src/components/gridTheme.ts:40` — `getAllocationBgColor(percent)` is a white→green ramp, unused and **not** suitable for diverging variance; do not force it.
- `src/components/GeneratePlanSheet.tsx:263` — precedent for `title=` hover numerics. `src/index.css` / `styles/globals.css` — tokens; indigo `#4F46E5` is the grid's `linkColor` (`gridTheme.ts:30`).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ReconciliationPanel.tsx` — add two exported pure helpers: `pivotPhaseDiscipline(report)` returning `{phases: string[], rows: {discipline, cells: (PhaseDisciplineVariance|null)[]}[]}` (phase columns in first-seen order from `byPhaseDiscipline`, discipline rows in `byDiscipline` order, disciplines with no cells omitted); and `varianceTint(hours, maxAbs)` returning an inline style whose alpha ramps *into* `[0.08, 0.28]` as `0.08 + clamp(|hours|/maxAbs, 0, 1) * 0.2` (not a clamp of the raw ratio — see the Spec Change Log), amber for positive, red for negative, transparent below `VARIANCE_EPSILON`. Rationale: the only two pieces of real logic in the rewrite; keeping them pure and exported makes them testable without rendering.
- [x] `src/components/ReconciliationPanel.tsx` — replace the "Project total" card and the five gap-bucket cards with one health-strip card (figures · coverage bar · chip row) plus a single "Open issues" block that renders only the non-empty buckets. Rationale: the largest space win, and issues stop hiding behind healthy empty-state prose.
- [x] `src/components/ReconciliationPanel.tsx` — convert *By discipline* rows to bullet bars (track = WBS scaled to the row max, fill = plan, red overhang when plan > WBS) with a merged `WBS / Plan` figure column and a variance chip; convert *By phase × discipline* to the pivoted heatmap; convert *By period* cells to delta-only tinted cells. Each restyled cell keeps its `sr-only` pair span and `title`. Rationale: this is the visual encoding the redesign exists for.
- [x] `src/components/ReconciliationPanel.tsx` — extract the chip row as an exported `ReconciliationChips({report, coverage})` so the collapsed strip can reuse it. Rationale: two real call sites, not speculation.
- [x] `src/components/Wbs.tsx` — render `<ReconciliationChips>` as a sibling of the `CollapsibleTrigger` button (never inside it) in the `:1457-1482` block. Rationale: surfaces problems without expanding; keeping it outside the button preserves the trigger's accessible name.
- [x] `src/components/ReconciliationPanel.test.tsx` — update the four shape-dependent tests (`renders a per-discipline row…` → new merged/bar columns; `renders the by-phase-x-discipline table…` → heatmap headers are phases, row headers disciplines; by-period phase-baseline test → delta cell + `sr-only` pair; the gap-bucket zero-state tests → chip "clear" state instead of per-card prose). Add unit tests for `pivotPhaseDiscipline` (ordering, sparse cells, omitted rows) and `varianceTint` (sign, epsilon, alpha clamp). Rationale: the four tests assert the old presentation and must move with it; the helpers are new logic.

**Acceptance Criteria:**
- Given a project whose plan exactly matches its WBS, when the panel is expanded, then no "Open issues" block is present and every chip renders in the muted clear style.
- Given a report where one discipline is over-planned and another under-planned, when the panel renders, then the two rows are distinguishable without reading a number (red overhang vs. short indigo fill).
- Given the panel is collapsed, when a gap bucket is non-empty, then its chip is visible next to the trigger without expanding.
- Given `npm test`, when the suite runs, then `Roadmap.test.tsx`'s demand/supply cross-check passes **without being edited**, and `Wbs.test.tsx`'s first two reconciliation-strip tests pass unedited.
- Given a project with a non-zero project variance but every gap bucket empty, when the panel is expanded, then the "Open issues" block is absent — a plain WBS-vs-plan gap is reported by the strip and the bars, not by an issue list. (Amended after implementation: the original wording froze `Wbs.test.tsx:1089`, whose zero-state-prose probe forced the Open-issues block to stay permanently visible. That test keeps its intent — hours inherited by an ancestor phase are not "Unassigned" — but must now probe the Unassigned chip's clear state instead of the prose.)
- Given a screen reader, when it reaches any delta-only cell, then it announces the underlying pair, not just the delta.

## Spec Change Log

- **Finding:** `varianceTint`'s alpha was implemented as `Math.min(0.28, Math.max(0.08, ratio))`, which maps every ratio at or above 0.28 to the same value — so roughly three quarters of the range renders identically and the heatmap fails to encode magnitude, which is its whole purpose. A reviewer confirmed it at runtime: ratios 0.28, 0.3, 0.5, 0.9 and 1.0 all produced `rgba(245, 158, 11, 0.28)`.
  **Amendment:** the `varianceTint` Tasks entry now specifies a ramp *into* the range — `0.08 + clamp(|hours|/maxAbs, 0, 1) * 0.2`. The original wording ("alpha scales `|hours|/maxAbs` clamped to `[0.08, 0.28]`") was ambiguous between ramping into the range and clamping the raw ratio, and the implementation took the reading that renders a nearly flat heatmap.
  **Known-bad state avoided:** a heatmap whose tint is visually constant above a quarter of the maximum variance, hiding exactly the hotspots the redesign exists to surface.
  **Deviation from workflow:** this is a `bad_spec` root cause, which step 4 would normally resolve by reverting the code and re-deriving it. It was fixed as a patch instead, because the defect is one expression inside one pure function that has its own unit test, and reverting ~600 lines of otherwise-sound work to regenerate it would risk far more than it protects. Recorded here so the spec and the code still agree.
  **KEEP:** the two-endpoint-only unit test is what let this through. Any re-derivation must assert that a midpoint (`varianceTint(50, 100)`) differs from the maximum (`varianceTint(100, 100)`), not merely that the extremes clamp.

## Design Notes

Bullet-bar geometry, per row, scaled against `max(wbsHours, planHours)` across visible rows:

```tsx
const track = (row.wbsHours / rowMax) * 100;      // grey — the estimate
const fill  = (Math.min(row.planHours, row.wbsHours) / rowMax) * 100;  // indigo
const over  = (Math.max(row.planHours - row.wbsHours, 0) / rowMax) * 100; // red, starts at `track`
```

Heatmap/period cells are `<TableCell>` with `style={varianceTint(v, maxAbs)}`, visible text `formatVariance(v)` (or `·` when neutral), plus `<span className="sr-only">{formatHours(a)}/{formatHours(b)}</span>`.

`style={{ width: `${pct}%` }}` is a new pattern in this codebase (all existing bars are px-based) — it is the right tool for a fluid bar; just don't take it as licence to convert existing px bars.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: clean (the build does not type-check, so this is the only type gate).
- `npm test -- ReconciliationPanel` — expected: all pass, including the new helper unit tests.
- `npm test -- Wbs` — expected: all pass with `Wbs.test.tsx` unedited.
- `npm test` — expected: full suite green, notably `Roadmap.test.tsx`'s done-means cross-check.

**Manual checks:**
- Expanded panel fits ≈800 px tall at 1120 px wide vs. ~1300 px today; the page never scrolls horizontally (only the by-period table's own container does).

## Suggested Review Order

**The compaction decision — read this first**

- Entry point: the health strip that replaced the "Project total" card and all five gap-bucket cards.
  [`ReconciliationPanel.tsx:289`](../../../src/components/ReconciliationPanel.tsx#L289)

- Only the five gap buckets open the issues list; a plain WBS-vs-plan gap never does.
  [`ReconciliationPanel.tsx:262`](../../../src/components/ReconciliationPanel.tsx#L262)

- The issues block, and why nothing inside it is ever an empty-state message.
  [`ReconciliationPanel.tsx:334`](../../../src/components/ReconciliationPanel.tsx#L334)

**Visual encoding — the point of the change**

- Bullet bars: grey track is the estimate, indigo fill the plan, red the overhang.
  [`ReconciliationPanel.tsx:438`](../../../src/components/ReconciliationPanel.tsx#L438)

- Flat phase list became a discipline x phase heatmap; fixed size instead of unbounded rows.
  [`ReconciliationPanel.tsx:510`](../../../src/components/ReconciliationPanel.tsx#L510)

- By-period cells show only the delta; the pair moved to `sr-only` and `title`.
  [`ReconciliationPanel.tsx:587`](../../../src/components/ReconciliationPanel.tsx#L587)

**The three pure helpers — all the real logic lives here**

- Alpha ramps into [0.08, 0.28]; clamping the raw ratio flattened three quarters of the range.
  [`ReconciliationPanel.tsx:125`](../../../src/components/ReconciliationPanel.tsx#L125)

- Bar geometry extracted so it can be unit-tested; rendering it alone left it unverified.
  [`ReconciliationPanel.tsx:141`](../../../src/components/ReconciliationPanel.tsx#L141)

- Nested maps, not a joined string key, so free-text phase and discipline names cannot collide.
  [`ReconciliationPanel.tsx:88`](../../../src/components/ReconciliationPanel.tsx#L88)

**Shared chips**

- Chip state is in the accessible name, not only in `title`.
  [`ReconciliationPanel.tsx:153`](../../../src/components/ReconciliationPanel.tsx#L153)

- Same component serves the strip and the collapsed trigger row.
  [`ReconciliationPanel.tsx:178`](../../../src/components/ReconciliationPanel.tsx#L178)

- Rendered outside the trigger button, and only while collapsed, so it neither renames the button nor doubles up.
  [`Wbs.tsx:1473`](../../../src/components/Wbs.tsx#L1473)

**Tests**

- Cross-wiring guard: five distinct bucket numbers, asserted on text content, not just `title`.
  [`ReconciliationPanel.test.tsx:102`](../../../src/components/ReconciliationPanel.test.tsx#L102)

- The caption must report the true ratio; only the bar width is clamped.
  [`ReconciliationPanel.test.tsx:155`](../../../src/components/ReconciliationPanel.test.tsx#L155)

- Attribution test now proves the hours land under the ancestor phase, not merely that Unassigned stayed clear.
  [`Wbs.test.tsx:1089`](../../../src/components/Wbs.test.tsx#L1089)

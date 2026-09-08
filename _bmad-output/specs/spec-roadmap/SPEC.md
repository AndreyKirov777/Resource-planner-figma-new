---
id: SPEC-roadmap
supersedes: ../spec-wbs-schedule/SPEC.md
companions:
  - data-model.md                                     # schema delta, API, link inheritance, demand formulas
  - timeline-component.md                             # the chart we own: geometry, pointer model, keyboard parity, budget
  - ux-reference.md                                   # binding interaction and visual decisions
  - delivery.md                                       # slices, open-question routing, per-slice verification
  - ../../project-context.md                          # binding convention catalog — read first when implementing
  - ../spec-resource-planner/SPEC.md                  # umbrella product contract this feature extends
  - ../../../docs/data-models.md                      # existing Prisma schema and period model
sources:
  - ../spec-wbs-schedule/SPEC.md                      # the rejected "schedule on WBS items" contract; kept for rationale
  - svar-integration.md                               # superseded library contract; kept for the audit trail only
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Project Roadmap

## Why

The Resource Planner answers two of the three planning questions. The WBS answers **what** — a deliverable tree whose leaves carry hours per role. The Resource Plan answers **who and how many** — roles × periods × allocation %. Neither answers **when** at any resolution finer than a phase, so a planner cannot see that Backend is over-committed in one specific week and idle in two others; WBS-3 reconciles effort against capacity only by total, by discipline and by phase.

The first attempt at this (`spec-wbs-schedule`) put a start and a duration on every WBS item and drew the tree as a Gantt. That was the wrong altitude. A WBS leaf is the unit of *estimation*, not the unit of *time*: one package holds design, build and QA that do not happen at once; level-of-effort nodes (PM, regression, support) have no meaningful start and end; the deliverable hierarchy is not a time hierarchy, so summary bars say nothing; and dependencies between deliverables are mostly false. Above all, a planner staffing a project before it starts does not know the start week of sixty work packages — they know that Platform runs W3–W10, that Mobile starts once the API is stable, and that Launch is in W14.

So the time layer is a **separate, high-level artifact**: a roadmap of lanes (workstreams), windows and milestones — ten to twenty bars, not eighty. The WBS stays exactly as it is. The two are joined by an explicit link: a WBS node, with its whole subtree, belongs to one roadmap item. Effort flows up from the leaves into the bars, windows spread that effort over periods, and the per-period demand meets Resource Plan supply. Three layers, three reconciliations:

```
WHAT     WBS       tree → leaves with hours × roles          unchanged
WHEN     Roadmap   lanes → windows and milestones on periods  new
WHO      Plan      roles × periods × allocation %             unchanged

WHAT ↔ WHO   total / discipline / phase    shipped (WBS-3)
WHAT ↔ WHEN  coverage                      new
WHEN ↔ WHO   demand vs supply per period   new — the point of the feature
```

This is a **planning** instrument. Nothing here tracks progress or records what happened.

## Capabilities

- **CAP-1 — Roadmap tab**
  - **intent:** A planner opens a Roadmap tab beside WBS and sees the project's workstreams laid out on the same phases and periods the Resource Plan uses.
  - **success:** A new top-level tab renders lanes and their items on a period timeline with phase bands; the WBS tab, its Estimate table and its keyboard model are unchanged apart from one optional column (CAP-5); an empty roadmap shows an empty state offering "create from WBS" (CAP-12) or "add lane".

- **CAP-2 — Lanes, items and milestones**
  - **intent:** A planner structures the roadmap as lanes holding windows and milestones, and nothing deeper.
  - **success:** Lanes are created, renamed, reordered and deleted; an item has a name, a lane, a start period, a duration in periods and a kind (`bar` or `milestone`); items persist in periods and survive reload; the roadmap is flat — an item cannot contain another item; deleting a lane deletes its items after a confirmation that states how many.

- **CAP-3 — Period timeline in the app's own units**
  - **intent:** A planner reads the roadmap in phases and periods, with calendar dates as a secondary label.
  - **success:** The scale shows phase bands in `PHASE_COLORS` above period columns labelled with the ordinal and — when `Project.startDate` is set — the date derived from it; without a start date the scale shows ordinals only and a non-blocking hint; zoom steps by planning unit rather than freely; Fit frames the whole project.

- **CAP-4 — Direct manipulation, by pointer or keyboard**
  - **intent:** A planner places and reshapes windows by dragging and resizing bars and moving them between lanes — or does the same from the keyboard.
  - **success:** A bar follows the pointer during the gesture and snaps to period boundaries on release, so no item can start mid-period; a ghost shows where it will land; dragging onto another lane's rows re-lanes it; every gesture has a keyboard equivalent that routes through the same snap-and-commit path; every change persists through `api.ts`, reverts visibly on failure, and offers a single-operation undo via toast.

- **CAP-5 — Scope linking between WBS and roadmap**
  - **intent:** A planner says which part of the WBS a roadmap item delivers, by pointing at WBS nodes rather than retyping them.
  - **success:** Any WBS node can be linked to at most one roadmap item; a linked node carries its whole subtree; a descendant linked elsewhere overrides its ancestor for its own subtree (nearest linked ancestor wins, exactly as `effectivePhases` resolves phases); every leaf's hours are attributed to exactly one roadmap item or to none; the link is visible and editable from both sides — the item editor's scope picker and an optional `Roadmap` column in the WBS table; milestones carry no scope.

- **CAP-6 — Bars carry effort, not status**
  - **intent:** A planner sees, on each bar, how much work it holds and how many people that implies.
  - **success:** Each bar and spread is labelled with the item name; hours and FTE live in the left grid and the tooltip (broken down by role); an item with no WBS link still shows its name and, while Unlinked is on, renders distinctly (dashed outline); with Unlinked off every bar and spread uses the filled paint; no progress affordance exists anywhere.

- **CAP-7 — Coverage reconciliation (WHAT ↔ WHEN)**
  - **intent:** A planner sees what part of the estimate has not been placed in time, and which windows have no estimate behind them.
  - **success:** `ReconciliationPanel` gains an *Unplaced (WBS)* category listing WBS nodes with no effective roadmap item and their hours as an absolute and a share of the total, an *Empty (roadmap)* category listing items with no scope, and a *Phase mismatch* category listing items whose window shares no period with the effective phase of some linked leaf.

- **CAP-8 — Demand engine**
  - **intent:** The system derives, from linked effort and roadmap windows, how much of each role is needed in each period, and compares it with Resource Plan supply.
  - **success:** A pure module returns demand per `(role, period)` in hours and FTE, supply per `(role, period)` from `Allocation`, their variance, and the minimum feasible duration of an item at current staffing; unplaced effort contributes a baseline demand spread evenly over its effective phase, so the by-period picture is complete from day one; effort with neither a roadmap item nor a phase is reported as unplaceable and excluded from per-period figures; the sum of per-period demand plus unplaceable hours equals the WBS total from WBS-3; role→discipline resolution reuses `resolveDiscipline`; unit tests cover the empty project, an empty roadmap, overlapping items, a leaf overridden by a descendant link, unmapped roles and unplaceable effort.

- **CAP-9 — Capacity on the timeline**
  - **intent:** A planner sees, without leaving the roadmap, which periods are over-committed and which have idle capacity.
  - **success:** A bar whose demand exceeds supply in some of its periods carries a warning stripe over exactly those periods; a per-period demand-versus-supply strip renders under the timeline in the same column grid, switchable between role and discipline; clicking a period reveals the items producing that demand.

- **CAP-10 — Reconciliation by period (WHEN ↔ WHO)**
  - **intent:** A planner reviews per-period gaps for every role at once, in the same panel that already reports total, discipline and phase gaps.
  - **success:** `ReconciliationPanel` gains a by-period section — a roles × periods matrix of demand, supply and variance — whose numbers agree with the load strip and the bar stripes cell for cell; it renders from the phase baseline even when the roadmap is empty.

- **CAP-11 — Item editor beside the timeline**
  - **intent:** A planner edits an item's window and scope while watching the timeline react.
  - **success:** The editor is a side panel that compresses the timeline rather than covering it; it edits name, lane, kind, start period, duration and linked scope; scope is chosen in a WBS tree picker that shows each node's hours, its inherited state, and — muted, with the owner's name — nodes already owned by another item; it displays total effort, demand in FTE by role, plan supply over the window and the feasible duration; fields save on blur with no Save button, and a failed save reverts the field and reports why.

- **CAP-12 — Create a roadmap from the WBS**
  - **intent:** A planner gets a first roadmap in one action instead of retyping the top of the tree.
  - **success:** From an empty roadmap, a bootstrap turns depth-0 WBS nodes into lanes and depth-1 nodes into items linked to their subtrees, each windowed to its effective phase (a one-level tree yields one lane with depth-0 items); the result is previewed before anything is written; after apply every leaf with an effective phase is placed and coverage reports zero unplaced hours.

- **CAP-13 — Draft a Resource Plan from the roadmap** — **frozen 2026-08-22**, see `deferred-work.md`
  - **intent:** A planner turns bottom-up, time-placed demand into a top-down plan without retyping it.
  - **success:** Per-period demand becomes draft plan rows and allocations through the existing `GeneratePlanSheet` draft → preview → apply flow; nothing is written until the planner accepts.
  - **status:** Implementation is complete and unchanged (`buildDraftFromRoadmapLoad` in `roadmapDraftPlan.ts`, wired through `Roadmap.tsx`'s `openDraftPlan`), but the entry point is frozen at product's request: the "Draft plan from roadmap" button in the roadmap toolbar is unconditionally `disabled` (no longer keyed to `totalDemandHours(roadmapLoad) > 0`) with a title tooltip explaining it's temporarily disabled. Unfreezing is a one-line revert in `Roadmap.tsx`.

## Constraints

- **Hours are the source of truth.** They live in `WbsEstimate` and nowhere else. Any FTE or percentage on screen is derived for display and never written back.
- **`WbsItem` and `WbsEstimate` do not change.** The link lives in its own table keyed by `wbsItemId`, so the WBS stays a pure effort estimate and the shipped export/import and reconciliation contracts do not move.
- **The roadmap is flat and small by design.** Lanes hold items; items hold nothing. No nesting, now or as an "easy later addition" — depth is what turns a roadmap back into a schedule.
- **A leaf's effort belongs to exactly one roadmap item or to none.** Linking is N:1 with tree inheritance. No shared or split scope.
- **Roadmap positions are stored in periods, never ISO dates** — integers in the project's `planningMode` unit, aligned with `Allocation.periodNumber`, `modeConversion.ts` and phases. Calendar dates are derived from `Project.startDate` at render time.
- **Every write goes through `src/services/api.ts`**, and every new request field needs its matching `.strict()` Zod schema in `server-validation.ts` or the write returns 400.
- **Roadmap, coverage and demand logic are pure functions in `src/utils/`**, unit-tested without React or DOM, following the `wbsTree.ts` / `wbs.ts` precedent.
- **Reuse, don't re-derive:** `buildWbsTree`, `effectivePhases`, `withEffectivePhases` and `rollupHours` (`wbsTree.ts`); `getPhaseForPeriod`, `phaseStartOffset` and `remapPeriodNumber` (`phases.ts`); `hoursPerPeriod` (`calculations.ts`); `resolveDiscipline` and `buildReconciliationReport` (`wbs.ts`); the draft → preview → apply flow in `GeneratePlanSheet`.
- **The chart is ours; no Gantt library.** Settled on 2026-08-21 by a code-level audit of `@svar-ui/react-gantt@2.7.1` — see `timeline-component.md` for the evidence and the terms under which it would reverse. No Gantt or timeline dependency is added for this feature.
- **All chart geometry is pure functions in `src/utils/roadmapGeometry.ts`**, unit-tested without React or DOM. No component computes coordinates inline.
- **Every drag gesture has a keyboard equivalent** routed through the same snap-and-commit path. A bar that can only be placed by dragging is not shippable.
- **Visual parity with the app:** row height 34, header 44, Inter, tokens from `styles/globals.css` directly, `PHASE_COLORS` for phase bands, accent `#8f4f8f`, dark theme through the app's own tokens under `next-themes`.
- **`npm run typecheck` must pass before any slice is called done** — the build does not type-check and CI runs both.
- **Work lands on branch `feat/wbs-schedule-gantt`** (the name predates both the roadmap model and the drop of the Gantt library); `prisma/dev.db` is untracked and must not be committed or reverted.

## Non-goals

- Dependencies, auto-scheduling, critical path, slack. At roadmap altitude a simple "starts after X" may one day be worth having; it is not part of this contract, and nothing in the UI implies it exists.
- Progress, baselines, actuals and status. The roadmap plans; it does not track.
- Nested roadmap items, or a second tree of any kind.
- N:M scope links or effort shares between items.
- Per-item effort profiles (ramp, front-loaded). Demand is spread evenly across a window; the engine's output shape leaves room for profiles later.
- A capacity view with roles as rows and assignments as bars.
- Row virtualization, a canvas renderer, or free-pixel zoom. The roadmap is a few hundred DOM elements; see the performance budget in `timeline-component.md`.
- Named individuals as resources — the Resource List holds roles and rates, not people.
- Any change to WBS tab behaviour beyond one optional, hidden-by-default `Roadmap` column; any change to the WBS-3 reconciliation math or to the glide-data-grid tables.
- Several what-if roadmaps per project.

## Success signal

A planner opens a real project, creates the roadmap from the WBS in one action, merges and reshapes it into a dozen bars across four lanes, and — without leaving the screen — sees that Backend is over-committed in W6–W8 on the bar's stripe, in the load strip and in the by-period matrix with matching numbers, that coverage reports zero unplaced hours, and then produces a draft Resource Plan from that roadmap. Demonstrable end to end on `dev.db` data.

## Assumptions

- Demand is spread evenly across an item's window. The engine's contract is "a demand distribution per item"; a bar is one producer of such a distribution, so a later profile editor changes the producer, not the schema or the consumers.
- Unplaced effort is not zero: it contributes a baseline demand spread evenly over its effective phase. This is the same attribution WBS-3 already makes by phase, so the two reconciliations agree by construction.
- A period's capacity in hours is `hoursPerPeriod(planningMode, daysInFTE)`; FTE shown to the user is demand hours divided by that value.
- `Project.startDate` anchors period 1 and is optional. Without it the roadmap works in ordinals; with it, calendar dates are derived and never stored per item.
- A milestone marks the boundary at the end of `startPeriod`, has no duration and no scope.

## Open Questions

- What happens to roadmap items when the planning mode is converted weekly ↔ monthly? `modeConversion.ts` remaps allocations and phases; items need an equivalent rule, and the conversion is already documented as lossy.
- What happens to roadmap items when phases are reordered, split or deleted in Resource Plan? `remapPeriodNumber` is the precedent for allocations; an item whose window falls entirely outside the remaining phases needs a rule (clamp, or keep and flag).
- Should the JSON project export/import carry lanes, items, links and `Project.startDate`? WBS-4 shipped export/import for `WbsItem` and `WbsEstimate`; omitting the roadmap would silently drop it on round-trip. Recommended: yes, as `schemaVersion: 4`.
- **`feasiblePeriods` ignores contention between items.** Building the mockup exposed this: for a bar holding 700 h of Backend over a window whose average Backend supply is 143 h/period, the formula in `data-model.md` returns 5 periods against a current 7 — "it could be shorter" — while those same periods carry an over-demand stripe, because that supply is shared with two other producers. Either compute against *residual* supply (supply minus every other producer's demand in those periods), or keep the formula and label it "in isolation" wherever it is shown. Do not ship it unlabelled.
- **Bootstrap does not reach zero unplaced hours.** CAP-12's success criterion says it does, but "depth-0 → lane, depth-1 → item" leaves depth-0 *leaves* unplaced — exactly the level-of-effort nodes (Project management, contingency) the feature most needs to place. Either extend the rule (a depth-0 leaf becomes an item spanning its own phase) or weaken the criterion to "every leaf that has a depth-1 ancestor".
- **Level-of-effort work may need its own window kind.** Spread over a single phase, a PM node reads as a small permanent overload inside that phase and full idle capacity outside it — arithmetically correct, practically useless. A `kind: "spread"` window covering the whole project, not draggable, would state it honestly. Decide before the demand engine's tests are frozen.
- Should the load strip default to all roles combined rather than one role at a time? Reading the mockup, the over-commitment story needs two role switches to see, while the by-period matrix shows it at once.
- Should two items in the same lane that do not overlap in time share a row (the compact roadmap look), or does each item keep its own row? Owning the chart makes either possible — packing rows is a change to one layout function, not a library limit. The first release keeps one row per item; revisit once real roadmaps exist.

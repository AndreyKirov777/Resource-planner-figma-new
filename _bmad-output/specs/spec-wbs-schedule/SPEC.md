---
id: SPEC-wbs-schedule
companions:
  - data-model.md                                     # WbsSchedule delta, adapters, demand/supply formulas
  - svar-integration.md                               # SVAR contract: what is verified free, what is unproven, known bugs
  - ux-reference.md                                   # binding interaction and visual decisions
  - delivery.md                                       # spike gate, slices, per-slice verification
  - ../../project-context.md                          # binding convention catalog — read first when implementing
  - ../spec-resource-planner/SPEC.md                  # umbrella product contract this feature extends
  - ../../../docs/data-models.md                      # existing Prisma schema and period model
sources: []
---

> **ARCHIVED.** Do not implement from this folder. Retained for rationale only.
>
> **SUPERSEDED (2026-08-21)** by [`../spec-roadmap/SPEC.md`](../spec-roadmap/SPEC.md). The "schedule on WBS items" model was rejected: a WBS leaf is the unit of estimation, not of time. The replacement keeps the WBS unchanged and adds a separate, flat project roadmap linked N:1 to WBS subtrees. This file is retained for rationale and traceability only; do not implement from it.

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# WBS Schedule Mode

## Why

A pain to solve. The Resource Planner already estimates work two ways — bottom-up in the WBS (hours per role per work package) and top-down in the Resource Plan (roles × periods × allocation %) — and WBS-3 reconciles them by total, by discipline and by phase. What no view answers is **when**: the WBS knows how much work exists but not the weeks it lands in, so a planner cannot see that two Backend packages collide in one week while the plan staffs two engineers, or that a designer sits idle for a month. Phase assignment is the only time signal today, and it is too coarse to expose either problem.

Adding a schedule turns two layers into three — effort, time, capacity — and makes the reconciliation *per period* rather than per phase. Sequence belongs to the same problem: while work is placed by hand the project end date is *asserted*, and only once tasks constrain each other is it **computed**. So dependencies and the scheduling pass that honours them are part of this feature, not an extra. What stays out is everything about execution — this is a **planning** instrument: nothing here tracks progress or records what actually happened.

## Capabilities

- **CAP-1 — Mode switch inside the WBS tab**
  - **intent:** A planner can switch the WBS tab between Estimate (the existing table) and Schedule (the timeline) without losing their place.
  - **success:** Switching modes preserves the selected item, the set of collapsed nodes and the scroll position; the chosen mode is restored per project on reload; no new top-level tab appears.

- **CAP-2 — Schedule as an optional layer on a WBS item**
  - **intent:** A planner can give a WBS item a start period and a duration in periods, or leave it unscheduled.
  - **success:** A scheduled item persists `startPeriod` and `periodCount` and survives reload; an item with no schedule row is valid, loads without error, and renders as a derived range spanning its phase; deleting a WBS item removes its schedule row.

- **CAP-3 — Period timeline in the app's own units**
  - **intent:** A planner reads the timeline in the same phases and periods the Resource Plan uses, with calendar dates as a secondary label.
  - **success:** The scale shows phase bands in `PHASE_COLORS` above period columns labelled with the ordinal and the date derived from `Project.startDate`; zoom steps by planning unit (weeks/months, plus days for detail) rather than freely; Fit frames the whole project.

- **CAP-4 — Scheduling by direct manipulation**
  - **intent:** A planner schedules and reschedules work by dragging and resizing bars.
  - **success:** Drag and resize snap to period boundaries so no item can start mid-period; dropping a bar in another phase band reassigns `phaseName` and surfaces a toast that undoes that single change; every change persists through `api.ts` and reverts visibly on failure.

- **CAP-5 — Bars that carry effort, not status**
  - **intent:** A planner sees, on each bar, how much work it holds and how many people that implies.
  - **success:** Leaf bars are labelled with hours and FTE; parents render as summary bars spanning their children and are not draggable; unscheduled items render as a distinct derived bar labelled as such; a bar whose demand exceeds Resource Plan supply in some of its periods carries a warning stripe over exactly those periods; no progress affordance exists anywhere.

- **CAP-6 — Demand engine**
  - **intent:** The system derives, from effort and schedule, how much of each role is needed in each period, and compares it with what the Resource Plan supplies.
  - **success:** A pure module returns demand per `(role, period)` in hours and FTE, supply per `(role, period)` from `Allocation`, their variance, and the minimum feasible duration of a task at current staffing; role→discipline resolution reuses `resolveDiscipline`; unit tests cover the empty project, unscheduled items, unmapped roles and overlapping tasks.

- **CAP-7 — Load strip under the timeline**
  - **intent:** A planner sees, in one glance across the project, which periods are over-committed and which have idle capacity.
  - **success:** A per-period demand-versus-supply strip renders in the same column grid as the timeline, switchable between role and discipline, marking over-demand and idle capacity distinctly; clicking a period reveals the tasks that produce that demand.

- **CAP-8 — Reconciliation by period**
  - **intent:** A planner reviews per-period gaps in the same panel that already reports total, discipline and phase gaps.
  - **success:** `ReconciliationPanel` gains a by-period section whose numbers agree with the load strip cell for cell, plus a category listing items whose scheduled periods fall outside their assigned phase.

- **CAP-9 — Task editor beside the timeline**
  - **intent:** A planner edits a task's schedule and roles while still seeing the timeline react.
  - **success:** The editor is a side panel that compresses the timeline rather than covering it; it edits name, phase, start period, duration and roles; roles are chosen with the existing `RolesEditor` backed by the Resource List; it displays demand, plan supply and feasible duration; fields save on blur with no Save button, and a failed save reverts the field and reports why.

- **CAP-10 — Draft a Resource Plan from the schedule**
  - **intent:** A planner turns bottom-up demand into a top-down plan without retyping it.
  - **success:** Per-period demand becomes draft plan rows and allocations through the existing `GeneratePlanSheet` draft → preview → apply flow; nothing is written until the planner accepts.

- **CAP-11 — Structure parity between modes**
  - **intent:** A planner restructures the WBS from either mode with the same gestures.
  - **success:** Add sibling, add child, indent, outdent and delete work identically from the row context menu and the keyboard in both modes; the keyboard hint line is present in both.

- **CAP-12 — Dependencies between tasks**
  - **intent:** A planner can record that one item must follow another, with a type and a lag, and see when the current schedule violates that.
  - **success:** A link is created by dragging between two scheduled bars, persists with `type` and `lag`, and is drawn on the timeline; a link that would form a cycle is rejected at the API with a clear reason; a link whose constraint the schedule violates is flagged on the bar and listed in reconciliation. **Nothing moves automatically at this stage, and nothing in the UI implies it will.**

- **CAP-13 — Auto-scheduling from dependencies**
  - **intent:** Moving or resizing an item pulls its dependent work along, so the project's end date follows from the network rather than from where bars were dropped.
  - **success:** A predecessor's change shifts its successors in topological order to satisfy every link type and lag, snapped to period boundaries; the resulting project end date and the critical path are derived and displayed; a shift that cannot be satisfied is reported rather than silently dropped; the whole cascade is one undoable operation.

## Constraints

- **Hours are the source of truth.** SVAR expresses an assignment as a percentage (`units`); this app stores absolute hours in `WbsEstimate`. Any `units` handed to SVAR is derived for display and never written back as truth.
- **`WbsItem` and `WbsEstimate` do not change.** Schedule lives in a separate optional table so the WBS stays a pure effort estimate and the shipped export/import and reconciliation contracts do not move.
- **Schedule is stored in periods, never ISO dates** — integers in the project's `planningMode` unit, so it aligns with `Allocation.periodNumber`, with `modeConversion.ts` and with phases. Calendar dates are derived from `Project.startDate` at render time.
- **Each mode edits only its own layer.** Hours are read-only in Schedule; duration is read-only in Estimate.
- **Every write goes through `src/services/api.ts`**, and every new request field needs its matching `.strict()` Zod schema in `server-validation.ts` or the write returns 400.
- **Schedule and demand logic are pure functions in `src/utils/`**, unit-tested without React or DOM, following the `wbsGrid.ts` / `wbs.ts` precedent.
- **Reuse, don't re-derive:** `getPhaseForPeriod` and `phaseStartOffset` (`phases.ts`), `hoursPerPeriod` (`calculations.ts`), `resolveDiscipline` (`wbs.ts`), `availableRoles` and `deriveDiscipline` (`RolesEditor`), `createEstimateCommitter` (`wbsGrid.ts`), and the draft→preview→apply flow in `GeneratePlanSheet`.
- **Free edition only:** `@svar-ui/react-gantt` under MIT. No PRO packages, no private registry, no license keys. Feature availability is settled by running the code, never by the vendor's comparison table — see `svar-integration.md`.
- **Estimate mode keeps its current glide-data-grid implementation unchanged,** and Schedule mode does not attempt to reproduce that table in SVAR's left grid.
- **Visual parity with the app:** row height 34, header 36, Inter, tokens from `styles/globals.css`, `PHASE_COLORS` for phase bands, grid accent `#8f4f8f`, theme following `next-themes` via `Willow` / `WillowDark`.
- **`npm run typecheck` must pass before any slice is called done** — the build does not type-check and CI runs both.
- **Work lands on branch `feat/wbs-schedule-gantt`**; `prisma/dev.db` is untracked and must not be committed or reverted.

## Non-goals

- Slack, resource levelling, and any scheduling mode beyond a forward pass (no backward planning, no constraint solving). CAP-13 shifts successors forward to satisfy links; it does not optimise, level or reverse-plan.
- Progress, baselines, actuals and task status. The mode plans; it does not track.
- A capacity view with people or roles as rows and assignments as bars. That is a separate later feature, and if built it belongs on a resource-timeline library rather than on SVAR.
- Multiple activities per WBS item, or several what-if schedule scenarios per project. `WbsSchedule` stays 1:1 until a real need appears.
- Named individuals as resources — the Resource List holds roles and rates, not people.
- Any change to Estimate mode behaviour, to the reconciliation math shipped in WBS-3, or to the glide-data-grid tables.

## Success signal

A planner opens the WBS tab of a real project, switches to Schedule, drags the work packages onto weeks, and — without leaving the screen — sees that Backend is over-committed in one specific week and idle in two others, then produces a draft Resource Plan from that schedule. Demonstrable end to end on `dev.db` data: the same over-committed week is visible on the bar's warning stripe, in the load strip, and in the by-period reconciliation table, with matching numbers.

## Assumptions

- Demand is spread evenly across a task's periods. A ramp or front-loaded profile is a later refinement and does not change the data model.
- A period's capacity in hours is `hoursPerPeriod(planningMode, daysInFTE)`; FTE shown to the user is demand hours divided by that value.
- `Project.startDate` anchors period 1. Calendar dates are derived from it and never stored per item, so moving the start shifts the whole scale without touching a single schedule row.

## Open Questions

- Does SVAR's `ResourceLoad` actually work in the MIT build? Its code looks complete, yet the vendor's pricing page lists the load chart as PRO. If it works, CAP-7 needs no custom chart; if not, build it on recharts. Decide in the spike.
- What happens to `WbsSchedule` rows when the planning mode is converted weekly ↔ monthly? `modeConversion.ts` remaps allocations; schedule rows need an equivalent rule, and that conversion is already documented as lossy.
- What happens to `WbsSchedule` rows when phases are reordered, split or deleted in Resource Plan? `phases.ts` has `remapPeriodNumber` for allocations; schedule rows likely need the same remap.
- Should the JSON project export/import carry `WbsSchedule` and `Project.startDate`? WBS-4 shipped export/import for `WbsItem` and `WbsEstimate`; omitting schedule would silently drop it on round-trip.
- When CAP-13 shifts a successor out of its assigned phase, does it reassign `phaseName`, stop at the phase boundary, or move and flag? Same question for a shift past the last phase.
- Do links participate in the JSON project export/import, alongside `WbsSchedule` and `Project.startDate`?
- Should an unscheduled item contribute derived demand — spread across its phase — to the load strip and by-period reconciliation, or count as zero until explicitly scheduled? The mockup shows a derived ghost bar; whether it also feeds demand is undecided.

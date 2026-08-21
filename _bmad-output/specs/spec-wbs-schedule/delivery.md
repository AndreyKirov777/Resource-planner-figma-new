# Delivery: gate, slices, verification

Companion to `SPEC.md`. What ships in what order, and what has to be true before each step. Branch: `feat/wbs-schedule-gantt` (cut from `feat/ai-plan-generation`; `main` is 120 commits behind and is not the base).

## Gate 0 — Spike (1–2 days, go/no-go)

Nothing else starts until this answers. Throwaway code, real `dev.db` data at production row counts.

**Must answer:**

1. Do SVAR issues **#10** (horizontal-scroll freeze) and **#14** (cumulative header-vs-grid drift) reproduce? Either one reproducing is a **no-go** — both make the timeline unreadable and neither has a workaround.
2. Does **#20** (`move-task` crash) reproduce? Expected yes; mitigation is already in the design — row drag-to-restructure stays off in Schedule mode.
3. How do phase bands via `highlightTime` and the `Willow` theme look against the app's tokens? Cosmetic, but a bad answer costs a chunk of CAP-3.
4. **Which nominally-PRO features actually work in the MIT build** — the Resources tab, the avatar-group column, `ResourceLoad`, `markers`. Each one confirmed removes work from Slice B; `ResourceLoad` in particular may replace the custom load strip entirely (CAP-7).

**No-go path:** switch to DHTMLX Gantt Community v10 per `svar-integration.md`. `data-model.md` survives unchanged; `wbsGantt.ts` output shape and the component layer are rewritten. Re-run this gate against DHTMLX before continuing.

**Output:** a go/no-go note plus a revised Slice B scope reflecting answer 4.

## Slice A — Schedule it and see the FTE

Delivers CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, and the per-task half of CAP-6. Editing is by dragging only; there is no editor panel yet.

Prisma migration and `.strict()` schemas · `Project.startDate` in project settings, with a non-blocking banner when unset · `wbsGantt.ts` and `scheduleLoad.ts` with their unit tests · the mode toggle with preserved selection, collapse and scroll · two-level scale with phase bands · derived ghost bars · drag/resize snapped to periods · hours and FTE on bars · tooltip with demand versus supply · out-of-capacity stripe · phase reassignment with an undo toast.

**Why this is a shippable slice:** a planner can already schedule the work and see, per task, whether the plan staffs it. That is the smaller half of the reconciliation, and it is useful alone — for a pre-sales walkthrough it may be all that is needed.

## Slice B — Full reconciliation and editing parity

Delivers CAP-7, CAP-8, CAP-9, CAP-10, CAP-11 and the rest of CAP-6.

Load strip (or SVAR's `ResourceLoad`, per Gate 0 answer 4) · by-period section in `ReconciliationPanel` plus the out-of-phase category · schedule → draft Resource Plan through `GeneratePlanSheet` · side-panel editor with `RolesEditor` · context menu and structure hotkeys at parity with Estimate · `Columns` menu · `Fullscreen` · collapse/expand all.

**Why after A:** every item here reads the demand engine that Slice A proves out on one task at a time. Building the project-wide view first would mean debugging the engine through an aggregate.

## Slice C — Only on request

Fit durations to plan · a demand row inside Resource Plan · explicit milestones as a first-class type · timeline PNG export · phase hour totals in the band · and only then dependencies, with an in-house shift-on-change rule (never inert links).

## Open questions block which slice

| Question (see `SPEC.md`) | Blocks | Cheapest resolution |
|---|---|---|
| Does `ResourceLoad` work in MIT? | B | Gate 0 |
| Schedule rows across weekly ↔ monthly conversion | A | decide with the migration; `modeConversion.ts` sets the precedent |
| Schedule rows when phases are reordered/split/deleted | A | reuse `remapPeriodNumber` from `phases.ts` |
| Does export/import carry schedule and `startDate`? | A | follow WBS-4's shape; omitting it silently loses data on round-trip |
| Do unscheduled items contribute derived demand? | B | affects the engine's contract, so settle before its tests are written |

The first four need an answer during Slice A; the fifth before the demand engine's tests are frozen.

## Verification per slice

- `npm run typecheck` clean — the build does not type-check and CI runs both.
- `npm test` clean, including new unit tests for `wbsGantt.ts` and `scheduleLoad.ts` covering: empty project, unscheduled item, item without estimates, overlapping tasks in one period, unmapped role, phase reorder, weekly ↔ monthly conversion.
- Integration test for the schedule endpoints, with `await isolateTestDb('<file-unique-name>')` before `await import('./server')` — a static import hoists above it and silently runs against `prisma/dev.db`.
- Manual check on real data that the same over-committed period reads identically in three places: the bar's stripe, the load strip, and by-period reconciliation. Divergence there means two implementations of the math exist, which the design forbids.

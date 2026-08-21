# Delivery: slices and verification

Companion to `SPEC.md`. What ships in what order, and what has to be true before each step. Branch: `feat/wbs-schedule-gantt` (cut from `feat/ai-plan-generation`; `main` is 120 commits behind and is not the base; the branch name predates both the roadmap model and the decision to drop the Gantt library).

## The spike is done — no library gate remains

The earlier plan opened with a go/no-go spike on `@svar-ui/react-gantt`. That question was settled on 2026-08-21 by a code-level audit plus a working mockup, and the answer was to build the chart ourselves (`timeline-component.md`). There is no Gate 0. What the mockup already established, on a demo project of 16 weekly periods, 4 phases, 4 lanes and 12 items:

**Settled — do not re-litigate.**

- The three column grids (header, rows, load strip) stay aligned from one `periodWidth`, with a single horizontal scroller driving the strip.
- Pointer drag with move, both resize edges and cross-lane drop, snapping on release with a ghost preview, clamping and a working undo: **146 lines**, with `snapDrag` covered by 16 passing assertions.
- Phase bands of uneven width over uniform period columns, in both themes.
- The demand engine's arithmetic: per-period demand summed over roles equals the WBS total from WBS-3 exactly, linked-subtree effort equals `itemEffort` for every item, and over-demand stripes cover only the affected periods.
- The three coverage categories and the by-period matrix render from the same engine call as the bars and the strip.

**Not established by the mockup — real work in Slice A.**

- Persistence, the API surface, `.strict()` schemas, migrations.
- Keyboard parity for every gesture (the mockup is pointer-only).
- The scope picker's write path — moving a node that another item owns.
- Bootstrap against real WBS shapes rather than one hand-made tree.
- Behaviour under weekly ↔ monthly conversion and phase edits.
- React reconciliation: the mockup re-renders by `innerHTML`, which the real component cannot do.

## Slice A — A roadmap with scope

Delivers CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-11 (without the read-only demand block) and CAP-12.

Prisma migration (`Project.startDate`, `RoadmapLane`, `RoadmapItem`, `RoadmapLink`) and `.strict()` schemas · all endpoints in `data-model.md` · `roadmap.ts` with `effectiveRoadmapItems`, `itemEffort`, `coverage`, `bootstrapRoadmap`, `toRoadmapRows` and the period↔date adapters, with their unit tests · `roadmapGeometry.ts` with `snapDrag` and the rest, with its unit tests · the Roadmap tab with empty state · lanes and items on the period timeline with phase bands · pointer drag, resize and cross-lane drop, snapped on release, each one `PATCH` with an undo toast · **keyboard equivalents for all of them** · side-panel editor with fields and the scope picker · the optional `Roadmap` column in the WBS table · bars labelled with hours and FTE, empty-scope style, per-role tooltip (demand side only) · bootstrap dialog with preview · the three coverage cards in `ReconciliationPanel`.

**Why this is a shippable slice:** a planner can say when each workstream happens, see how much effort each window holds, and see what part of the estimate is not placed anywhere. That is a roadmap with numbers on it, and for a pre-sales walkthrough it may be all that is needed.

**Why CAP-12 is in A and not later:** without bootstrap the first hour with the feature is data entry, and the value of linking is invisible until links exist. Bootstrap is a pure function plus one bulk endpoint — cheap, and it makes every later demo start from a populated roadmap.

**Build the geometry module first, and its tests with it.** Every later argument about a mis-drawn bar is settled in a unit test rather than in the browser, and the component stays a mapping from rows to DOM.

## Slice B — Capacity

Delivers CAP-8, CAP-9, CAP-10, CAP-13 and the read-only block of CAP-11.

`roadmapLoad.ts` with its unit tests and the WBS-3 total invariant · out-of-capacity stripe on bars · supply lines in the tooltip · load strip in the timeline's column grid with the per-period popover · by-period roles × periods matrix in `ReconciliationPanel`, rendering from the phase baseline when the roadmap is empty · feasible duration and conflict statements in the editor · roadmap → draft Resource Plan through `GeneratePlanSheet`.

**Why after A:** every item here reads the demand engine, and the engine reads links. Building the aggregate view before links exist would mean debugging the engine against the phase baseline only, which hides the interesting cases — overlapping windows and carved-out subtrees.

## Slice C — Only on request

Compact lanes (non-overlapping items packed into one row — a change to one layout function now that we own it) · "starts after X" ordering hints between items, display-only · per-item effort profiles · row drag-to-reorder · timeline PNG export in the `clientViewPng.ts` manner · export/import of the roadmap if the open question resolves to "later" rather than "in A".

## Open questions block which slice

| Question (see `SPEC.md`) | Blocks | Cheapest resolution |
|---|---|---|
| `feasiblePeriods` ignores contention between items | B | decide before the engine's tests are frozen: residual supply, or keep the formula and label it "in isolation" everywhere it is shown |
| Bootstrap cannot reach zero unplaced hours (depth-0 leaves) | A | extend the rule (a depth-0 leaf becomes an item spanning its phase) or weaken CAP-12's criterion — decide with the bootstrap's tests |
| Does level-of-effort work need a `spread` window kind? | B | decide before the demand engine's tests are frozen; it changes a producer, not the schema |
| Roadmap items across weekly ↔ monthly conversion | A | decide with the migration; `convertPhasesToMonthly` / `convertPhasesToWeekly` set the precedent — scale `startPeriod` and `periodCount` the same way phases are scaled |
| Roadmap items when phases are reordered/split/deleted | A | reuse `remapPeriodNumber`; an item whose window no longer overlaps any phase is kept and surfaces in *Phase mismatch* rather than being clamped silently |
| Does export/import carry lanes, items, links and `startDate`? | A | follow WBS-4's shape as `schemaVersion: 4`; omitting it silently loses data on round-trip — recommended in A |
| Should the load strip default to all roles combined? | B | cheap either way; decide when the strip is built |
| One row per item vs compact lanes | C | ship one row per item; revisit with real roadmaps |

The three period questions need an answer during Slice A's migration, before the endpoints are frozen.

## Verification per slice

- `npm run typecheck` clean — the build does not type-check and CI runs both.
- `npm test` clean, including new unit tests for `roadmap.ts` covering: empty WBS, empty roadmap, a linked parent with an unlinked subtree, a grandchild carved out to another item, a link on a leaf, an item with no scope, a milestone refused scope, bootstrap on a one-level and a two-level tree, bootstrap with an unphased depth-1 node, bootstrap with a depth-0 leaf, phase reorder, weekly ↔ monthly conversion, calendar round-trip at period boundaries with and without `startDate`.
- Unit tests for `roadmapGeometry.ts` per the testing contract in `timeline-component.md`: `snapDrag` in all three modes with sub-period, exact and multi-period deltas; clamping at period 1, at the project end and at minimum duration; a milestone; `periodX`/`periodAtX` round-tripping at boundaries; `stripeSegments` clipped at both bar edges; `phaseBands` over uneven phases summing to the full width.
- From Slice B, unit tests for `roadmapLoad.ts`: empty project, phase baseline only, two overlapping items in one period, a carved-out subtree counted once, an unmapped role, unplaceable effort excluded from periods but present in the total, the WBS-3 total invariant, `feasiblePeriods` against zero supply.
- Component tests drive the **keyboard** path rather than the pointer path — same `snapDrag`, same commit, no pointer harness needed. One test asserts the three column grids agree: for a given `periodWidth`, the header cell, the row tint column and the load cell for period *p* share a left edge and a width.
- Integration tests for the roadmap endpoints, with `await isolateTestDb('<file-unique-name>')` before `await import('./server')` — a static import hoists above it and silently runs against `prisma/dev.db`. Cover: the project invariant on links (400), milestone scope refused (400), bulk refused on a non-empty roadmap (409), cascade on lane delete, link moved by `PUT /links`.
- Manual check on real data that the same over-committed period reads identically in three places: the bar's stripe, the load strip, and the by-period matrix. Divergence there means two implementations of the math exist, which the design forbids.
- Manual check that the WBS tab, with the `Roadmap` column hidden, is pixel-identical to before.

# UX reference

Companion to `SPEC.md`. The binding interaction and visual decisions behind CAP-1, CAP-3, CAP-4, CAP-5, CAP-6, CAP-9, CAP-11 and CAP-12. The interactive mockup of every screen below — with working drag, resize and cross-lane drop — is published at `https://claude.ai/code/artifact/c480e057-abe0-4618-9e74-91791e66e8bf` — built on one demo project whose figures are computed by the formulas in `data-model.md`, so it doubles as a check on them. The earlier mockups at `https://claude.ai/code/artifact/2ce1fe15-b528-4b73-b7ed-17fee7d8e824` predate the roadmap model and are traceability only. This file is the contract.

## Four principles the design resolves against

1. **Three artifacts, three jobs.** WBS says what, Roadmap says when, Plan says who. None of them is a view of another; links join them.
2. **The roadmap stays a roadmap.** Ten to twenty bars, lanes, milestones. No nesting, no dependencies, no task-level detail — if it needs those, it has become a schedule, and that is not this tool.
3. **Time in the app's units.** Phases and periods lead; calendar dates explain. Dragging snaps to period boundaries.
4. **Planning only.** No progress, no baselines, no actuals. Nothing on screen may imply tracking.

## Tab

A new top-level `Roadmap` tab, placed immediately after `WBS` in the `TabsList`. Header: `Project Roadmap` (18px/600) · hint (12px, muted): `Drag bar to move · drag edge to resize · drag to another lane · Space to edit`.

The WBS tab is unchanged except for one optional column, `Roadmap`, hidden by default and exposed through the existing columns-visibility menu. It shows the node's effective roadmap item — in normal weight when linked directly, muted with an `↑` prefix when inherited — and a dropdown listing the project's bars plus `None`. Setting it writes `PUT /api/wbs-items/:id/roadmap-link`.

## Empty state

A centred card inside the bordered container: *No roadmap yet.* Two actions — **Create from WBS** (primary; disabled with an explanation when the WBS is empty) and **Add lane**. Below, one line: *A roadmap is a dozen bars, not a task list. Link WBS scope to them and the bars fill with hours.*

## Bootstrap dialog (CAP-12)

A shadcn `Dialog` with a preview table: `Lane · Item · Hours · Window · Phase`. Rows whose item has no effective phase are marked *spans project — no phase* in amber. Footer: `Cancel` · `Create N lanes, M items`. Nothing is written until the second button. After apply, the roadmap renders and a toast reports the counts and that coverage is complete.

## Roadmap layout

A single bordered container (`rounded-lg`, `border-gray-200`) holding, top to bottom:

**Toolbar strip, 44px.** Left: `Start <date>` (or `Set start date` when null), planning unit, zoom −/+, `Fit`, then two labeled switches (`text-xs`, label then switch, no icons) — `Lane bars` and `Unlinked` — then a separator, then `Load <role>`. Right: `Add lane`, `Add item`, fullscreen. Buttons stay shadcn `outline`/`sm` so the strip reads as app chrome, not as a library's toolbar. `Unlinked` tooltip: `Dashed outline on bars and spreads with no WBS link`. Both switches default on and persist per project in localStorage.

**Body**, a row of: left grid 320px — columns `Lane / Item` 200, `Hours` 64, `FTE` 56 — then the timeline, then the editor panel when open (360px, compressing the timeline rather than covering it).

**Header, 44px on both sides.** Timeline header is two rows inside it — 22px phase bands over 21px period columns, the odd pixel going to the container's own bottom border: phase bands with WBS hour totals over period columns labelled `W4 · 28 Sep` (or `W4` alone without a start date). The left grid's header is one line vertically centred in the same 44px.

**Rows, 34px,** matching `ROW_HEIGHT`. Lane rows use `#f6f6f6` / `#1f1f1f` / 600 as `SECTION_ROW_THEME` already does for WBS section rows; their `Hours` / `FTE` cells sum their items. When the `Lane bars` toggle is on (the default), a lane row also draws a summary bar — see "Bar visual language" below; off, the row is exactly the tinted band it always was, no bar. Item rows sit under their lane, one row per item. Lanes collapse and expand; collapse state is per project in localStorage like `loadHiddenColumns`. `Lane bars` and `Unlinked` are independent per-project localStorage preferences alongside it.

**Load strip, 64px,** below the rows, its label in the left-grid column and its cells in the timeline's column grid.

**Reconciliation** stays where it is — a collapsible strip below the container, on both the WBS and Roadmap tabs.

## Bar visual language

Colour encodes kind and state only; the phase already colours the background, so bars do not also encode phase or lane.

| Element | Treatment |
|---|---|
| Bar with scope | filled `#8f4f8f`, 18px, label is the item **name**; hours and FTE live in the left grid and the tooltip |
| Bar without scope | when Unlinked is on (default): dashed 1.5px `#8f4f8f` outline, translucent fill, accent name; when Unlinked is off: the same filled paint as a scoped bar. Without scope means no direct WBS link (`wbsItemIds.length === 0`), not zero hours. |
| Spread | 10px hatched band across the project, or the same dashed empty-scope treatment as a bar when Unlinked is on and it has no WBS link; label is the item **name** |
| Milestone | 12px `#030213` square rotated 45°, name to the right |
| Demand above supply | 3px amber stripe along the bar's bottom **over the affected periods only** |
| Phase mismatch | small amber marker at the bar's start edge; tooltip names the leaf and its phase |
| Selected | 2px `#030213` ring plus a tinted row |
| Lane summary bar | bracket-with-end-caps silhouette (flat slab + short downward tab at each end), a neutral slate `LANE_BAR` (`#33627D`, dark `#7FA8C0`) — deliberately not the item accent, so it is never misread as schedulable; spans the union window of the lane's window-bearing items (a spread item never widens it — see the chip below); read-out only, click toggles collapse |
| Lane bar, collapsed | additionally carries the lane's rolled-up milestone ticks and the union of its children's over-demand periods as the same amber stripe |
| Lane spans-project chip | `» N spread`, pinned at the timeline's left edge, for a lane owning one or more spread items — the bar's window is unaffected |

Amber for over-demand and red for idle capacity, matching `varianceClass` in `ReconciliationPanel.tsx`. Two colour languages for one concept is a defect.

**Tooltip** on a bar: name · window as `W3–W10 · 12 Jan – 6 Mar` · total hours and FTE · then one line per role: `Backend 620 h · 1.9 FTE · plan 1.0 FTE` with the plan figure amber when short.

## Direct manipulation (CAP-4)

Drag moves a bar within its lane; drag onto another lane's rows re-lanes it. Resize from either edge. Both snap to period boundaries on drop, never mid-gesture, so the gesture feels continuous and the result is exact. Every drop is one `PATCH` and one toast with `Undo`; undo is a single-operation revert through the same endpoint. A failed write snaps the bar back and the toast says why.

Row drag-to-reorder inside the left grid is **off** in the first release — not for a library reason but because reordering rows and re-laning bars are two gestures over the same rows, and shipping both at once makes each harder to learn. Lanes and items reorder through the row context menu (`Move up` / `Move down`) and the editor.

**Keyboard parity.** Every gesture above has a key equivalent — `←`/`→` move, `⇧←`/`⇧→` resize the finish, `⌥←`/`⌥→` resize the start, `⌃↑`/`⌃↓` change lane, `Esc` cancels an in-flight drag. The hint line names the first two; the rest live in the row menu next to their commands. This is a requirement, not a nicety: see `timeline-component.md`.

## Load strip (CAP-9)

One cell per period: a demand column against a dashed supply line, plus `demand / supply` in tabular figures. Over-demand cells are amber and emphasised, idle cells muted. Role or discipline is chosen from the toolbar. Clicking a period opens a popover listing the items (and the phase-baseline bucket, when unplaced effort contributes) that produce that demand, each with its share.

## Editor panel (CAP-11)

Non-modal by design — the planner must see the bar move while typing. Opens on `Space`, on double-click of a bar, or from the row menu.

Fields, top to bottom: Name; Lane (select); Kind (`Bar` / `Milestone` toggle — switching to milestone with scope linked is refused with an explanation); Start (period picker, not a free date); Duration (stepper in periods, hidden for milestones).

**Scope** section: a search box and the WBS tree with checkboxes, indented, hours at the right of every node. Checking a node checks its subtree visually and stores one link. A node inherited from a checked ancestor shows a muted check it cannot toggle individually — to carve it out, check it explicitly, which creates its own link. A node owned by *another* item is muted with that item's name; checking it moves it, and the panel says so before the write. The section header shows `Linked: 1 240 h across 14 leaves`.

**Read-only block:** total effort; demand in FTE by role; plan supply over the window; feasible duration (*"At current staffing this cannot take fewer than 5 weeks — Backend is the limit"*); and any conflict stated concretely — *"W6 is overloaded — 3.4 FTE Backend needed across Platform and Mobile, 2.0 planned"*.

No Save button; fields commit on blur, as the tables already do. A failed write reverts the field and says why. Advice in a conflict message must be verifiable, not plausible: do not suggest a specific period unless the engine confirms it is free.

## Reconciliation additions (CAP-7, CAP-10)

Three new cards beside the existing `Unassigned (WBS)` and `Unmapped (plan)` callouts, same visual grammar:

- **Unplaced (WBS)** — `380 h · 14% of estimate`, then the highest unplaced nodes with hours; each row has `Place in…` opening the item select.
- **Empty (roadmap)** — bars with no scope, each with `Link scope` opening the editor.
- **Phase mismatch** — `Item · leaf · leaf's phase · item's window`.

The **by-period** section is a roles × periods table under the existing by-phase one: one row per role (discipline rows when the toolbar is in discipline mode), one column per period, each cell `demand / supply` with `varianceClass` colouring, a total column at the right and a total row at the bottom. It renders from the phase baseline even when the roadmap is empty, with a caption saying so. Numbers here, on the load strip and on the bar stripes come from the same engine call; a mismatch is a defect.

## Deliberately absent

Progress handles and fills; percentage-complete of any kind; dependency arrows and link handles; baselines and critical path; nested items and any "add child" affordance; free calendar zoom by day as a default; row drag-to-reorder in the first release; a second resource picker — roles come from the WBS through links, never from the roadmap.

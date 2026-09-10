# UX reference

Companion to `SPEC.md`. The binding interaction and visual decisions behind CAP-1, CAP-3, CAP-4, CAP-5, CAP-7 and CAP-9. Rendered mockups of every screen below are published at `https://claude.ai/code/artifact/2ce1fe15-b528-4b73-b7ed-17fee7d8e824`; the narrative rationale is at `https://claude.ai/code/artifact/2e6cda03-6f54-42dd-b8e5-e3168ae05ba4`. Those are references — this file is the contract.

## Four principles the design resolves against

1. **One tree, two modes.** The WBS is the single source of truth about scope. Estimate and Schedule are two jobs over the same rows, not two datasets.
2. **Three layers, one reconciliation.** Effort × time yields demand; the Resource Plan yields supply; their per-period difference is the point of the screen, not the bars.
3. **Time in the app's units.** Phases and periods lead; calendar dates explain. Dragging snaps to period boundaries, and so does every shift a dependency causes.
4. **Planning only.** No progress, no baselines, no actuals. Nothing on screen may imply tracking.

## Tab header

Unchanged from today except for one addition, in this order: `Work Breakdown Structure` (18px/600) · **Estimate | Schedule** toggle · keyboard hint (12px, muted).

The toggle is a Radix `ToggleGroup`, `variant="outline" size="sm"`, matching the Weekly/Monthly control in Resource Plan. Hint text differs per mode — Estimate keeps `structureHintText()`; Schedule reads `Drag bar to schedule · drag edge to resize · Tab indent · ⇧Tab outdent · Space to edit`.

`Enter` is taken by "add sibling" in Estimate, so Schedule opens the editor with `Space`, and says so in the hint.

## Schedule layout

A single bordered container (`rounded-lg`, `border-gray-200`) holding, top to bottom:

**Toolbar strip, 44px.** Left: `Start <date>`, planning unit, zoom −/+, `Fit`, separator, `Load <role>`. Right: `Columns`, fullscreen. All shadcn `outline`/`sm` buttons so the strip reads as app chrome, not as a library's toolbar.

**Body**, a row of: left grid 380px — columns `#` 44, `Task` 200, `Phase` 76, `Hours` 60 — then the timeline, then the editor panel when open (340px, compressing the timeline rather than covering it).

**Header, 44px on both sides.** Timeline header is two 22px rows: phase bands with WBS hour totals over period columns labelled `W4 · 28 Sep`. The left grid's header is one line vertically centred in the same 44px.

**Rows, 34px,** matching `ROW_HEIGHT`. Section rows (depth 0) use `#f6f6f6` / `#1f1f1f` / 600 as `SECTION_ROW_THEME` already does in Estimate mode.

**Load strip, 64px,** below the rows, its label in the left-grid column and its cells in the timeline's column grid.

**Reconciliation** stays where it is — a collapsible strip below the container, in both modes.

## Bar visual language

Colour encodes kind and state only; the phase already colours the background, so bars do not also encode phase.

| Element | Treatment |
|---|---|
| Leaf task | filled `#8f4f8f`, 18px, label `680 h · 2.8 FTE` (roles appended when width allows) |
| Summary (parent, depth 0 or any row with children) | 8px `#030213`, spans children, not draggable |
| Milestone | 12px `#030213` square rotated 45° |
| Unscheduled | dashed 1.5px outline, translucent fill, label `derived from phase — drag to schedule` |
| Demand above supply | 3px amber stripe along the bar's bottom **over the affected periods only** |
| Selected | 2px `#030213` ring plus a tinted row |

Amber for over-demand and red for idle capacity, matching `varianceClass` in `ReconciliationPanel.tsx`. Two colour languages for one concept is a defect.

## Load strip

One cell per period: a demand column against a dashed supply line, plus `demand / supply` in tabular figures. Over-demand cells are amber and emphasised, idle cells muted. Role or discipline is chosen from the toolbar. Clicking a period reveals the tasks producing that demand.

## Editor panel

Non-modal by design — the planner must see the bar move while typing. Fields: Name; Phase (with its colour swatch); Start (period picker, not a free date); Duration (stepper in periods); Roles (existing `RolesEditor`, chips from the Resource List). Then a read-only block: total effort, demand in FTE by role, plan supply over the same periods, and any conflict stated concretely — *"W6 is overloaded — 3.4 FTE Backend needed across overlapping tasks, 2.0 planned"*.

No Save button; fields commit on blur, as the tables already do. A failed write reverts the field and says why.

Advice in a conflict message must be verifiable, not plausible: do not suggest a specific period unless the engine confirms it is free.

## Dependencies

Arrows in the app's ink (`#030213` at reduced opacity) so they read as structure, not as another data series. Link handles appear on a bar only on hover, and a drag between two bars creates the link; a drag that would form a cycle is refused with a toast naming the two items, not a silent no-op.

A **violated** link — the successor starts earlier than its type and lag allow — is drawn in amber and the successor's bar carries an amber marker at its start edge, with the shortfall in the tooltip (*"starts 2 weeks before Tech audit finishes"*). Violations also list in reconciliation.

Until auto-scheduling ships (CAP-13), nothing in this may suggest that moving a predecessor will move anything else: no ghost preview of a cascade, no "will shift N tasks" hint. A flagged violation is an honest statement; an implied movement that does not happen is not. When CAP-13 lands, the cascade becomes one undoable operation with a single toast reporting how many items moved.

## Deliberately absent

Progress handles and fills; SVAR's own task editor, toolbar and vertical markers; free calendar zoom by day as a default; row drag-to-restructure in Schedule mode (SVAR issue #20); a second resource picker beside `RolesEditor`.

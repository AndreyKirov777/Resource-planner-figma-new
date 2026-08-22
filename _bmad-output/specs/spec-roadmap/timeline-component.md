# Timeline component contract

Companion to `SPEC.md`. Replaces `svar-integration.md`, which is retained as traceability only. This is the contract for the roadmap chart, which the app owns end to end.

## Why we build it

A code-level audit of `@svar-ui/react-gantt@2.7.1` on 2026-08-21 — tarballs unpacked, original TS/JSX recovered from the shipped source maps, packages installed and Vite-built for a measured bundle delta, behaviour reproduced in Node, issue tracker checked — found one decisive asymmetry and a tail of friction.

**Decisive:** SVAR has no cross-lane bar drag at all. Its pointer handler records only `clientX`; `clientY` never appears in `Bars.jsx`; reparenting is a grid-row gesture (`move-task`, sole emitter `Grid.jsx:187`). Dropping a bar into another lane is half of CAP-4, so a custom pointer layer had to be written either way — which removed the main reason to adopt the library.

**The tail:** a lane's summary bar can only be hidden with CSS; `taskTemplate` replaces only the bar's inner content while the wrapper always renders both link handles, the progress wrapper and the progress marker; resize handles have no DOM at all (the computed outer 20 % of the bar) so they cannot be restyled or resized; `readonly` is a single boolean with no granularity; there is no per-task CSS class, so a "no scope" bar means abusing `task.type`; `expandScale` silently overrides `cellWidth` when `start` and `end` are pinned and the chart is narrower than its container — exactly our 16 × 46 px case; uneven phase bands are possible only through `registerScaleUnit`, a module-global registry with no guard against re-registration; and a childless lane with `open: true` crashes `toArray` outright (reproduced against the installed package; issues #28 and #31, no maintainer response). The cost was +90 KB gzip and 40 packages, and `Willow` fetches an icon font from `cdn.svar.dev` unless `fonts={false}`.

Against that, the roadmap is flat, small and period-based, and the demand engine, load strip, editor panel and reconciliation were never the library's to give. Full evidence lives with the published mockup.

**This decision is scoped to this feature.** It is not a rule against dependencies. It would reverse if the product ever wanted dependency arrows, critical path, baselines, hundreds of rows or nesting deeper than one level — all of which are explicit non-goals in `SPEC.md`.

## Geometry is a pure module — `src/utils/roadmapGeometry.ts`

Every pixel is computed here, unit-tested without React or DOM, following the `wbsGrid.ts` precedent. No component does arithmetic on coordinates.

```
periodX(period, periodWidth)                    → x of a period's left edge
periodAtX(x, periodWidth)                       → the period containing x
barRect(startPeriod, periodCount, periodWidth)  → { left, width }  (2 px inset each side)
milestoneX(startPeriod, periodWidth)            → x of the boundary at the end of startPeriod
phaseBands(phases, periodWidth)                 → [{ name, left, width, color, hours }]
rowAt(y, rowHeight)                             → visible-row index
snapDrag(mode, origin, dxPx, periodWidth, np)   → { startPeriod, periodCount }
stripeSegments(item, overPeriods, periodWidth)  → [{ left, width }] clipped to the bar
laneBarRect(startPeriod, periodCount, periodWidth) → { left, width }  (delegates to barRect)
laneSummaryPath(rect)                           → SVG path 'd' for the bracket-with-end-caps silhouette
laneMilestoneXs(periods, periodWidth)           → rolled-up tick centres (reuses milestoneX)
```

`snapDrag` is the whole interaction rule in one testable function. `mode` is `"move" | "resizeStart" | "resizeEnd"`; `origin` is the item's pre-drag `{ startPeriod, periodCount }`; `np` is the project's period count. Its contract:

- **move** shifts by `round(dxPx / periodWidth)`, never changes duration, and clamps so the whole bar stays inside `[1, np]`.
- **resizeEnd** changes duration only, minimum 1 period, clamped to the project end.
- **resizeStart** moves the start and compensates the duration so the finish period does not move; minimum 1 period; clamped at period 1.
- a milestone always returns `periodCount: 0` and clamps to `[1, np]`.

## Column grid: three rows, one width

The header, the body and the load strip are three independent DOM subtrees that must agree on column geometry to the pixel. They agree because all three are laid out from the same `periodWidth` and the same period count, and because only one of them owns horizontal scroll.

```
.roadmap                      one bordered container
  .toolbar                    44px
  .main            flex row
    .chart         flex 1, min-width 0, column
      .body        flex row
        .grid      320px, flex-none              — lane / item 200, hours 64, FTE 56
        .scroll    flex 1, overflow-x: auto      — the only horizontal scroller
          .time    width = periods × periodWidth
            .head  44px: phase bands 22px over period columns 21px
            .rows  rowHeight per row, bars absolutely positioned
      .load        row: 320px label + overflow-x hidden strip
    .panel         360px, flex-none              — compresses the chart, never covers it
```

The load strip's scroller is `overflow-x: hidden` and its `scrollLeft` is driven from the chart's `scroll` event. One assignment, one direction, no loop-breaker needed — the strip is never scrolled by the user.

Rows carry `border-box` sizing so a 34 px row includes its 1 px border and the left grid and the timeline stay aligned without a shared layout engine. The phase tint is a single absolutely-positioned layer of period-wide columns behind the rows, so tinting costs one element per period rather than one per cell.

## Pointer model

Pointer Events with `setPointerCapture` — not HTML5 drag-and-drop, which cannot express a live preview and does not fire predictably over scrollable ancestors.

- **Grab zone.** The outer 8 px of a bar resize; the rest moves. Fixed pixels, not a percentage, so a 2-period bar keeps a usable move area. Milestones move only.
- **During the gesture** the bar follows the pointer pixel for pixel and a dashed ghost shows the snapped landing rect. Snapping mid-gesture makes short drags feel like they are fighting the cursor; snapping only on release keeps the gesture continuous and the result exact. This is a binding UX rule, restated here because the implementation is where it gets lost.
- **Cross-lane.** On move, `rowAt(clientY)` resolves the lane under the pointer and its rows are outlined. The item's `laneId` changes on drop.
- **On release** one `PATCH` carries `{ laneId?, startPeriod, periodCount }`. Nothing else is ever written back from a drag.
- **Failure** snaps the bar back to its pre-drag rect and the toast states why.
- **Undo** is one `PATCH` restoring the pre-drag triple, offered in a `sonner` toast.
- A gesture that moved more than 3 px must not also read as a click-to-select.

Measured on the mockup: the whole layer — move, both resize edges, cross-lane drop, clamping, ghost, toast and working undo — is 146 lines with 16 unit assertions over `snapDrag`.

## Keyboard parity is not optional

Every drag gesture has a keyboard equivalent, because a bar that can only be placed by dragging is unusable to part of the audience and untestable without a DOM harness. With a bar selected:

| Key | Effect |
|---|---|
| `←` / `→` | move by one period |
| `⇧←` / `⇧→` | resize the finish edge by one period |
| `⌥←` / `⌥→` | resize the start edge by one period |
| `⌃↑` / `⌃↓` | move to the previous / next lane |
| `Space` | open the editor panel |
| `Esc` | cancel an in-flight drag, restoring the pre-drag rect |

All six route through the same `snapDrag` and the same commit path as the pointer gestures, so there is one rule and one place to fix it. Bars are focusable in row order; the focus ring is the app's, not a browser default.

## Theming

App tokens directly from `styles/globals.css` — no CSS-variable bridge, no build-hash specificity to out-rank, no vendor theme wrapper. Phase bands use `PHASE_COLORS` at full strength in the header and a low-alpha tint behind the rows; the dark theme redefines the tint rather than inverting the hue. Row height 34, header 44, Inter, accent `#8f4f8f`, section rows following `SECTION_ROW_THEME`.

**Precedent already in the codebase:** `ResourcePlan.tsx:407-437` renders uneven phase bands over period columns today, via glide-data-grid column `group` plus `getGroupDetails` overriding `bgHeader` with the phase colour. The roadmap header is the same idea in DOM instead of canvas. Read it before inventing a second visual language for the same thing.

## Performance budget

A roadmap is a dozen to twenty bars over sixteen to fifty-two periods. That is roughly 20 rows plus 52 tint columns plus 52 load cells — a few hundred elements. **No virtualization, no canvas, no memoisation ceremony.** A full re-render on every change is correct and keeps the data flow obvious.

Revisit only if a real project crosses **150 rows or 200 periods**; at that point windowing the rows is a local change to one component because geometry is already pure. Do not pre-build it.

Where a canvas grid would be right — thousands of cells, per-cell text — the app already uses glide-data-grid, and the roadmap is not that shape: its content is a small number of elements that span many columns, which is what DOM does well and canvas does badly.

## Deliberately not built

Dependency arrows and link handles; progress bars, handles and any percentage-complete affordance; baselines; critical path; nested items; row virtualization; free-pixel zoom (zoom steps `periodWidth` through a fixed ladder and re-renders — there is no separate zoom engine); a canvas renderer; an export-to-image path (`clientViewPng.ts` is the precedent if it is ever wanted).

**The lane summary bar is a read-out, not a control.** It is not draggable or resizable, has no grab cursor and no window key bindings — clicking it (or `Enter`/`Space` while focused) only toggles the lane's collapse, the same action the left grid's lane row already performs. A lane-level scheduling gesture — dragging the bar to shift every child at once — is explicitly out of scope: it is a different feature with its own atomicity and undo story, not "just the pointer part" of this one. Its window is always derived from its children in `roadmap.ts` (`laneSpan`, `recomputeLaneSpans`); there is no stored lane window anywhere.

## Testing contract

- `roadmapGeometry.ts` is unit-tested with no DOM: `snapDrag` for each mode with sub-period, exact and multi-period deltas; clamping at period 1, at the project end and at minimum duration; a milestone; `periodX`/`periodAtX` round-tripping exactly at boundaries; `stripeSegments` clipped to a bar that starts or ends outside the over-demand run; `phaseBands` over uneven phases summing to the full width.
- Component tests drive the **keyboard** path, not the pointer path: it exercises the same `snapDrag` and commit, and it runs without a pointer harness.
- One integration test asserts the three column grids agree: for a given `periodWidth`, the header cell, the row tint column and the load cell for period *p* have the same left edge and width.

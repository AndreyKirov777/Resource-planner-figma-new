---
title: 'Roadmap vertical drag: reorder, cross-lane move, and drag from the left grid'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_commit: '3a0949e9729f31d1b0d2c353c0da4843c4f45b7d'
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/timeline-component.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/data-model.md'
  - '{project-root}/docs/bmad-archive/implementation-artifacts/spec-wbs-drag-drop.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A roadmap bar can be dragged horizontally and dropped into another lane, but its
position *within* a lane can only be changed through the row menu's Move up / Move down, one
swap at a time. Nothing in the left grid is draggable at all, and no drop target is ever shown,
so a cross-lane drop today is a blind gesture. `timeline-component.md`'s pointer model also
promises a bar that follows the cursor pixel for pixel; the current implementation snaps the
bar by whole periods mid-gesture and never moves it vertically.

**Approach:** One drag state machine, lifted into `Roadmap.tsx`, driving both panes. Pointer Y
resolves to an insertion *slot* — `{ laneId, index }` — via a new pure helper next to `snapDrag`,
so vertical placement is unit-testable exactly like horizontal placement already is. The same
gesture is startable from a grip handle in the left grid (where dx is ignored) and from the bar
on the timeline (where dx still runs through `snapDrag`). A drop that changes lane, order and
window writes once, through a new atomic roadmap reorder endpoint.

## Boundaries & Constraints

**Always:**

- One rule, one place: vertical placement is a pure function in `roadmapGeometry.ts`, called by
  the pointer path and the keyboard path alike — the standing rule `snapDrag` already follows.
- Drag state lives in `Roadmap.tsx` and is passed to both `RoadmapGrid` and `RoadmapTimeline`, so
  a gesture started in either pane renders its drop indicator in **both**.
- Y is cut into slots, not rows: `slot = Math.round(y / ROW_HEIGHT)` yields 0…rows.length. A slot
  landing on a lane row reads as "first position in that lane" — otherwise an item can never be
  inserted at the head of a lane.
- A collapsed or empty lane accepts a drop as "append to the end of that lane"; its lane row is
  highlighted instead of an insert line.
- Above the first row → head of the first lane. Below the last row → tail of the last lane.
- The dragged item is removed from the list before the index is resolved, so a drop on its own
  position is a guaranteed no-op that writes nothing.
- Drag from the left grid never changes `startPeriod` / `periodCount`: dx is discarded, `snapDrag`
  is not called.
- Drag on the timeline follows the cursor pixel for pixel in **both** axes (`timeline-component.md`
  "Pointer model"): the moving bar renders in a floating layer positioned from the raw pointer
  delta, with a dashed ghost rect at the snapped landing position. Snapping still happens only on
  release.
- A drop that changes lane, order and window commits as **one** request. Partial writes are not
  acceptable — a failed reorder must leave the stored order exactly as it was.
- `displayOrder` is renumbered contiguously `0…n-1` within every lane the drop touched. No
  fractional ranks, no gaps.
- Milestones and spread items reorder vertically like bars. Their windows are untouched (the
  server already refuses a window write on a spread item).
- The 3 px threshold stays: a shorter gesture is still click-to-select in the timeline and
  click-to-select / collapse-toggle in the grid.
- Keyboard parity is not optional (`timeline-component.md`): every new pointer gesture gets a key
  binding, on grid rows as well as bars.
- Undo restores the full pre-drag order of every lane the drop touched, not just the dragged
  item's triple — one request, offered in the existing `sonner` toast.
- Failure snaps the row back to its pre-drag position and the toast states why, matching the
  existing `commitDrag` catch.

**Ask First:**

- If lane reordering by drag turns out to need a second gesture kind rather than the same state
  machine with `entity: 'lane'`.
- If auto-scroll while dragging cannot be driven from the existing scroll containers (the timeline
  viewport scrolls X only; Y scrolling is the page's, or the fullscreen container's).

**Never:**

- No HTML5 drag-and-drop. Pointer Events with `setPointerCapture`, as the spec requires.
- Do not keep the two-PATCH swap in `moveLane` / `moveItem` — menu, keyboard and pointer must all
  reach the same commit path.
- Do not introduce a sort order derived from `startPeriod` or anything else; manual order is the
  only order.
- No changes to WBS, links, coverage, `roadmapLoad`, the load strip, the editor panel, export /
  import or `schemaVersion`.
- No virtualization, no canvas, no memoisation ceremony (`timeline-component.md` performance
  budget still holds).
- Do not widen the single-item `PATCH /api/roadmap-items/:id`; the pure horizontal drag keeps
  using it unchanged.

## Deliberate deviation from `spec-wbs-drag-drop.md`

That spec forbade a batch reorder endpoint because WBS placement only ever rewrites one row plus
sibling bumps that can each fail independently without corrupting the tree. The roadmap case is
different: a cross-lane drop renumbers two lanes *and* may move the window in the same gesture,
and the human decision on this feature is that it commits atomically. Hence the new endpoint below.
This is a scoped exception, not a reversal of that rule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Reorder within lane (timeline) | Drag bar over a slot in its own lane | Item lands at that index; lane renumbered `0…n-1`; window unchanged unless dx moved it | One request; failure reverts optimistic state + toast |
| Reorder within lane (grid) | Drag grip over a slot in its own lane | Same placement; `startPeriod` / `periodCount` untouched | same |
| Cross-lane + reorder | Drag into another lane at index k | `laneId` + `displayOrder` written; **both** lanes renumbered | same, single request |
| Cross-lane + window in one gesture | Timeline drag with dx and dy | One request carrying `laneId`, `displayOrder`, `startPeriod`, `periodCount` | Atomic — either all or none |
| Drop into collapsed lane | Pointer anywhere on a collapsed lane row | Appended last in that lane; lane row highlighted, no insert line | N/A |
| Drop into empty lane | Lane with zero items | Index 0 in that lane | N/A |
| Drop on own position | Released where it started | No request at all | N/A |
| Drop above first row | y < 0 | Head of the first lane | N/A |
| Drop below last row | y > rows.length × ROW_HEIGHT | Tail of the last lane | N/A |
| Milestone / spread vertical move | Drag either kind by grip or body | Lane + order change; window fields omitted from the request | Server still 400s a spread window write; we never send one |
| Spread horizontal drag | Timeline drag on a spread bar | Still refused (existing rule), vertical still allowed | N/A |
| Sub-threshold gesture | < 3 px | Click-to-select (timeline) / select or collapse-toggle (grid); no request | N/A |
| Row menu click during drag setup | Pointer down on ⋮ | Menu opens, no drag starts | N/A |
| Lane reorder | Drag a lane row / its grip | Lane `displayOrder` renumbered; items follow their lane | Single request |
| Scroll during gesture | Page or container scrolls mid-drag | Placement stays correct — container rect is re-read every move | N/A |
| Request fails | Server 400/500 | Optimistic state rolled back to the pre-drag snapshot; error toast | Existing `commitDrag` catch shape |
| Undo after cross-lane drop | Toast Undo pressed | Both lanes restored to their exact pre-drag order and the item to its old window | Second failure → "Undo failed" toast |

</frozen-after-approval>

## Code Map

**Geometry (pure, new)**

- `src/utils/roadmapGeometry.ts` — `ROW_HEIGHT` (`:13`), `rowAt` (`:102`), `snapDrag` (`:127`).
  Add:
  - `RowDescriptor { kind, id, laneId, collapsed }` — the minimal row shape placement needs.
  - `dropTargetAt(y, rows, rowHeight, draggedItemId): { laneId, index } | null`.
  - `laneDropIndexAt(y, rows, rowHeight): number` for `entity: 'lane'`.
  - `reorderWithin<T>(list, from, to): T[]`.
  - `indicatorY(target, rows, rowHeight): number` — the y the insert line draws at.
  `rowAt` stays and is reused by `dropTargetAt`; do not duplicate the floor math.

**Order payload (pure, new)**

- `src/utils/roadmapOrder.ts` (new) — `buildReorder(lanes, items, commit)` → the wire payload, and
  `orderSnapshot(lanes, items, laneIds)` → the undo payload. Keeps `Roadmap.tsx` free of
  renumbering arithmetic and makes both testable without a DOM.

**Drag state machine**

- `src/components/roadmap/useRoadmapDrag.ts` — `DragGhost` (`:19`), `RoadmapDragCommit` (`:26`),
  threshold (`:17`), the duplicated lane hit-test at `:110-114` and `:140-144`.
  - Gesture args gain `source: 'timeline' | 'grid'` and `entity: 'item' | 'lane'`.
  - Replace `rowLaneIds: number[]` (`:44`) with `RowDescriptor[]`; fold the two copies of the
    hit-test into one call to `dropTargetAt`.
  - `DragGhost` gains `dropIndex` and the raw pointer delta (`dxPx`, `dyPx`) for the pixel-follow
    layer; the snapped values stay for the dashed ghost rect.
  - **Fix while here:** `containerTop` is captured once at pointer-down (`:46`, `:71`, `:85`) and
    read on every move (`:111`, `:141`). Any scroll during the gesture skews every row lookup.
    Store the container element and read `getBoundingClientRect().top` per move instead.
  - Add edge auto-scroll: 24 px hot zone, ~8 px per `requestAnimationFrame`.

**Container**

- `src/components/roadmap/Roadmap.tsx` — `moveLane` (`:314`), `moveItem` (`:325`), `commitDrag`
  (`:375`), the two-pane render (`:628-663`).
  - Call `useRoadmapDrag` here (it currently lives inside the timeline) and pass `ghost` /
    `dropTarget` / handlers down to both children.
  - Build `RowDescriptor[]` once here — both panes need it.
  - `moveLane` / `moveItem` drop the `displayOrder` swap and route through the same
    `buildReorder` + reorder request as the pointer path.
  - `commitDrag`: `order === undefined` → existing single `PATCH` unchanged; otherwise one reorder
    request, with the undo action restoring `previous.orderSnapshot`.

**Timeline**

- `src/components/roadmap/RoadmapTimeline.tsx` — `rowsWrapRef` (`:71`), `rowLaneIds` (`:75`),
  hook call (`:81`), `laneIdForRowIndex` (`:104`), `handleBarKeyDown` (`:115`), bar
  `onPointerDown` (`:318`).
  - `rowLaneIds` → the shared `RowDescriptor[]` prop; hook call moves out.
  - New floating drag layer above the rows: the dragged bar positioned from the raw pointer delta
    (both axes), plus a dashed rect at the snapped landing window. The bar in its own row renders
    at reduced opacity while the gesture is live.
  - Insert line at `indicatorY`, target-lane outline (the spec's "its rows are outlined", never
    implemented).
  - `handleBarKeyDown` gains `⌥↑` / `⌥↓`; `⌃↑` / `⌃↓` keeps changing lane but now also commits a
    definite index (tail of the target lane, matching server append semantics).

**Left grid**

- `src/components/roadmap/RoadmapGrid.tsx` — row `onClick` (`:70`), menu trigger (`:81-89`),
  Move up / Move down items (`:96-97`, `:106-107`).
  - `GripVertical` handle (lucide, already a dependency) at the row head, `opacity-0
    group-hover:opacity-100` mirroring the existing ⋮ button, `cursor-grab`.
  - Rows become focusable (`tabIndex`) and take the same key bindings as bars.
  - Row `onClick` must no-op when the gesture went active, or every drag also toggles a lane.
  - `onPointerDown` on the menu trigger needs `stopPropagation` (only `onClick` is stopped today).
  - Same insert line / lane highlight as the timeline; dragged row at reduced opacity.

**Server**

- `server-validation.ts` — `roadmapLaneUpdateSchema` (`:242`), `roadmapItemUpdateSchema` (`:305`).
  Add `roadmapReorderSchema`: `.strict()`, `lanes?: [{id, displayOrder}]`,
  `items?: [{id, laneId, displayOrder, startPeriod?, periodCount?}]`, ids unique,
  `displayOrder >= 0`.
- `server.ts` — roadmap block (`:1372`), `fetchRoadmapPayload` (`:442`), the lane/item PATCH
  handlers (`:1417`, `:1481`).
  New `PATCH /api/projects/:id/roadmap/reorder`: verify every id belongs to the project in one
  query (the same invariant `:1497` enforces), apply in a single `prisma.$transaction`, respond
  with `fetchRoadmapPayload(projectId)` so the client reconciles in one round trip. The kind /
  periodCount refinements from `:1503-1516` apply to any window fields carried in the payload.
- `prisma/schema.prisma` — **no migration**: `RoadmapLane.displayOrder` (`:162`) and
  `RoadmapItem.displayOrder` (`:183`) already exist.

**Client data layer**

- `src/services/api.ts` — `updateRoadmapLane` (`:604`), `updateRoadmapItem` (`:638`). Add
  `reorderRoadmap(projectId, payload)`.
- `src/App.tsx` — `patchRoadmapItemInLanes` (`:481`), `handleUpdateRoadmapItem` (`:502`),
  `handleUpdateRoadmapLane` (`:442`). Add `applyRoadmapReorder(lanes, payload)` beside the
  existing patch helper and `handleReorderRoadmap` with the same optimistic-then-rollback shape,
  wired at the `Roadmap` call site (`:1421`, `onUpdateLane`/`onUpdateItem` props at `:1429`/`:1432`).

**Docs**

- `docs/bmad-archive/specs/spec-roadmap/timeline-component.md` — pointer model (`:62-74`) and the
  keyboard table (`:80-88`) gain the vertical gestures and `⌥↑` / `⌥↓`.
- `docs/bmad-archive/specs/spec-roadmap/data-model.md` — document the reorder endpoint and the
  contiguous-renumber rule.

## Tasks & Acceptance

**Execution:**

- [x] `src/utils/roadmapGeometry.ts`, `src/utils/roadmapGeometry.test.ts` -- `RowDescriptor`,
      `dropTargetAt`, `laneDropIndexAt`, `reorderWithin`, `indicatorY` -- pointer hit geometry is
      untestable from the component, so the math must be pure first
- [x] `src/utils/roadmapOrder.ts`, `src/utils/roadmapOrder.test.ts` -- `buildReorder`,
      `orderSnapshot` -- renumbering and the undo payload are the part most likely to be silently
      wrong
- [x] `server-validation.ts`, `server-validation.test.ts` -- `roadmapReorderSchema`
- [x] `server.ts` -- `PATCH /api/projects/:id/roadmap/reorder` in one transaction, project-scoped
      id check, returns the full roadmap payload
- [x] `src/services/api.ts`, `src/App.tsx` -- `reorderRoadmap`, `applyRoadmapReorder`,
      `handleReorderRoadmap` with snapshot rollback
- [x] `src/components/roadmap/useRoadmapDrag.ts` -- `source` / `entity`, `RowDescriptor[]`,
      single hit-test via `dropTargetAt`, raw deltas on the ghost, live container rect, auto-scroll
- [x] `src/components/roadmap/Roadmap.tsx` -- hook lifted here, shared `RowDescriptor[]`,
      `commitDrag` reorder branch + undo snapshot, `moveLane` / `moveItem` onto the same path
- [x] `src/components/roadmap/RoadmapTimeline.tsx` -- floating pixel-follow drag layer + dashed
      snapped ghost, insert line, target-lane outline, `⌥↑` / `⌥↓`, `⌃↑` / `⌃↓` with an explicit index
- [x] `src/components/roadmap/RoadmapGrid.tsx` -- grip handle, drag wiring, focusable rows with the
      same key bindings, click suppression after an active gesture, menu `onPointerDown` guard,
      insert line / lane highlight
- [x] lane drag (`entity: 'lane'`) in both panes, on the same state machine -- grip added to both the
      grid row and the timeline's (previously label-less) lane band; both call the same
      `onDragPointerDown({ entity: 'lane', ... })` on the one shared state machine
- [x] `src/components/roadmap/Roadmap.test.tsx` -- keyboard path asserts the reorder payloads
- [x] docs -- `timeline-component.md` pointer model + keyboard table, `data-model.md` endpoint

**Acceptance Criteria:**

- Given two items in one lane, when the user drags either one past the other in the timeline **or**
  in the left grid, then the order changes, both panes show the same insert line during the
  gesture, and the new order survives a reload.
- Given an item dragged into another lane at a specific slot, when dropped, then it lands at that
  index (not merely at the end), both lanes are renumbered contiguously, and one request was sent.
- Given a timeline drag that changes lane, index and window at once, when dropped, then exactly one
  request carries all three, and a rejected request leaves the stored roadmap byte-for-byte
  unchanged.
- Given a drop onto a collapsed or empty lane, when released, then the item is appended to that lane
  and the lane row — not an insert line — was the highlighted target.
- Given a drop on the item's own position, when released, then no request is sent.
- Given a cross-lane drop followed by Undo, when the toast action is pressed, then both lanes return
  to their exact pre-drag order and the item to its pre-drag window.
- Given a keyboard-only user, when they press `⌥↑` / `⌥↓` on a focused bar or grid row, then the item
  moves one position within its lane through the same commit path the pointer uses.
- Given a bar being dragged on the timeline, when the pointer moves, then the bar tracks it pixel for
  pixel in both axes and a dashed ghost shows the snapped landing rect; snapping is applied only on
  release.
- Given the page scrolls mid-gesture, when the item is dropped, then it lands where the indicator
  showed.

**Commands:**

- `npx vitest run src/utils/roadmapGeometry.test.ts src/utils/roadmapOrder.test.ts` -- expected:
  pass, including every matrix row that is pure placement
- `npx vitest run src/components/roadmap/Roadmap.test.tsx src/components/roadmap/RoadmapEditorPanel.test.tsx`
  -- expected: pass, keyboard reorder payloads asserted
- `npx vitest run server-validation.test.ts` -- expected: pass, reorder schema covered
- `npm run typecheck` -- expected: clean

**Manual checks** (no harness sees these): grab cursor on the grip only; insert line vs lane
highlight; a drag in the grid leaves the bar's window alone; the bar tracks the cursor in both axes
with the dashed ghost trailing at the snapped position; auto-scroll near both vertical edges,
in fullscreen too; ⋮ menu, lane collapse and click-to-select all still work.

## Suggested Review Order

**Entry point — placement geometry**

- Pure slot math: pointer/keyboard Y resolves to `{laneId, index}`; the lane-row-means-head and self-drop-no-op rules live here.
  [`roadmapGeometry.ts:207`](../../../src/utils/roadmapGeometry.ts#L207)

- Lane-drop-index variant for `entity: 'lane'`, mirrors the item hit-test.
  [`roadmapGeometry.ts:251`](../../../src/utils/roadmapGeometry.ts#L251)

- Insert-line Y for the one indicator both panes render identically.
  [`roadmapGeometry.ts:277`](../../../src/utils/roadmapGeometry.ts#L277)

**Order and persistence**

- Renumbers every touched lane in full — "always correct" beats "smallest payload" for a write the intent requires atomic.
  [`roadmapOrder.ts:60`](../../../src/utils/roadmapOrder.ts#L60)

- Undo payload capturing the full pre-drag order of every touched lane.
  [`roadmapOrder.ts:125`](../../../src/utils/roadmapOrder.ts#L125)

- Client-side optimistic merge, pulled out of `App.tsx` so it's independently unit-testable.
  [`roadmapOrder.ts:152`](../../../src/utils/roadmapOrder.ts#L152)

- New atomic endpoint: one project-scoped id check, one transaction, full payload back.
  [`server.ts:1701`](../../../server.ts#L1701)

- Server-side contiguity check (added during review) — the `0..n-1` invariant is no longer client-trust-only.
  [`server-validation.ts:378`](../../../server-validation.ts#L378)

**Pointer drag state machine**

- One hit-test via `dropTargetAt`, replacing the two duplicated copies; live container rect read per move, not captured once.
  [`useRoadmapDrag.ts:253`](../../../src/components/roadmap/useRoadmapDrag.ts#L253)

- Auto-scroll re-resolves the ghost each tick (added during review) so the indicator doesn't freeze under a stationary cursor.
  [`useRoadmapDrag.ts:308`](../../../src/components/roadmap/useRoadmapDrag.ts#L308)

- Pointer-up commit, plus the `justDraggedRef` timeout fallback for a drop outside any row.
  [`useRoadmapDrag.ts:346`](../../../src/components/roadmap/useRoadmapDrag.ts#L346)

**Component wiring**

- Hook lifted here; `commitDrag` branches the old single-PATCH path from the new atomic reorder.
  [`Roadmap.tsx:443`](../../../src/components/roadmap/Roadmap.tsx#L443)

- Row-menu Move up / Move down now route through the same commit path as drag and keyboard.
  [`Roadmap.tsx:375`](../../../src/components/roadmap/Roadmap.tsx#L375)

- Floating pixel-follow layer + dashed snapped ghost for the timeline's live drag.
  [`RoadmapTimeline.tsx:184`](../../../src/components/roadmap/RoadmapTimeline.tsx#L184)

- Lane grip added to the timeline's lane band too, so a lane drag starts from either pane.
  [`RoadmapTimeline.tsx:324`](../../../src/components/roadmap/RoadmapTimeline.tsx#L324)

- Grid's keyboard parity — a focused lane row now answers Enter/Space with collapse-toggle.
  [`RoadmapGrid.tsx:88`](../../../src/components/roadmap/RoadmapGrid.tsx#L88)

- Single sink for every reorder gesture — pointer, keyboard, and row-menu alike.
  [`App.tsx:525`](../../../src/App.tsx#L525)

**Tests**

- Placement matrix, including collapsed/empty-lane, above/below clamps, and self-drop no-op.
  [`roadmapGeometry.test.ts`](../../../src/utils/roadmapGeometry.test.ts)

- Payload renumbering, undo snapshot, and the optimistic-merge sort order.
  [`roadmapOrder.test.ts`](../../../src/utils/roadmapOrder.test.ts)

- Server-side contiguity rejection, atomic cross-project rejection, and spread-window refusal.
  [`server-validation.test.ts`](../../../server-validation.test.ts), [`roadmap.integration.test.ts`](../../../roadmap.integration.test.ts)

- Keyboard reorder payloads for both panes, plus row-menu Move up/down assertions.
  [`Roadmap.test.tsx`](../../../src/components/roadmap/Roadmap.test.tsx)

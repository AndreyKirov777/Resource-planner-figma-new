---
title: 'WBS drag-and-drop reorder and reparent'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: '271339a1b797dc7fe00b46a9b5776f729c7f447c'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-wbs-structure-edit.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** WBS rows reparent via Tab / Shift+Tab and the row menu, but there is no mouse way to reorder siblings or drop an item under another parent. Drag-and-drop was left out of WBS-2 and structure-edit.

**Approach:** Drag a WBS row from the outline column to insert it as a sibling (before/after) or nest it as a child. The dragged item's subtree moves with it. Persist with existing `parentId` + `displayOrder` PUTs and sibling shifts — the same path as outdent.

## Boundaries & Constraints

**Always:**

- Drag starts from the WBS outline column only. Task Description still owns chevron, name overlay, and ⋮. Keyboard/menu structure actions stay; do not replace them.
- Drop zones on the hovered visible row: **top** → sibling immediately before that row (same `parentId` as the target); **middle** → last child of that row; **bottom** → sibling immediately after that row if the target is a leaf or collapsed, otherwise first child of that row (the gap between an expanded parent and its first visible child).
- Visual: a horizontal insert line for sibling / first-child slots; a row highlight for nest-as-last-child. `cursor-grab` / `grabbing` on the outline handle.
- Placement is a pure helper returning `{ parentId, displayOrder, shifts }` like `outdentPlacement`. Integer `displayOrder`: insert-before uses the target's order and bumps the target and later siblings; insert-after / last-child follow `insertAfter` / `nextDisplayOrder`. Do not compact source siblings.
- Reject (no-op, no PUTs): drop on self; drop on a descendant of the dragged item; `wouldCreateCycle`; overlay open; `structureBusyRef`; identical parent+order. Nesting under a collapsed parent expands it so the new child is visible.
- Persist like `handleOutdent`: `applyShifts` then `onUpdateWbsItem(draggedId, { parentId, displayOrder })`. Children keep their own `parentId`s — they follow via the tree. Reuse `structureBusyRef`.
- Heading hint gains a short `· drag to move` suffix. Outline numbers stay derived.

**Ask First:**

- If Glide's canvas cannot report the row under the pointer during drag without wiring `onRowMoved` / `rowMarkers`.
- If a new batch reorder endpoint seems required (it must not — existing PUT `parentId` + `displayOrder` only).

**Never:**

- Do not use Glide `onRowMoved` as the placement engine (flat visible indices cannot nest or reparent).
- No notes, export/import / `schemaVersion`, Resource Plan, Resource List, rate-card, Roles picker, or reconciliation changes.
- Do not remove keyboard/menu indent-outdent. Do not add a sixth column or header toolbar buttons for move.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Sibling after | Drag A onto B bottom; B leaf/collapsed; same parent | A sits immediately after B; later siblings bumped | PUT fail: swallow like outdent |
| Sibling before | Drag A onto B top | A sits immediately before B | same |
| Nest last child | Drag A onto B middle | A last child of B; B expanded if collapsed | Cycle/descendant: no-op |
| First child of expanded | Drag A onto expanded B bottom (gap before B's first child) | A first child of B | same |
| Cross-parent | Drag a child onto a different branch | `parentId` + `displayOrder` update; dest siblings bumped; source gaps left as-is | same |
| Subtree | Drag a parent that has children | Only the dragged node is rewritten; descendants stay attached | N/A |
| Drop on descendant | Drag A onto A's child | No-op | N/A |
| Drop on self | Drag A onto A | No-op | N/A |
| Overlay open | Name/phase/roles overlay open | Drag does not start / drop ignored | N/A |
| Empty WBS | No rows | No handle; Add root item unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/utils/wbsGrid.ts` — `insertAfter` / `siblingBelowPlacement` / `indentPlacement` / `outdentPlacement` (`:380-453`); `structureHintText` (`:490`). Add `dropZone` + `dropPlacement`. Keep integer bump; do not add a reorder route.
- `src/utils/wbsTree.ts` — reuse `wouldCreateCycle` (`:261`) and `descendantIds` (`:225`). Do not change walkers.
- `src/components/Wbs.tsx` — outline col 0 readonly text (`:633-640`); `applyShifts` + `handleOutdent` (`:774-825`); `structureBusyRef`; overlays. Adapter: pointer drag on col 0, drop preview, call placement + persist. Do not wire `onRowMoved`.
- `src/components/Wbs.test.tsx` — canvas harness (`:15-130`) already forwards keys; add drop-action buttons that call the same handler the grid will use.
- Tests: `src/utils/wbsGrid.test.ts` (placement); `src/components/Wbs.test.tsx` (handler sequence). No server change — `wbs.integration.test.ts` cycle 400 stays as-is.

## Tasks & Acceptance

**Execution:**

- [x] `src/utils/wbsGrid.ts` -- `dropZone(yInRow, rowHeight, targetHasVisibleChildren)` and `dropPlacement(items, draggedId, targetId, zone)`; append `· drag to move` on `structureHintText` -- canvas cannot unit-test hit geometry, so math must be pure
- [x] `src/components/Wbs.tsx` -- outline-column drag, live zone preview, `structureBusyRef` + overlay guard, persist via `applyShifts` then `onUpdateWbsItem`; expand nest target -- Glide `onRowMoved` cannot reparent
- [x] `src/utils/wbsGrid.test.ts`, `src/components/Wbs.test.tsx` -- matrix placements (before/after/child/first-child, cross-parent, self/descendant no-op); harness drop buttons assert `onUpdateWbsItem` sequences

**Acceptance Criteria:**

- Given two sibling rows, when the user drops one before or after the other, then order matches the matrix and survives reload.
- Given a row dragged onto another row's middle band, when dropped, then it becomes that row's last child (parent expanded if it was collapsed) and the subtree stays attached.
- Given a drop on self or on a descendant, when released, then no PUTs run and the tree is unchanged.
- Given a name / phase / roles overlay is open, when the user tries to drag, then structure does not change.
- Given `npm test` and `npm run typecheck`, then both pass, including the new placement cases. Keyboard/menu indent-outdent still match structure-edit.

## Spec Change Log

## Design Notes

Glide `onRowMoved` is flat visible-index splice and only arms when `rowMarkers` ≠ `none`. WBS already uses `rowMarkers="none"` and a derived outline column. Placement must be tree-aware (`parentId` + zone), so pointer tracking + `dropPlacement` is the engine; `onRowMoved` is not.

Persist copies `handleOutdent`: bump destination later siblings, then PUT the dragged id. Gaps on the source side are fine (GET already orders by `displayOrder, id`).

`dropZone` bands (fractions of row height, e.g. top/middle/bottom thirds) are the only geometry; Wbs.tsx maps Glide row-under-pointer → `targetId` + `yInRow`.

## Verification

**Commands:**

- `npx vitest run src/utils/wbsGrid.test.ts src/components/Wbs.test.tsx` -- expected: pass, including drop matrix + overlay no-op
- `npx vitest run src/utils/wbsTree.test.ts src/utils/wbs.test.ts wbs.integration.test.ts` -- expected: pass unmodified
- `npm run typecheck` -- expected: clean

**Manual checks** (real Glide; harness cannot see these): grab cursor on outline only; insert line vs nest highlight; drop under a collapsed parent expands it; chevron/kebab/name still clickable; Tab/Enter/Delete still match the menu.

## Suggested Review Order

**Placement**

- Tree-aware drop math: zone → parentId + displayOrder + sibling bumps
  [`wbsGrid.ts:455`](../../src/utils/wbsGrid.ts#L455)

- Top/middle/bottom thirds; expanded bottom is first-child, not after
  [`wbsGrid.ts:417`](../../src/utils/wbsGrid.ts#L417)

- Already-in-place drops (adjacent sibling, last/first child) emit no PUTs
  [`wbsGrid.ts:437`](../../src/utils/wbsGrid.ts#L437)

**Persist**

- Same path as outdent: shift destination siblings, then PUT the dragged id
  [`Wbs.tsx:853`](../../src/components/Wbs.tsx#L853)

**Pointer drag**

- Outline-column start only; no Glide `onRowMoved`
  [`Wbs.tsx:952`](../../src/components/Wbs.tsx#L952)

- Hit-test the row under the pointer; outside the grid cancels
  [`Wbs.tsx:920`](../../src/components/Wbs.tsx#L920)

- Pointer-up recomputes the drop from the release coordinates
  [`Wbs.tsx:989`](../../src/components/Wbs.tsx#L989)

- Insert line vs nest highlight; grab cursor on the outline cell
  [`Wbs.tsx:1131`](../../src/components/Wbs.tsx#L1131)

**Tests**

- Matrix placements including self, descendant, and already-there
  [`wbsGrid.test.ts:657`](../../src/utils/wbsGrid.test.ts#L657)

- Harness drop buttons call the same `handleDrop` the grid uses
  [`Wbs.test.tsx:647`](../../src/components/Wbs.test.tsx#L647)


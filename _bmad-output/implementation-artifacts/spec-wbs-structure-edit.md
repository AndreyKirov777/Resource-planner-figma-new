---
title: 'WBS structure edit from the table (row menu + keyboard)'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: '00e4fb27e03987dfb5355c95c086271f21a1d287'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-wbs-2r-wbs-table-redesign.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** WBS structure is edited from a header toolbar. There is no in-table add/delete/reparent, and no keyboard outliner. Reparenting was deferred: tree walkers and `PUT /api/wbs-items/:id` have no cycle guards (closed cycles vanish; reachable cycles stack-overflow).

**Approach:** One structure-editing surface — a per-row drop-down plus matching shortcuts, with those keys shown in the menu and a one-line heading hint. Indent/outdent ship with client and server cycle guards. Header `+ Child` / `Delete` / `Add root item` remain only for an empty WBS.

## Boundaries & Constraints

**Always:**

- Menu and shortcuts are one surface. The row menu lists every structure action that has a key, shortcut on the right (`DropdownMenuShortcut`). Disabled/no-op rows still show the key. No coachmark, tour, or settings toggle.
- Actions: **Add child** (⌘↵ / Ctrl+Enter), **Add sibling below** (↵), **Indent** (⇥), **Outdent** (⇧⇥), **Delete** (⌫ or Backspace). Platform glyphs (⌘ vs Ctrl). When the table has rows, a muted one-line hint by the heading, e.g. `Enter sibling · ⌘Enter child · Tab indent · ⇧Tab outdent · ⌫ delete`.
- New items: `name: 'New item'`, `phaseName: null`, `displayOrder` from the placement helper. Expand a collapsed parent before add-child or indent.
- Add sibling sits immediately below the selected row (same `parentId`), not at the end of the sibling list. Outdent → grandparent (`null` if parent is a root), next sibling after the former parent. Indent → previous sibling, as its last child. Indent no-ops without a previous sibling; outdent no-ops on a root.
- Delete uses `deleteConfirmMessage` + cascade. Structure keys no-op while a name / phase / roles overlay is open (those editors own Enter / Escape / Tab / Delete / Backspace).
- Keyboard: Glide `onKeyDown` + `gridSelection`; `event.cancel()` so Glide does not activate / move / clear. Not DOM row focus.
- Cycle guards required. Client visited-set in `buildWbsTree` / `flattenVisibleTree` / `rollupHours` / `descendantIds` / `outlineNumbers` / `effectivePhases`. Unreachable cycle members surface as roots (do not silently hide). Reachable cycles must not stack-overflow. Each item renders at most once. Server `PUT /api/wbs-items/:id` rejects a cycling `parentId` (400), including under a descendant. WBS-1's disclaimer is lifted. Reuse tested `wouldCreateCycle` (server already imports `src/utils`).
- Overlay: reuse `CLICK_OUTSIDE_IGNORE` / `OVERLAY_MENU_CLASS` / `isOutsideClick` / `isInsidePortaledMenu`. Do not copy `ResourcePlan.tsx`'s unused `RoleCellRenderer`.
- Pure helpers in `src/utils/wbsTree.ts` and `src/utils/wbsGrid.ts`, unit-tested. `Wbs.tsx` stays a thin adapter.

**Ask First:**

- If Glide `onKeyDown` cannot see or cancel Tab / Enter without breaking overlay editors.
- If insert-below / outdent seems to need a new reorder endpoint (it must not — existing POST/PUT `displayOrder` only).

**Never:**

- No `notes`, export/import / `schemaVersion` 3, Resource Plan / Resource List / rate-card / Roles picker changes, or drag-and-drop reorder.
- Do not keep a populated-WBS header toolbar. Do not split the menu from the shortcuts. No coachmark, tour, or settings toggle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add child | Selected row; menu or ⌘/Ctrl+Enter | New child last under that row; parent expanded if collapsed | No-op if no selection |
| Add sibling | Selected row; menu or Enter | Same parent, immediately below | No-op if no selection |
| Delete | Selected row; menu or Delete/Backspace | Existing confirm (descendant count); cascade | Cancel: no call |
| Indent | Has previous sibling; Tab or menu | Last child of that sibling; new parent expanded | No-op if first/only child (menu disabled, key still listed) |
| Outdent | Non-root; Shift+Tab or menu | Grandparent or `null`; placed just after former parent | No-op on a root (menu disabled, key still listed) |
| Editor owns keys | Name / phase / roles overlay open | Enter / Esc / Tab / Delete / Backspace stay with the editor | No structure mutation |
| Empty WBS | `wbsItems = []` | Empty-state copy + header **Add root item** only | N/A |
| Populated WBS | ≥1 row | No header `+ Child` / `Delete` / `Add root item`; hint visible | N/A |
| Closed cycle | A↔B, no external parent | Both appear as roots; nothing hidden | N/A |
| Reachable cycle | A→B→C→B | No stack overflow; walk stops at revisit | N/A |
| Cycle PUT | `parentId` = self, descendant, or ancestor loop | 400 | Self-parent / cross-project 400s unchanged |

</frozen-after-approval>

## Code Map

- `src/utils/wbsTree.ts` — no visited-set; closed cycles vanish (`:31-39`). Add visited-set, unreachable-as-roots, `wouldCreateCycle`.
- `src/utils/wbsGrid.ts` — `nextDisplayOrder` appends (`:355-360`). Add sibling-below / indent / outdent placement + shortcut glyphs. Keep `deleteConfirmMessage`.
- `server.ts` — `PUT /api/wbs-items/:id` (`:1054-1088`) is self-parent + cross-project only. Call `wouldCreateCycle` after those.
- `src/components/Wbs.tsx` — toolbar `:660-676`; handlers `:617-651`; no `onKeyDown` (`:689-707`).
- `src/components/WbsRowMenu.tsx` — **new**; portaled `DropdownMenu` + `DropdownMenuShortcut`; reuse `RolesEditor` click-outside classes (`:27-49`).
- Tests: `wbsTree.test.ts` (no cycle cases); `wbsGrid.test.ts`; `wbs.integration.test.ts` (`:344-383`); `Wbs.test.tsx` harness (`:15-161`) must forward `onKeyDown` — retarget toolbar tests (`:383-477`).

## Tasks & Acceptance

**Execution:**

- [x] `src/utils/wbsTree.ts` -- visited-set on every walker; unreachable members become roots; `wouldCreateCycle` -- reparenting is otherwise unsafe
- [x] `src/utils/wbsGrid.ts` -- sibling-below / indent / outdent targets (integer `displayOrder`, bump later siblings) and platform shortcut labels -- canvas cannot test this
- [x] `server.ts` -- `PUT` 400 on a cycling `parentId` via `wouldCreateCycle` -- lifts the WBS-1 disclaimer
- [x] `src/components/WbsRowMenu.tsx` -- five actions + inline shortcuts; disabled indent/outdent still show keys
- [x] `src/components/Wbs.tsx` -- ⋮ in the table, Glide `onKeyDown` (cancel + overlay guard), heading hint, empty-only Add root -- adapter only
- [x] `src/utils/wbsTree.test.ts`, `src/utils/wbsGrid.test.ts`, `wbs.integration.test.ts`, `src/components/Wbs.test.tsx` -- matrix, both cycle modes, editor-open no-op; harness invokes real `onKeyDown`

**Acceptance Criteria:**

- Given a selected row and no open editor, when the user uses the row menu or the matching shortcut, then add child, add sibling below, indent, outdent, and delete match the matrix, and the menu shows each shortcut.
- Given a populated WBS, when the page renders, then the header has no `+ Child` / `Delete` / `Add root item`, and the muted one-line hint is visible by the heading.
- Given an empty WBS, when the page renders, then **Add root item** remains the way to create the first row.
- Given a name, phase, or roles overlay is open, when Enter / Tab / Escape / Delete / Backspace are pressed, then the editor handles them and no structure mutation runs.
- Given `npm test` and `npm run typecheck`, then both pass, including cycle-walker and `PUT` 400 cases.

## Spec Change Log

## Design Notes

**Glide keys.** Consumer `onKeyDown` runs before Glide's Tab / Enter / Delete (`data-editor.tsx:3207-3221`). `cancel()` handled keys. Overlay editors already `stopPropagation`; still no-op while an overlay is mounted.

**Placement.** `displayOrder` is an integer — insert-below / outdent-after-parent = `after.displayOrder + 1`, then bump later siblings via `updateWbsItem`. ⋮ in an existing column; portal the menu (not `provideEditor`).

**Cycle two-mode fix:** closed cycle never enters `roots` (silent hide); a cycle off a root overflows. Visited-set + promote unreachable members; skip already-emitted ids.

## Verification

**Commands:**

- `npx vitest run src/utils/wbsTree.test.ts src/utils/wbsGrid.test.ts src/components/Wbs.test.tsx wbs.integration.test.ts` -- expected: pass, including matrix + both cycle modes + PUT 400
- `npx vitest run src/utils/wbs.test.ts` -- expected: pass unmodified
- `npm run typecheck` -- expected: clean

**Manual checks** (real Glide; harness cannot see these): keys match the menu; open editors keep Enter/Tab/Esc/Delete; ⋮ does not dismiss an overlay; add-child expands a collapsed parent; populated toolbar is gone.

## Suggested Review Order

**One structure surface**

- Menu and shortcuts share one action runner; Glide keys are cancelled so the grid does not also activate.
  [`Wbs.tsx:738`](../../src/components/Wbs.tsx#L738)

- Row menu lists every action with its shortcut, including disabled indent/outdent.
  [`WbsRowMenu.tsx:79`](../../src/components/WbsRowMenu.tsx#L79)

- ⋮ lives in the Task Description cell, not a sixth column or the header.
  [`Wbs.tsx:257`](../../src/components/Wbs.tsx#L257)

- Heading hint when rows exist; Add root item only while empty.
  [`Wbs.tsx:791`](../../src/components/Wbs.tsx#L791)

**Placement**

- Key → action map is overlay-aware so name/phase/roles keep Enter/Tab/Delete.
  [`wbsGrid.ts:432`](../../src/utils/wbsGrid.ts#L432)

- Sibling-below and outdent bump later integer `displayOrder`s; no reorder route.
  [`wbsGrid.ts:400`](../../src/utils/wbsGrid.ts#L400)

- Indent becomes the previous sibling's last child.
  [`wbsGrid.ts:407`](../../src/utils/wbsGrid.ts#L407)

**Cycle guards**

- Closed cycles surface as roots; walkers carry a visited-set.
  [`wbsTree.ts:42`](../../src/utils/wbsTree.ts#L42)

- Shared helper rejects self, descendant, or any ancestor loop.
  [`wbsTree.ts:261`](../../src/utils/wbsTree.ts#L261)

- `PUT` returns 400 after the existing self-parent and cross-project checks.
  [`server.ts:1083`](../../server.ts#L1083)

**Tests**

- Matrix coverage for menu, keys, empty-vs-populated chrome, and overlay no-op.
  [`Wbs.test.tsx:383`](../../src/components/Wbs.test.tsx#L383)

- Both cycle modes plus `wouldCreateCycle`.
  [`wbsTree.test.ts:75`](../../src/utils/wbsTree.test.ts#L75)

- Descendant and multi-hop `PUT` 400s.
  [`wbs.integration.test.ts:370`](../../wbs.integration.test.ts#L370)

---
title: 'Planning Table column visibility'
type: 'feature'
created: '2026-08-19'
status: 'done'
baseline_commit: '35b69d1ccf0e6ebfb6efd3428c3c7ad5b3b06d32'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Planning Table always shows all lead columns, and column identity is positional. Hiding a column without a resolver would send edits and week-header actions to the wrong field.

**Approach:** Add a Columns dropdown that shows/hides the eight toggleable lead columns, persisted per project in `localStorage`. Identity is a column `id`; grid indexes go through `resolveColumn()`.

## Boundaries & Constraints

**Always:**
- Toggleable: Rate card role, Client Role, Name, Internal Hourly cost, Internal Daily cost, Client Hourly rate, Client Daily rate, Margin. No cross-column guard rules.
- Actions column (and the row-number gutter) stay pinned — never hidden, never listed in the menu.
- Storage key is exactly `planning-columns:${project.id}`. Switching projects loads that project's list.
- Menu grouping matches the grid: Hourly/Daily cost under **Internal**, Hourly/Daily rate under **Client**.
- Hiding a column must not change any computed number (totals, margin, allocations). Visibility is display-only.
- Excel export, PNG export, and Client View keep all of their own columns regardless of what is hidden on the Planning Table.
- Preserve existing `onCellEdited` mutation bodies verbatim; only the dispatch (which column was edited) changes.
- `toggleColumn` / `showAllColumns` must `setGridSelection(undefined)` so a stale selection cannot point past the last column.
- Every `useCallback` that calls `resolveColumn` must list `visibleLeadColumns` in its deps.
- Checkbox `onSelect` must `preventDefault()` so the menu stays open for multiple toggles.
- After implementation, delete `docs/bmad-archive/planning-artifacts/planning-table-column-visibility-plan.md`.

**Ask First:**
- Persisting visibility on the server or sharing it via the client link.
- Hiding period or total columns.
- Changing Excel / PNG / Client View column sets.

**Never:**
- Edit `src/App.tsx`, `src/components/ClientView.tsx`, `server.ts`, `server-validation.ts`, or `prisma/schema.prisma`.
- Wire `hiddenColumns` into money math, `phaseTotals`, or summary cards.
- Leave leftover positional literals (`periodColumnStartIndex = 9`, `col === 0`, `col === 1`, `freezeColumns={4}`) as column identity.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All visible | `hidden = []` | 9 lead columns; period 0 at index 9 | N/A |
| Hide Name + Daily cost | `['name','intDaily']` | 7 lead columns; period 0 at index 7; `actions` still present | N/A |
| Hide all toggleable | every non-pinned id | 1 lead column (`actions`); period 0 at index 1 | N/A |
| Try to hide pinned | `'actions'` in stored list | Pinned column still rendered and not treated as hidden | Dropped on load |
| Per-project storage | project 1 hides Name; project 2 hides Margin | Each id loads its own list; unknown project → `[]` | N/A |
| Corrupt storage | non-JSON, non-array, unknown ids, numbers | Load returns only valid toggleable ids (or `[]`) | Swallow; view still works |
| Quota / private mode | `localStorage.setItem` throws | Toggle still updates the live grid | Persist is non-fatal |

</frozen-after-approval>

## Code Map

- `src/components/planningColumns.ts` -- **create.** Registry (`LEAD_COLUMNS`, `TOTAL_COLUMNS`, `COLUMN_MENU_SECTIONS`), `loadHiddenColumns` / `saveHiddenColumns`, `getVisibleLeadColumns`, `resolveColumn`. Exact module text is in the planning artifact listed under Verification.
- `src/components/ResourcePlan.tsx` -- **rewrite six positional sites** plus toolbar + state:
  - Imports L12–23: extend dropdown-menu with `DropdownMenuCheckboxItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`; lucide add `Columns3` (`ChevronDown` already present). `React` + `useEffect` already imported L1.
  - State after `gridSelection` L216: `hiddenColumns`, reload on `project.id`, `visibleLeadColumns`, `frozenColumnCount`, `toggleColumn`, `showAllColumns`.
  - `columns` useMemo L382–409: project `visibleLeadColumns` instead of the 9-item literal; period loop unchanged; totals from `TOTAL_COLUMNS`.
  - `getCellContent` L412–596: replace `colOffset++` walk with `resolveColumn` + `switch (resolved.id)`. Drop unused `isValidRole`. Add `visibleLeadColumns` to deps.
  - `onCellEdited` L599–741: dispatch by `resolved.id`; keep mutation bodies at L611–646 (role), L650–657 (clientRole), L662–669 (name), L674–681 (intHourly), L689–696 (clientHourly), L704–739 (allocation upsert — `weekNum = periodNumbers[resolved.index]`). Add `visibleLeadColumns` to deps.
  - `onCellsEdited` L745: `periodColumnStartIndex = visibleLeadColumns.length`; add dep.
  - `handleHeaderContextMenu` L1000: same `periodColumnStartIndex` change; drop "first 9 columns" comment; add dep.
  - `onCellActivated` L1693–1719: `resolved.id === 'actions'` / `'role'` instead of `col === 0` / `col === 1`.
  - `freezeColumns` L1720: `{frozenColumnCount}` (was `{4}`).
  - Toolbar: insert Columns dropdown after Generate AI Plan L1644, before period counter L1645.
- `src/components/ui/dropdown-menu.tsx` -- reuse only (`CheckboxItem` L85, `Label` L146, `Separator` L166). Do not rewrite.
- `src/components/planningColumns.test.ts` -- **create.** Cover the I/O matrix (visibility, pinned, resolve with/without hidden cols, per-project round-trip, corrupt load).
- `src/components/ResourcePlan.test.tsx` -- grid is mocked (`data-testid="glide-grid"`); add one toolbar assertion for the Columns button. `defaultProps` L27–46.
- `src/App.tsx` -- **read-only.** Excel `firstWeekCol = 9` ~L599 and PNG columns ~L902 must keep exporting every column.
- `src/components/ClientView.tsx` -- **read-only.** Separate 4-lead grid (`freezeColumns={2}` ~L556).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/planningColumns.ts` -- Add lead-column registry, localStorage helpers, and `resolveColumn` -- single source of column identity
- [x] `src/components/ResourcePlan.tsx` -- Wire hidden-column state, route all grid handlers through `resolveColumn`, add Columns dropdown -- user-facing feature
- [x] `src/components/planningColumns.test.ts` -- Unit-test the I/O matrix -- locks index-shift and storage filtering
- [x] `src/components/ResourcePlan.test.tsx` -- Assert Columns toolbar button renders -- grid itself is mocked
- [x] `docs/bmad-archive/planning-artifacts/planning-table-column-visibility-plan.md` -- Delete after the feature is implemented and verified -- user-requested cleanup

**Acceptance Criteria:**
- Given the Planning Table toolbar, when the user opens Columns and unchecks a lead column, then that column disappears, the menu stays open, and the button shows a count badge.
- Given hidden lead columns, when the user edits the first week cell or a remaining Hourly cost/rate cell, then the write lands on that week/field (not a neighbor) and Margin recomputes from plan data.
- Given hidden lead columns, when the user right-clicks a week header, then insert/delete apply to that week.
- Given a reload or a switch to another project, when the Planning Table mounts, then hidden columns follow `planning-columns:${project.id}`.
- Given any hidden set, when Excel, PNG, or the client link is used, then those surfaces still include all of their columns.

## Spec Change Log

## Design Notes

`resolveColumn(colIndex, visibleLead, periodCount)` is the only translator: lead ids occupy `0..visibleLead.length-1`, then periods, then totals (`Cost=0`, `Price=1`, `Efforts=2`). Frozen count is `visibleLead.filter(c => c.frozen).length` so hiding Client Role / Name moves the freeze line left.

Do not reintroduce `isValidRole` in `getCellContent` — it is unused today.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no new errors
- `npx vitest run src/components/planningColumns.test.ts src/components/ResourcePlan.test.tsx` -- expected: pass
- `npx vitest run` -- expected: full suite pass
- `grep -n "=== 9\\|= 9;\\|col === 0\\|col === 1\\|freezeColumns={4}" src/components/ResourcePlan.tsx` -- expected: no column-position hits

**Manual checks (if no CLI):**
- Columns → uncheck Name → badge `1`, menu stays open; hide Internal Daily cost; edit week 1 allocation and Hourly cost/rate; right-click that week header; freeze still works with Client Role+Name hidden; double-click Rate card role opens picker; reload persists; other project has its own set; Excel/PNG/client link still full-width.

## Suggested Review Order

**Column identity**

- Registry is the source of lead-column ids, freeze, and menu grouping.
  [`planningColumns.ts:33`](../../../src/components/planningColumns.ts#L33)

- `resolveColumn` is the only grid-index translator after columns are hidden.
  [`planningColumns.ts:111`](../../../src/components/planningColumns.ts#L111)

**Grid wiring**

- Hidden set is per-project `localStorage`; toggling clears a stale selection.
  [`ResourcePlan.tsx:230`](../../../src/components/ResourcePlan.tsx#L230)

- Visible descriptors drive headers; period and total columns stay as they were.
  [`ResourcePlan.tsx:423`](../../../src/components/ResourcePlan.tsx#L423)

- Cell render and edit dispatch by column id; mutation bodies are unchanged.
  [`ResourcePlan.tsx:441`](../../../src/components/ResourcePlan.tsx#L441)

- Fill-handle and week-header math use visible lead count, not `9`.
  [`ResourcePlan.tsx:658`](../../../src/components/ResourcePlan.tsx#L658)

- Role picker and freeze line follow remaining frozen lead columns.
  [`ResourcePlan.tsx:1658`](../../../src/components/ResourcePlan.tsx#L1658)

**Columns menu**

- Toolbar dropdown after Generate AI Plan; checkboxes keep the menu open.
  [`ResourcePlan.tsx:1557`](../../../src/components/ResourcePlan.tsx#L1557)

**Tests and changelog**

- I/O matrix: hide/shift, pinned, per-project persist, corrupt load, dedupe.
  [`planningColumns.test.ts:48`](../../../src/components/planningColumns.test.ts#L48)

- Toolbar: open Columns, uncheck Name, badge and `localStorage` update.
  [`ResourcePlan.test.tsx:107`](../../../src/components/ResourcePlan.test.tsx#L107)

- Unreleased note that Excel, PNG, and the client link stay full-width.
  [`CHANGELOG.md:11`](../../../CHANGELOG.md#L11)


---
title: 'WBS role columns — TOTAL plus one hours column per Resource List role'
type: 'feature'
created: '2026-08-29'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-resource-planner-2026-06-30/mockups/wbs-role-columns.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** WBS stacks role hours in one chip cell (`BA ×16`) plus a Hours rollup, so a role cannot be scanned down the tree and hours cannot be typed in place.

**Approach:** Drop the Roles chips. After Phase, show read-only **TOTAL** (slate, bold, normal borders) then one numeric column per distinct Resource List `role`. Leaves start at 0 and accept typed hours. Parents are read-only child sums. Match the approved mockup.

## Boundaries & Constraints

**Always:**

- Columns from Resource List `role` (not `clientRole`, not the rate card, not “roles that already have hours”). Duplicates collapse. Order = first-seen list order.
- TOTAL is pinned, always visible, immediately before role columns = sum of that row’s visible role cells. Not editable.
- TOTAL: slate fill (`#eceef2` / header `#d9dde5` / section `#dfe3ea`), bold tabular figures, zeros dark. Same 1px borders. Role-cell zeros medium gray.
- Role headers wrap on a space (`Dev Sr`); header height 44px.
- Rows with children: role cells not editable; ignore that row’s own `WbsEstimate`s; only descendants count.
- Rows without children: click, type, commit on Enter/blur. Blank → 0. Negative / non-numeric → revert, no request.
- Writes: existing `replaceWbsEstimates` + `createEstimateCommitter`. Discipline via `deriveDiscipline`. Empty rate card still accepts list role strings.
- `NAME_COL = 1`, `OUTLINE_COL = 0` stay. New columns only replace today’s Roles + Hours.
- Derivation and commit live outside canvas renderers (`wbsGrid.ts` or sibling).

**Ask First:**

- Any Prisma / `server.ts` / `server-validation.ts` change.
- Auto-deleting leftover parent estimates or estimates whose role left the Resource List.
- Changing `buildReconciliationReport` (still sums each item’s **own** hours).

**Never:**

- Roles overlay / chips (`RolesEditor` as edit path, `layoutChips`, `RolesCellRenderer`).
- New grid library. Edits to `src/components/ui/`.
- Schema, unique key, or `PUT /api/wbs-items/:id/estimates` contract.
- Driving these columns from `rollupHours` (discipline, includes parent own).
- Hiding TOTAL or role columns in Columns. Roadmap remains the only toggle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Columns from list | List `SA`, `Dev Sr`, `Dev Sr`, `QA` | `TOTAL · SA · Dev Sr · QA` | N/A |
| Empty list | No list roles | TOTAL shown (0s); no role columns | N/A |
| Leaf edit | Type `32` in leaf Dev Sr | Cell 32; TOTAL updates; `replaceWbsEstimates` | Invalid → revert, no request |
| Parent rollup | Children 16+8 in SA | Parent SA=24, TOTAL=sum; not editable | N/A |
| Leftover parent rows | Parent still has own estimates | Grid ignores them; children-only | Do not auto-delete |
| Role removed from list | Estimates remain | Column gone; TOTAL uses remaining roles; DB rows stay | Do not auto-delete |
| Rapid leaf edits | Two cells before first PUT returns | Both survive (existing committer) | Banner; later edits still run |

</frozen-after-approval>

## Code Map

- `src/components/wbsColumns.ts:14–36,76–78` — replace `roles`/`hours` with pinned `total` + generated role defs (id ≠ grid index). Only `roadmap` hideable. Tests: `wbsColumns.test.ts:11–72`.
- `src/utils/wbsGrid.ts:166–175` — `resourceListRoles` today `localeCompare`; switch to first-seen. Column source.
- `src/utils/wbsGrid.ts:216–252` — add per-role leaf values, children-only role rollup, TOTAL. Do not reuse `rollupHours`.
- `src/utils/wbsGrid.ts:268–315,653–696` — reuse `parseHours` / `formatHours` / `createEstimateCommitter` / `pairsToPayload` / `deriveDiscipline`.
- `src/components/Wbs.tsx:129–130,406–477,824–943,983–1014` — drop Roles renderer; leaf Number/Text overlay; parent readonly; TOTAL `themeOverride`; `HEADER_HEIGHT` 44; `onCellEdited` must handle role cols (skips roles today at 1011).
- `src/App.tsx:403–417`, `src/services/api.ts:579–590`, `server.ts:1334–1370`, `src/utils/wbs.ts:69–110`, `src/utils/wbsTree.ts:112–125` — **read-only**.
- Tests assuming Roles@3 / Hours@4: `Wbs.test.tsx:313–346`, `Wbs.roadmap.test.tsx:139–178`, `App.wbs.test.tsx:293–303`, `wbsGrid.test.ts`, `RolesEditor.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/utils/wbsGrid.ts` + test — first-seen roles; children-only rollup + TOTAL; unit-test I/O matrix rows that are pure.
- [ ] `src/components/wbsColumns.ts` + test — `total` + dynamic role columns; default set has no Roles/Hours.
- [ ] `src/components/Wbs.tsx` — wire columns, TOTAL theme, in-cell leaf edit, 44px wrapped headers; remove Roles renderer.
- [ ] `Wbs.test.tsx`, `Wbs.roadmap.test.tsx`, `App.wbs.test.tsx` — headers/indices for TOTAL + roles.
- [ ] `RolesEditor.tsx` / test — unused after this slice → delete.

**Acceptance Criteria:**
- Given Resource List SA, Dev Sr, Dev Md, QA, when WBS renders, then headers are `WBS · Task Description · Phase · TOTAL · SA · Dev Sr · Dev Md · QA` (Roadmap only if shown).
- Given a leaf 0/32/16/8, when shown, then TOTAL is 56 and the parent role cells equal child sums.
- Given a parent, when a role cell is clicked, then no editor and no request.
- Given a leaf, when a valid number is typed and blurred, then that item’s estimates are replaced and TOTAL updates.

## Spec Change Log

## Design Notes

Missing pair ⇒ show 0. Committing 0 may omit the pair. Glide: newline in `title` + `HEADER_HEIGHT` 44.

## Verification

**Commands:**
- `npx vitest run src/utils/wbsGrid.test.ts src/components/wbsColumns.test.ts src/components/Wbs.test.tsx src/components/Wbs.roadmap.test.tsx src/App.wbs.test.tsx` -- expected: pass
- `npm run typecheck` -- expected: zero errors

**Manual checks (if no CLI):**
- WBS: TOTAL slate, columns match Resource List, type a leaf, parent totals update, parent does not edit. Add/remove a list role → column appears/disappears.

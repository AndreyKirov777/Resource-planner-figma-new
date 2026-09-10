---
title: 'WBS Roles picker — source from project Resource List'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_commit: 'b85c5131b98be79113081aea6ce54178062cffe5'
context:
  - '{project-root}/docs/bmad-archive/implementation-artifacts/spec-wbs-2r-wbs-table-redesign.md'
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The WBS Roles overlay picks from the global rate card. The project's staffing roster — the Resource List — is what Resource Plan already uses, so a WBS estimate can name a role that is not on this project's team (or omit one that is).

**Approach:** Keep the existing Glide overlay and `RolesEditor`. Change only the Select's option source to distinct `ResourceList.role` strings for the current project. Discipline stays derived from the rate card (`deriveDiscipline` / `resolveDiscipline`) so server validation and reconciliation keep working.

## Boundaries & Constraints

**Always:**

- Pass the already-loaded per-project `resourceLists` into `Wbs` / `RolesEditor`. `rateCards` stay — they still feed `deriveDiscipline` and `buildReconciliationReport`.
- Picker options = distinct, non-empty `ResourceList.role` values, alphabetised, minus roles already on that WBS item. Duplicate list rows (same role, different location/rate) collapse to one option — WBS stores a role string, not a list `id`.
- When the rate card is non-empty, offer only list roles that `resolveDiscipline` can map. Custom roster roles with no card match would 400 (`validWbsDisciplines`); do not put them in the Select.
- Free text only when the resource list has no roles **and** the rate card is empty (the server's empty-card bypass). Empty roster + populated card → no Add row (same exhausted/empty treatment as "nothing left to pick"), not a typed role that the server will reject.
- Overlay, commit queue, full-replace payload, chip rendering, and `CLICK_OUTSIDE_IGNORE` / `OVERLAY_MENU_CLASS` / `isOutsideClick` guards are unchanged.
- Pure picker helpers live in `src/utils/wbsGrid.ts` (no grid import) and stay unit-tested.

**Ask First:**

- If empty roster seems to need a rate-card fallback picker (user chose resource list as the source).
- If a list role that does not resolve on the card seems to need a new server rule or a `discipline` field on `ResourceList`.

**Never:**

- No schema, `server.ts`, `server-validation.ts`, or new endpoints.
- No Resource Plan changes, no Resource List tab changes, no seeding the list from the rate card.
- No `WbsEstimate` shape change, no `buildReconciliationReport` logic change.
- Do not copy `ResourcePlan.tsx`'s role Dialog (or its unused `RoleCellRenderer`). WBS is a multi-pair overlay, not a one-role-per-row dialog.
- No export/import, no `notes`, no keyboard outliner / reparenting.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy path | List has `BA`, `UX`; card maps both | Select offers those two; Add writes `{role, discipline from card, hours}` via existing replace | App-level error banner on API failure |
| Already on item | Item has `BA`; list has `BA`, `UX` | Select offers only `UX` | N/A |
| Duplicate list rows | Two list rows both `BA` (different location) | One `BA` option | N/A |
| List role not on card | List has `Contractor`; card is non-empty and has no `Contractor` | `Contractor` is not offered | N/A |
| Exhausted | Every list role that would be offered is already on the item | Exhausted copy; no Add row | N/A |
| Empty roster, card populated | `resourceLists = []`, card has rows | No Add row (empty/exhausted); no free text | N/A |
| Empty roster, empty card | Both empty | Free-text role; discipline = the typed role; server empty-card bypass accepts it | Invalid hours: no request |
| Existing pair not on list | Item has `BA`; list no longer contains `BA` | Chip stays; hours/remove still work; `BA` is not re-offered | N/A |

</frozen-after-approval>

## Code Map

- `src/App.tsx` — `Wbs` is not passed `resourceLists` today (comment at the WBS handlers: independent of the roster). Pass it.
- `src/components/Wbs.tsx` — `WbsProps` / `RolesCellData` thread `rateCards` into `RolesEditor`; add `resourceLists` beside them.
- `src/utils/wbsGrid.ts` — `rateCardRoles` / `availableRoles` are the picker source. Point them (or sibling helpers) at `ResourceList.role`. Keep `deriveDiscipline(role, rateCards)`.
- `src/components/RolesEditor.tsx` — Select/`useFreeText`/`exhausted` currently key off `rateCardRoles(rateCards)`. Switch those gates to the list-based helpers; keep `deriveDiscipline(..., rateCards)`.
- `src/components/RolesEditor.test.tsx` — retarget empty/select/exhausted cases onto `resourceLists`.
- `src/utils/wbsGrid.test.ts` — retarget `availableRoles` / distinct-role helpers.
- `src/components/Wbs.test.tsx` — `defaultProps` must supply `resourceLists` once the prop is required.

## Tasks & Acceptance

**Execution:**
- [x] `src/utils/wbsGrid.ts` -- picker-source helpers read distinct `ResourceList.role`; `deriveDiscipline` unchanged -- model stays testable without the grid
- [x] `src/components/RolesEditor.tsx` -- Select, free-text gate, and exhausted gate use the list helpers; still derive discipline from `rateCards` -- overlay behaviour otherwise untouched
- [x] `src/components/Wbs.tsx` -- accept and thread `resourceLists` into `RolesCellData` / `RolesEditor` -- adapter only
- [x] `src/App.tsx` -- pass already-loaded `resourceLists` into `Wbs` -- roster is already in memory
- [x] `src/components/RolesEditor.test.tsx`, `src/utils/wbsGrid.test.ts`, `src/components/Wbs.test.tsx` -- cover the I/O matrix rows -- canvas cells are untestable; editor + helpers are the harness

**Acceptance Criteria:**
- Given a project with a resource list and a matching rate card, when the WBS Roles overlay opens, then the Select lists that project's distinct list roles (minus ones already on the item), not the full global rate card.
- Given a resource-list role with no rate-card match and a non-empty card, when the overlay opens, then that role is not offered.
- Given an empty resource list and a populated rate card, when the overlay opens, then there is no free-text role input.
- Given Resource Plan or the Resource List tab, when this ships, then those screens behave as they do on `baseline_commit`.

## Spec Change Log

## Verification

**Commands:**
- `npx vitest run src/components/RolesEditor.test.tsx src/utils/wbsGrid.test.ts src/components/Wbs.test.tsx` -- expected: pass, including the matrix cases above
- `npx vitest run src/utils/wbs.test.ts` -- expected: pass (reconciliation untouched)

## Suggested Review Order

**Picker source**

- Distinct roster roles are the Select catalog; rate card only maps discipline.
  [`wbsGrid.ts:158`](../../../src/utils/wbsGrid.ts#L158)

- Unmapped or blank-discipline list roles are dropped when the card is populated.
  [`wbsGrid.ts:174`](../../../src/utils/wbsGrid.ts#L174)

- Free text only when both the roster and the rate card are empty.
  [`wbsGrid.ts:194`](../../../src/utils/wbsGrid.ts#L194)

**Overlay**

- Existing Glide overlay; only the option source and exhausted/free-text gates change.
  [`RolesEditor.tsx:243`](../../src/components/RolesEditor.tsx#L243)

**Wiring**

- Already-loaded per-project roster is passed into WBS.
  [`App.tsx:1241`](../../../src/App.tsx#L1241)

- Cell data threads the roster into the overlay without a new endpoint.
  [`Wbs.tsx:528`](../../../src/components/Wbs.tsx#L528)

**Tests**

- Helper coverage for the I/O matrix, including empty-discipline omission.
  [`wbsGrid.test.ts:247`](../../../src/utils/wbsGrid.test.ts#L247)

- Overlay Select / free-text / exhausted cases retargeted onto the roster.
  [`RolesEditor.test.tsx:81`](../../src/components/RolesEditor.test.tsx#L81)

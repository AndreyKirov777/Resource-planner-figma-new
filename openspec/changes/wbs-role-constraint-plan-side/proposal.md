## Why

The 2026-08-12 WBS proposal's decision D6 ("Plan-side roles: constrain to rate card, forbid free text") was scoped but never wired up. `ResourcePlan.tsx` still has two live free-text paths: the grid's role cell falls back to persisting arbitrary typed text when it doesn't match a project resource, and a new row seeds `role: 'New role'` — itself not a resource-list entry. The server accepts any string for `ResourcePlan.role`. A `validateRole` helper already exists in `ResourcePlan.tsx` but is never called — dead code left over from an earlier attempt. The convention shifted after D6 was written: WBS role assignment (`spec-wbs-roles-from-resource-list`) constrains to the **project's resource list**, not the global rate card, and Resource Plan's own role-picker dialog and cell-edit matching already resolve against `resourceLists` — this closes the same gap on the same, already-established source.

## What Changes

- `ResourcePlan.tsx`'s role cell no longer accepts free text that doesn't match a project resource-list role; unmatched input reverts instead of persisting. The role-picker dialog (already the primary path) is unaffected.
- A new plan row's role is seeded from the project's resource list when it has entries, instead of the literal placeholder `'New role'`.
- The constraint is conditional on the project's resource list being non-empty, mirroring the same "skip when the list is empty" rule already used for `WbsEstimate.discipline` (WBS-1) — a project with no resource list is unconstrained, since there is nothing to constrain against.
- `POST /api/projects/:projectId/resource-plans` and `PUT /api/resource-plans/:id` reject a `role` that doesn't match an entry in that project's `ResourceList` when the list is non-empty (400).
- Legacy rows with a role outside the current resource list are left untouched — this only gates new writes, not existing data.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `resource-plan`: adds a requirement that plan-side role assignment is constrained to the project's resource list (conditional on it being non-empty), closing decision D6 from the WBS proposal.

## Impact

- `src/components/ResourcePlan.tsx` — role cell edit handler, `addRole`, wire up (or replace) the existing unused `validateRole` helper.
- `server.ts` — `POST /api/projects/:projectId/resource-plans`, `PUT /api/resource-plans/:id`.
- `server-validation.ts` — no schema shape change; the membership check is data-dependent (needs a DB read) and runs in the route handler, same pattern as WBS-1's discipline check.
- Tests: `src/components/ResourcePlan.test.tsx`, `api.integration.test.ts`.
- No migration, no schema change.

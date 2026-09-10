## 1. Server-side constraint

- [x] 1.1 Add an `isRoleAllowed(role, resourceList)` helper near the resource-plan routes in `server.ts` (allowed when the list is empty or contains a matching `role`); wire it into `POST /api/projects/:projectId/resource-plans` (list scoped by `req.params.projectId`) and `PUT /api/resource-plans/:id` (look up the plan's `projectId` first), returning 400 with `details` naming the field when it fails. Verify with `npm run typecheck`.

## 2. Client-side constraint

- [x] 2.1 In `src/components/ResourcePlan.tsx`'s `onCellEdited` role branch, when neither `findResourceForPlan` nor the exact-match fallback finds a resource, do not persist `newRole` as free text — leave the row unchanged instead (delete the current fallback `role: newRole` branch and its call to `onResourcePlansChange`). Verify with a new test asserting no `onResourcePlansChange` call for an unmatched typed role.
- [x] 2.2 In `addRole`, seed the new row's `role` from `resourceLists[0]?.role` when the list is non-empty, falling back to the existing `'New role'` placeholder only when it is empty. Verify with a new test covering both cases.
- [x] 2.3 Remove or repurpose the existing unused `validateRole` callback (dead code per the proposal) — either delete it if 1.1/2.1 make it redundant, or use it directly in 2.1 instead of duplicating its check. Verify with `npm run typecheck` (no unused-variable warnings) and `npm test src/components/ResourcePlan.test.tsx`.

## 3. Tests

- [x] 3.1 Add `api.integration.test.ts` cases: creating/updating a resource plan with a role matching the project's resource list succeeds; with a non-matching role and a non-empty list it 400s; with an empty list any role is accepted (existing behavior, regression guard). Verify with `npx vitest run api.integration.test.ts`.
- [x] 3.2 Add `src/components/ResourcePlan.test.tsx` cases per 2.1/2.2. Verify with `npx vitest run src/components/ResourcePlan.test.tsx`.

## 4. Docs

- [x] 4.1 No other docs task — the delta at `openspec/changes/wbs-role-constraint-plan-side/specs/resource-plan/spec.md` is merged into `openspec/specs/resource-plan/spec.md` on archive; nothing in `docs/bmad-archive/` changes (it is frozen except `deferred-work.md`, which this change does not touch).

## 5. Final verification

- [x] 5.1 Run `npm run typecheck` and `npx vitest run api.integration.test.ts src/components/ResourcePlan.test.tsx`; both pass.

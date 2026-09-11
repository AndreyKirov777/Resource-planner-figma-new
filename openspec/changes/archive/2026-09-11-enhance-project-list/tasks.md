## 1. Schema and API

- [x] 1.1 Add `Project.status String @default("active")` in `prisma/schema.prisma` and a migration `ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'`. Verify with `npx prisma generate` (do not hand-edit `src/generated/prisma`) and a loaded existing row whose `status` is `active`.
- [x] 1.2 Add optional `status: z.enum(['active', 'archived'])` to `projectCreateSchema` and `projectUpdateSchema` in `server-validation.ts` (keep both `.strict()`). Verify a create/update body with `status: 'paused'` or an unknown key still 400s.
- [x] 1.3 In `server.ts`: pass `status` through on create when present; force `status: 'active'` on `POST /api/projects/:id/copy`; on import set `status` to `'archived'` only when the payload value is exactly `'archived'`, otherwise `'active'`; leave `schemaVersion` at `4` and note that v4 now carries `status`. Verify create-without-status is `active`, copy of archived is `active`, and `GET /api/projects` still returns archived rows.
- [x] 1.4 Add required `status: 'active' | 'archived'` to `Project` in `src/services/api.ts`. Verify TypeScript callers compile against the new field (no new endpoints).

## 2. Project list and boot

- [x] 2.1 In `src/components/ProjectList.tsx`, derive the view as status filter → search → sort (defaults: Active, empty query, `updatedAt` desc). Add search, `Active` / `Archived` / `All` filter, click-to-sort on Project name / Created / Last updated (name first-click A→Z; dates first-click newest first; second click flips), Archive / Restore via `api.updateProject`, list-row badge only in All, and a "No projects match" empty state. Verify the default list hides archived rows and sorts last-updated newest first.
- [x] 2.2 In `src/App.tsx`, honor `?project=<id>` regardless of status; with no id open the first active project else `projects[0]`; show an Archived badge above the tab strip while the open project is `archived`. Verify a deep-linked archived project opens and shows the badge, and a no-id boot prefers an active row.

## 3. Tests

- [x] 3.1 Extend `src/components/ProjectList.test.tsx` for default sort, header toggle, name-or-description search within the current status filter, default-Active hiding archived, Archived-only view without a name badge, All-view badge, Archive / Restore, and copy-of-archived staying out of the default Active view. Verify with `npx vitest run src/components/ProjectList.test.tsx`.
- [x] 3.2 Extend `src/App.test.tsx` for boot-prefers-active, `?project=` opening an archived project, and the chrome Archived badge. Verify with `npx vitest run src/App.test.tsx`.
- [x] 3.3 Extend `api.integration.test.ts` for create default `active`, PUT `status`, copy of archived → `active`, and GET returning the full list including archived. Verify with `npx vitest run api.integration.test.ts`.
- [x] 3.4 Extend the export/import block in `wbs.integration.test.ts`: omitted `status` imports as `active`; archived round-trips; `schemaVersion` stays `4`. Verify with `npx vitest run wbs.integration.test.ts`.
- [x] 3.5 Add `status: 'active'` to typed `Project` fixtures in `src/components/ResourcePlan.test.tsx`, `src/components/ResourcePlanPhases.test.tsx`, `src/components/Wbs.test.tsx`, and `src/components/Wbs.roadmap.test.tsx` (and any other typed fixture `npm run typecheck` flags). Verify with `npm run typecheck`.

## 4. Docs

- [x] 4.1 Leave the deltas at `openspec/changes/enhance-project-list/specs/project-settings/spec.md` and `specs/export-import/spec.md` as the behavior contract; if implementation forces a spec tweak, edit those deltas only. Do not edit `docs/bmad-archive/` or the main specs (those merge on archive). Verify `openspec validate enhance-project-list --strict` still passes.

## 5. Final verification

- [x] 5.1 Run `npm run typecheck` and `npx vitest run src/components/ProjectList.test.tsx src/App.test.tsx api.integration.test.ts wbs.integration.test.ts`; both pass.

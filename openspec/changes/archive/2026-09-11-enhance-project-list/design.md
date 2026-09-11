## Context

See proposal.md (Why) for motivation and `specs/project-settings/spec.md` / `specs/export-import/spec.md` for the behavior contract.

Today `GET /api/projects` returns every row with no `orderBy`; `ProjectList` renders that array as-is. `App.loadProjectData` opens `?project=<id>` when present, otherwise `projects[0]` (Prisma insert order). Copy and JSON import already whitelist scalars onto `prisma.project.create`; neither has a status field. `planningMode` is a string column plus a Zod enum — that is the pattern to follow, not a new Prisma enum type.

Catalog size stays small enough that the proposal's Never list (no pagination, no `?q=` / `?sort=` / `?page=`) is the constraint, not a performance problem.

## Goals / Non-Goals

**Goals:**

- Persist `status` as a first-class Project scalar with a SQLite default so existing rows become `active` without a data script.
- Keep list query, sort, and status filter entirely in the client from the full `GET /api/projects` payload.
- Make Archive / Restore a `PUT` of `status` (same update path as rename); force `active` on copy in the server so the client cannot forget.
- Carry `status` on schemaVersion 4 export/import without a version bump; omit → `active`.
- Prefer an active project on boot when the URL has no id; still honor `?project=<id>` for archived rows.
- Show an Archived badge in App chrome whenever the open project is archived; show a list-row badge only in the All filter.

**Non-Goals:**

- Server-side list query params, pagination, or changing `GET /api/projects` into a filtered endpoint.
- New endpoints (`/archive`, `/restore`) or extra statuses.
- URL-persisted sort / search / filter (component state is enough; remount resets to defaults).
- Threading archive UI through ResourcePlan / WBS / Roadmap.
- A `schemaVersion` 5 bump or replacing the shadcn table.

## Decisions

### 1. `status` is a string column, not a Prisma enum

`Project.status String @default("active")`. Zod `z.enum(['active', 'archived']).optional()` on both `projectCreateSchema` and `projectUpdateSchema` (still `.strict()`). Create UI does not expose the field; the DB default (and create omit) yields `active`.

**Why:** Matches `planningMode`. A Prisma enum would add a migrate-time type and a generated union for a two-value flag.

**Alternative considered:** Prisma `enum ProjectStatus`. Rejected as inconsistent with the rest of the schema and more migrate ceremony for no query benefit.

### 2. Client derives the list: status filter → search → sort

`ProjectList` keeps four pieces of local state:

- `statusFilter`: `'active' | 'archived' | 'all'` (default `'active'`)
- `query`: string
- `sortKey`: `'name' | 'createdAt' | 'updatedAt'` (default `'updatedAt'`)
- `sortDir`: `'asc' | 'desc'` (default `'desc'`)

Pipeline: keep rows matching the status filter; then keep rows whose name **or** description contains the trimmed query (case-insensitive substring; empty query is a no-op); then sort. First click on Project name sorts A→Z; first click on Created or Last updated sorts newest first; a second click on the same header flips `sortDir`.

`GET /api/projects` stays an unfiltered full list. Do not add `orderBy` as a substitute for client sort — the table is the source of truth.

Empty catalog still shows "No projects yet". A non-empty catalog that filters down to zero rows shows a distinct "No projects match" empty state so the user can clear search / switch filter.

**Why:** Proposal Never list forbids server query params. Deriving in one place keeps Archive / Restore / Copy working on the same in-memory array after `GET`.

**Alternative considered:** URL params for filter/sort. Rejected — not in the spec, and remount-to-defaults matches "default Active" / "default last updated".

### 3. Archive / Restore reuse `PUT /api/projects/:id`

Row action calls `api.updateProject(id, { status: 'archived' | 'active' })`. No new route. After success, update the local list and `onProjectUpdated` so App's `currentProject` picks up the new status (badge appears) without a full reload.

Delete stays the existing cascade. Copy stays `POST /api/projects/:id/copy`; the handler sets `status: 'active'` on the new row and does **not** copy the source status.

**Why:** Status is one more optional update field. A dedicated verb-route would duplicate validation and still need the same Prisma write.

**Alternative considered:** Client-only "force active on copy". Rejected — the server is the contract (integration tests, import tools, future clients).

### 4. Import persists `status` when it is exactly `archived`; everything else is `active`

Export already spreads `...project` into `data`, so the new column appears on the wire automatically. Leave `schemaVersion: 4`. On import, set

`status: projectData.status === 'archived' ? 'archived' : 'active'`

so omitted, `null`, `active`, and garbage all become `active`. Copy of an archived project is **not** the import path: import is a snapshot restore and keeps `archived` when the payload says so.

**Why:** Spec requires omit → `active` and an archived round-trip without a version bump. Coercing unknowns avoids a 500 on a hand-edited payload.

**Alternative considered:** Bump to schemaVersion 5 and reject unknown status. Rejected by the proposal Never list.

### 5. Boot: deep link wins; otherwise first active, else first row

In `loadProjectData`:

- If `preferredProjectId` is found, open it regardless of status.
- Else open the first `status === 'active'` project; if none, `projects[0]` (may be archived).
- Empty catalog still creates the default project (active via DB default).

Archived chrome badge lives in `App.tsx` above the tab strip whenever `currentProject.status === 'archived'`. List-row badge (on the name) renders only when `statusFilter === 'all'`.

**Why:** Spec: `?project=<id>` opens archived; boot with no id prefers active. An app-level badge is visible on every tab without new props on ResourcePlan / WBS / Roadmap. If every project is archived and there is no id, falling back to `projects[0]` avoids a blank shell and a surprise second default project.

**Alternative considered:** Auto-create a new active project when only archived rows exist. Rejected — that invents data the user did not ask for.

### 6. TypeScript `Project.status` is required

`src/services/api.ts` adds `status: 'active' | 'archived'`. The API always returns the column. Typed test fixtures that already annotate `Project` get `status: 'active'` (or `'archived'` where the case needs it). Untyped object literals keep compiling.

## Files to touch

**Write**

- `prisma/schema.prisma` — `Project.status` string, default `active`
- `prisma/migrations/<timestamp>_add_project_status/migration.sql` — `ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active'` (same shape as `investment`)
- `server-validation.ts` — optional `status` enum on create and update
- `server.ts` — create may pass `status`; update already spreads parsed data; copy forces `active`; import whitelist as in Decision 4; export comment that v4 now also carries `status`
- `src/services/api.ts` — `Project.status`
- `src/components/ProjectList.tsx` — search box, status filter, sortable headers, derived view, Archive / Restore actions
- `src/App.tsx` — boot preference, chrome Archived badge; existing `onProjectUpdated` already refreshes the open project
- `src/components/ProjectList.test.tsx` — sort, search, filter, badge-only-on-All, Archive / Restore, copy-of-archived stays out of the default Active view
- `src/App.test.tsx` — boot prefers active; `?project=` opens archived; chrome badge
- `api.integration.test.ts` — create default `active`; PUT `status`; copy of archived is `active`; GET still returns archived rows
- `wbs.integration.test.ts` (export/import block) — omitted `status` → `active`; archived round-trip; `schemaVersion` stays `4`
- Typed `Project` fixtures that fail `npm run typecheck` after the interface change, at least: `src/components/ResourcePlan.test.tsx`, `src/components/ResourcePlanPhases.test.tsx`, `src/components/Wbs.test.tsx`, `src/components/Wbs.roadmap.test.tsx`

**Read-only (do not edit; conventions / contracts)**

- `openspec/changes/enhance-project-list/proposal.md`
- `openspec/changes/enhance-project-list/specs/project-settings/spec.md`
- `openspec/changes/enhance-project-list/specs/export-import/spec.md`
- `openspec/specs/project-settings/spec.md` and `openspec/specs/export-import/spec.md` (main specs; deltas apply at archive)
- `src/components/ui/table.tsx`, `button.tsx`, `input.tsx`, `select.tsx` — reuse; do not replace with AG Grid
- `testDb.ts`, `globalSetup.ts` — integration isolation; `await isolateTestDb('<unique>')` before importing `./server`
- `docs/bmad-archive/project-context.md` — binding conventions

After schema edit: `npx prisma migrate` (or `db push` in the test path the repo already uses) and `npx prisma generate`. Do not hand-edit `src/generated/prisma`. `npm run typecheck` before calling the work done.

## Risks / Trade-offs

- **[Risk] User archives the open project and the default Active list hides that row** → Mitigation: the project stays open and the App chrome badge stays visible; Restore remains on the Archived / All views.
- **[Risk] `GET /api/projects` order is undefined, so "first active" on boot is not "most recently updated"** → Mitigation: acceptable; boot only promises *an* active project. The list's default sort is last-updated newest first and is independent of boot pick.
- **[Risk] Adding required `status` to `Project` breaks typed fixtures** → Mitigation: listed above; treat `npm run typecheck` as the sweep, not a hunt through every untyped mock.
- **[Risk] Catalog growth makes client filter slow** → Mitigation: accepted by the Never list; no pagination in this change.
- **[Trade-off] Invalid import `status` is coerced, not rejected** → Prefer a successful import over a 500; only the literal `'archived'` is sticky.

## Migration Plan

1. Add the Prisma column with `DEFAULT 'active'` so SQLite backfills existing `dev.db` / test DBs on migrate.
2. Ship API + UI together: old clients ignore the extra JSON field; new clients need the column.
3. Rollback: drop the column (or revert the migration). Every project looks active again; no other tables are involved.
4. Export files written before this change omit `status` and import as `active` — that is the intended compat path, not a migration step.

## Open Questions

None. Status-filter shape, folder semantics, default sort, and export versioning were decided in explore.

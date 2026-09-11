## Why

The project list is an unsorted dump of every project, with no way to find one by name or description or to get closed work out of the way. As the catalog grows, the working set is buried under old proposals.

## What Changes

- The project list gains click-to-sort on **Project name**, **Created**, and **Last updated**. Default order is last updated, newest first.
- A single search box matches a project when **either** its name or its description contains the query (case-insensitive substring). Search applies to the current status filter.
- Each project has a status of `active` or `archived`. Existing rows migrate to `active`. Archive is a folder, not a lock: an archived project stays fully openable and editable.
- A **Status** filter (`Active` / `Archived` / `All`) defaults to `Active`, so archived projects are hidden until the user asks for them. `All` is the only view that marks archived rows (a badge on the name).
- Row actions add Archive / Restore. Copy of an archived project creates a new **active** project. Delete stays the destructive cascade.
- `?project=<id>` still opens that project even if it is archived. App boot prefers an active project when no id is given.
- JSON export/import carries `status` on the project row with **no** `schemaVersion` bump; a payload that omits it imports as `active`.

### Never

- Pagination, infinite scroll, or server-side `?q=` / `?sort=` / `?page=`
- Treating archive as read-only or requiring Restore before edit
- Extra statuses, clients, owners, or an All-only-via-search reveal
- A `schemaVersion` 5 bump, or replacing the shadcn table with AG Grid

### Ask First

- None. Status-filter shape, folder semantics, default sort, and export versioning were decided in explore.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `project-settings`: project lifecycle gains `active` / `archived` status, list sort, list search, and a default-Active status filter; copy of archived becomes active; deep links still open archived projects.
- `export-import`: project JSON includes `status`; missing `status` on import is `active`; `schemaVersion` stays `4`.

## Impact

- `prisma/schema.prisma` — `Project.status` with default `active`; migration backfills existing rows.
- `server.ts` — create defaults to `active`; update accepts `status`; copy forces `active` on the new row; `GET /api/projects` still returns the full list (client filters).
- `server-validation.ts` — `status` on create (optional) and update (optional), both `.strict()`.
- `src/services/api.ts` — `Project.status`; no new endpoints.
- `src/components/ProjectList.tsx` — search, sortable headers, status filter, Archive / Restore, derived filter-then-sort view.
- `src/App.tsx` — boot prefers an active project; honor `?project=<id>` regardless of status; Archived badge while that project is open.
- JSON import whitelist in `server.ts` — persist `status` when present.
- Tests: `src/components/ProjectList.test.tsx`, `src/App.test.tsx`, `api.integration.test.ts` (and export/import coverage for missing/`archived` status).

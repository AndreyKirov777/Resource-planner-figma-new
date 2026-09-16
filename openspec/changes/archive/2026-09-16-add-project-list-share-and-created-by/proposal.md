## Why

Sharing a project today means opening it first: the Share dialog only lives on the plan toolbar, so owners cannot invite people from the catalog. The list also shows when a project was created but not who created it, which matters now that several people share one instance.

## What Changes

- **Share on the project list.** Each row gains a Share button between Edit and Archive (or Restore). It opens the existing Share dialog for that project — the same People and Client links sections, with the same role gating.
- **Created by column.** After Last updated, every row shows the creator's display name. A missing creator (legacy ownerless rows before the first ADMIN sign-in) shows an em dash, matching Owner.
- **List payload includes the creator name.** `GET /api/projects` (and the create / copy / update responses the list merges) returns `createdByName` next to the existing `ownerName`, so the column does not need a second request.

### Never

- A second share flow, invite email, or a list-only member picker. The list button opens the existing `ShareDialog`.
- Changing who may manage people or client links (still OWNER/ADMIN for People; write roles for links; VIEWER sees the same empty dialog they already get from the plan toolbar).
- Making Created by sortable, searchable, or a new list scope.
- Transferring ownership, renaming Owner, or adding Created by to the plan header.
- New REST routes, a schema migration, or a `schemaVersion` bump.

### Ask First

None that block planning. Assumptions recorded without asking:

- Share is offered on every visible row, including VIEWER, so the list matches the plan toolbar. The dialog already hides People and Client links by role.
- Created by is `User.displayName` of `Project.createdById`, shown on every scope (including "My projects", where Owner is hidden). It is not click-to-sort.
- Owner and creator are usually the same person today; both columns still appear when the Owner column is shown.

## Capabilities

### New Capabilities

- None. This is a project-list surface change on top of existing sharing and ownership.

### Modified Capabilities

- `project-settings`: the project list shows Created by after Last updated and a Share action between Edit and Archive.
- `project-access`: the existing Share dialog can be opened from the project list as well as the plan toolbar. (`project-access` is an in-flight capability from `add-multi-user-access`, not yet synced to `openspec/specs/`.)

## Impact

- **Server:** `GET /api/projects` (mine / shared / all) includes `createdBy` and returns `createdByName`. Create, copy, and update responses used by the list include the same field so a newly added or edited row does not lose the name.
- **Client:** `src/services/api.ts` (`createdByName` on `Project`); `src/components/ProjectList.tsx` (column + Share button + existing `ShareDialog`); `src/components/ProjectList.test.tsx`.
- **Tests:** list column and button placement / role visibility; list-endpoint payload includes `createdByName`.
- **No** Prisma migration, new env vars, or new dependencies.

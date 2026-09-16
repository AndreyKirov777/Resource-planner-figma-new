## Context

See proposal.md (Why) for motivation and `specs/project-settings/spec.md` / `specs/project-access/spec.md` for the behavior contract.

`Project.createdById` already exists and is set on create, copy, import, and the first-ADMIN ownership migration. `GET /api/projects` includes `owner` only to emit `ownerName` and strips the relation; `createdBy` is never included, so the list has an id but no display name. Share already lives in `ShareDialog` and is opened only from the plan toolbar in `ResourcePlan.tsx`. List row actions today are Open, Copy, then role-gated Edit / Archive-or-Restore / Delete.

Create and copy responses are raw Prisma rows (no `ownerName` / `createdByName`). The list merges update results with `{...p, ...updated}`, so extra list fields on `p` survive if the update payload omits them.

## Goals / Non-Goals

**Goals:**

- Reuse the existing `ShareDialog` from the project list; pass the row's `myRole` so People and Client links stay role-gated.
- Expose `createdByName` on the list payload the same way `ownerName` is exposed, without leaking the `User` row.
- Keep Created by a display-only column (not a sort key) immediately after Last updated on every scope.

**Non-Goals:**

- New routes, Prisma fields, or request-schema keys.
- Changing Share dialog search, membership rules, or the plan-toolbar Share button.
- Making Owner and Created by the same column, or adding Created by to the plan header.

## Decisions

### 1. List DTO adds `createdByName` beside `ownerName`

In the three `GET /api/projects` scope branches, `include` both `owner` and `createdBy`, then map each row with a local helper:

```
{ ...project, ownerName, createdByName, myRole }
```

Strip `owner`, `createdBy`, and `members` so the JSON never contains email, group, or other `User` fields. `createdByName` is `createdBy.displayName ?? null`.

Create and copy also return `createdByName` (the caller) so a row appended to the in-memory list is not "—". Update does not need it: the existing `{...p, ...updated}` merge keeps `createdByName` from the listed row.

**Why:** Matches the `ownerName` pattern already on this endpoint. A second request per row would be wasteful and would leak more of `User`.

**Alternative considered:** Client-only `me.displayName` after create/copy. Rejected for GET — the catalog can include projects the caller did not create. Fine as a fallback, not as the source of truth. Also considered returning the nested `createdBy: { displayName }` object; a flat `createdByName` stays consistent with `ownerName`.

### 2. One `ShareDialog` instance, keyed by the chosen row

`ProjectList` holds `shareProject: Project | null`. Share sets it; the dialog's `open` / `onOpenChange` clear it. Render a single `ShareDialog` with `projectId={shareProject.id}` and `myRole={shareProject.myRole ?? 'VIEWER'}`. Do not change `ShareDialog.tsx`.

Button label is **Share** (list rows are already tight; the plan toolbar keeps **Share…**). Placement: after the Edit block, before the Archive/Restore block. VIEWER still gets the button (Copy, then Share).

**Why:** The dialog already encodes role gating. A second picker or a list-only modal would drift. One mounted dialog avoids fetching members for every row.

**Alternative considered:** Hide Share unless `canOwn`. Rejected — the plan toolbar shows Share to every member, and EDITOR still needs Client links. Also considered opening the plan and then the dialog; that is the status quo the proposal is replacing.

### 3. List tests mock `ShareDialog`; access tests assert the new field

`ProjectList.test.tsx` mocks `ShareDialog` as a dialog that prints `projectId` and `myRole` when open. That covers placement, VIEWER visibility, and that the list passes the row's role. `ShareDialog.test.tsx` stays the source of truth for People vs Client links. `access.integration.test.ts` extends the existing scope cases to expect `createdByName` (admin fixture display name on projects that fixture created).

**Why:** Re-testing People search from the list would duplicate `ShareDialog.test.tsx` and force extra API mocks on every list test.

**Alternative considered:** Render the real dialog from the list tests. Rejected — those tests would take a dependency on directory search and share-link endpoints for a placement change.

## Risks / Trade-offs

- [Owner and Created by are the same person on almost every row] → Mitigation: still show both when the Owner column is visible; Created by also appears on "My projects" where Owner is hidden. Not a bug.
- [Update merge could drop `createdByName` if a future handler starts spreading a `createdByName: undefined` key] → Mitigation: do not add the key on PUT; only GET / create / copy set it.
- [Mocked ShareDialog means a list regression that stops passing `myRole` still looks green if the mock ignores props] → Mitigation: the mock renders `myRole` into the dialog text; tests assert it.
- [Parallel in-flight deltas on `project-access` / `project-settings`] → Mitigation: this change ADDs requirements instead of rewriting the list or Sharing dialog requirement, so archive will not clobber `add-multi-user-access` or `search-azure-directory-on-share`.

## Migration Plan

No schema or deploy-order change. Ship server and SPA together (existing `npm run deploy`) so an old SPA ignoring `createdByName` still works and a new SPA against an old server shows "—" until the next deploy. Rollback is the previous image.

## Open Questions

None. Visibility, column placement, and payload shape are recorded in the proposal assumptions and the decisions above.

## Files

| File | Role |
|---|---|
| `server.ts` | Write: include `createdBy` on list (and create/copy); emit `createdByName`; strip the relation |
| `src/services/api.ts` | Write: `createdByName?: string \| null` on `Project` |
| `src/components/ProjectList.tsx` | Write: Created by column; Share button; mount `ShareDialog` |
| `src/components/ProjectList.test.tsx` | Write: column, em dash, button order, VIEWER Share, dialog open with `myRole` |
| `access.integration.test.ts` | Write: `createdByName` on mine / shared / all |
| `src/components/ShareDialog.tsx` | Read-only: reuse as-is |
| `src/components/ShareDialog.test.tsx` | Read-only: People / Client links stay covered here |
| `src/components/ResourcePlan.tsx` | Read-only: plan-toolbar Share unchanged |
| `prisma/schema.prisma` | Read-only: `createdById` already present |
| `server-validation.ts` | Read-only: no new request fields |
| `openspec/specs/project-settings/spec.md` | Read-only: do not edit the main spec |
| `openspec/changes/add-project-list-share-and-created-by/specs/*` | Write only if implementation forces a contract change |

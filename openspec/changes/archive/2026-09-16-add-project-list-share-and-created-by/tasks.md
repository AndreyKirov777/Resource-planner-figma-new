## 1. Server and list payload

- [x] 1.1 `server.ts`: include `createdBy` on `GET /api/projects` (mine / shared / all) and on create / copy; map `createdByName` from `createdBy.displayName` (null if missing); strip `owner`, `createdBy`, and `members` from the JSON. Verify via 1.2.
- [x] 1.2 `access.integration.test.ts`: existing mine / shared / all cases also expect `createdByName` (fixture display name of the creator; no nested `createdBy` object). Create and copy responses include `createdByName` of the caller. Verify `npx vitest run access.integration.test.ts`.
- [x] 1.3 `src/services/api.ts`: add `createdByName?: string | null` on `Project`. Verify `npm run typecheck`.

## 2. Project list UI

- [x] 2.1 `src/components/ProjectList.tsx`: Created by column immediately after Last updated (em dash when `createdByName` is missing); Share button after Edit and before Archive / Restore on every visible row; one `ShareDialog` opened from `shareProject` with that row's `projectId` and `myRole`. Verify via 2.2.
- [x] 2.2 `src/components/ProjectList.test.tsx`: mock `ShareDialog` so an open dialog prints `projectId` and `myRole`. Cover Created by after Last updated, display name, em dash, column present on "My projects", Share between Edit and Archive, Share before Restore, VIEWER sees Share, click Share opens the dialog with the row's role. Verify `npx vitest run src/components/ProjectList.test.tsx`.

## 3. Docs

- [x] 3.1 If implementation forces a contract change, edit only the deltas under `openspec/changes/add-project-list-share-and-created-by/specs/` (never `openspec/specs/` directly, never `docs/bmad-archive/`). Verify `openspec validate add-project-list-share-and-created-by --strict` passes.

## 4. Verification

- [x] 4.1 Focused tests: `npx vitest run access.integration.test.ts src/components/ProjectList.test.tsx` passes.
- [x] 4.2 `npm run typecheck` exits 0.

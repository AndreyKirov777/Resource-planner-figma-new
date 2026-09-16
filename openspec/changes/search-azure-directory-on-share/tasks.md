## 1. Server — directory search and provision

- [x] 1.1 `server-validation.ts` + `server-validation.test.ts`: add `directoryUsersQuerySchema` (`q` trimmed string, min 2 / max 100) and `memberCreateSchema` (`entraObjectId` non-empty string, `role` EDITOR|VIEWER only), both `.strict()`. Verify the tests reject `q` of one character, unknown keys, missing `entraObjectId`, and `role: 'OWNER'`.
- [x] 1.2 `server/auth/graph.ts` + `server/auth/graph.test.ts`: client-credentials token cache, `searchDirectoryUsers(q)` (`$search` + `ConsistencyLevel: eventual`, `$top=10`, drop hits with no mail/UPN), `directoryGroupIds(entraObjectId)` via `checkMemberGroups`. Verify mocked `fetch` covers token reuse before expiry, the `$search` URL, checkMemberGroups parsing, and a Graph error becoming a 502-class failure. `npx vitest run server/auth/graph.test.ts`.
- [x] 1.3 `server.ts`: `GET /api/projects/:id/directory-users?q=` (`requireProjectAccess` `own`; Entra → Graph, `AUTH_MODE=dev` → local `User` contains-filter; attach `userId` when `entraObjectId` matches a row; omit existing members). `POST /api/projects/:id/members` `{ entraObjectId, role }` (`own`; existing local user → member upsert; else Graph profile + `resolveGroup`; null group → 403 and no `User`; else upsert `User` then member; email unique clash → 409). Keep `PUT`/`DELETE` members and `GET /api/users`. Verify via 1.4.
- [x] 1.4 `access.integration.test.ts`: with fixtures, OWNER search `?q=dev` returns fixture users except current members; `q=x` → 400; EDITOR → 403; `POST /members` with `dev-user2` adds VIEWER; unknown `entraObjectId` → 404. Verify `npx vitest run access.integration.test.ts`.

## 2. Client — Share typeahead

- [x] 2.1 `src/services/api.ts`: `searchDirectoryUsers(projectId, q)` → `GET /projects/:id/directory-users?q=`; `addMember(projectId, entraObjectId, role)` → `POST /projects/:id/members`. Keep `getUsers` and `upsertMember`. Verify `npm run typecheck`.
- [x] 2.2 `src/components/ShareDialog.tsx` + `ShareDialog.test.tsx`: drop `getUsers`; debounce 300 ms; no request for fewer than two characters; results from `searchDirectoryUsers`; Add calls `addMember` with `entraObjectId`; empty copy "No matching people in the directory."; 403 message shown; EDITOR still has no People section. Verify `npx vitest run src/components/ShareDialog.test.tsx`.

## 3. Docs

- [x] 3.1 `README.md`: list `GET /api/projects/:id/directory-users` and `POST /api/projects/:id/members`. Verify `npx vitest run readme.test.ts`.
- [x] 3.2 `DEPLOYMENT.md`: Entra app-registration step for Microsoft Graph application permissions `User.Read.All` and `GroupMember.Read.All` plus admin consent. Verify the new step sits next to the existing groups-claim instructions.
- [x] 3.3 `.env.example`: comment that those Graph application permissions are required when `AUTH_MODE=entra` (no new variables). Verify the comment is next to the existing `ENTRA_*` block.
- [x] 3.4 If implementation forces a contract change, edit only `openspec/changes/search-azure-directory-on-share/specs/project-access/spec.md` (never `openspec/specs/` directly, never `docs/bmad-archive/`). Verify `openspec validate search-azure-directory-on-share --strict` passes.

## 4. Verification

- [ ] 4.1 Focused tests: `npx vitest run server/auth/graph.test.ts server-validation.test.ts access.integration.test.ts src/components/ShareDialog.test.tsx readme.test.ts` passes.
- [x] 4.2 `npm run typecheck` exits 0.

## Context

See proposal.md (Why) and the `project-access` delta for the behavior contract.

Verified current state (2026-09-15):

- Share People search loads every signed-in user via `GET /api/users` and filters in `ShareDialog` (`src/components/ShareDialog.tsx`). Empty state: "No matching user has signed in."
- `PUT /api/projects/:id/members/:userId` requires an existing `User.id`. Users are created only in `/auth/callback` (and the four `AUTH_MODE=dev` fixtures).
- `User.group` is required. `resolveGroup` in `server/auth/groups.ts` already encodes `ADMIN_EMAILS` + `ENTRA_GROUP_*` precedence; sign-in creates no row when it returns null.
- Entra OIDC uses `openid profile email` only. The previous multi-user design explicitly did not call Microsoft Graph and stored no access/refresh tokens.
- The Entra app already has `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and `ENTRA_CLIENT_SECRET`. `DEPLOYMENT.md` documents the registration but not Graph application permissions.
- `GET /api/users` is also the ADMIN Users page source (`UsersPage.tsx`); that page stays signed-in users only.
- `readme.test.ts` asserts every `app.<method>('/api…')` literal in `server.ts` appears in `README.md`.

## Goals / Non-Goals

**Goals:**

- One Graph helper (client-credentials token + search + group check). Handlers stay thin.
- Same Share UI and the same search endpoint in `AUTH_MODE=dev` (local `User` filter, no Graph) so existing integration tests stay offline.
- Provision a `User` only on Add, never on Search.
- Reuse `resolveGroup` for the access gate; do not fork group rules.

**Non-Goals:**

- New npm packages (`@microsoft/microsoft-graph-client`, MSAL).
- Photos, presence, or paging past 10 hits.
- Filtering search results to RP-group members (gate is on Add).
- Changing `GET /api/users` or the Users page.
- Schema / migration. `lastLoginAt` is already nullable.

## Decisions

### 1. Client-credentials Graph from the existing app registration

`server/auth/graph.ts` obtains an app token (`grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`) with `fetch`, caches it in memory until `expires_in - 60s`, and calls Graph. No user token, no refresh token, no new env vars.

Search (Entra mode):

```
GET https://graph.microsoft.com/v1.0/users
  ?$search="displayName:q" OR "mail:q" OR "userPrincipalName:q"
  &$select=id,displayName,mail,userPrincipalName
  &$top=10
ConsistencyLevel: eventual
```

`$search` matches substrings (typing "sad" finds "Sadakov"); `$filter=startswith` would miss that. Escape `"` and `\` in `q`. Drop results with neither `mail` nor `userPrincipalName`.

Group check on Add of a not-yet-local user: `POST /v1.0/users/{id}/checkMemberGroups` with the three `ENTRA_GROUP_*` ids, then `resolveGroup({ email, groups })`. Existing local users already have `User.group` — skip Graph.

**Why:** the secret is already on the server; delegated Graph would need a stored refresh token, which the last change forbade.

**Alternative:** `@microsoft/microsoft-graph-client`. Rejected — a token POST plus two REST calls is smaller than a SDK.

**Alternative:** search only members of the three groups (`/groups/{id}/members`). Rejected — three queries per keystroke and `ADMIN_EMAILS` would still be invisible.

### 2. Project-scoped search; provision on Add

- `GET /api/projects/:projectId/directory-users?q=` — `requireProjectAccess(own)`, so only OWNER/ADMIN can enumerate the tenant. `directoryUsersQuerySchema`: `q` string, trim, min 2 / max 100. Shorter → 400 (the dialog does not send those).
- Response: `{ entraObjectId, email, displayName, userId: number | null }[]`. `userId` is the local row when one exists (match `entraObjectId`). Exclude users already on the project.
- `POST /api/projects/:projectId/members` `{ entraObjectId, role }` (`memberCreateSchema`, `.strict()`). `own` access. If no local user: Graph profile + `resolveGroup`; null → 403 `{ error: 'This person does not have access to Resource Planner' }` and no `User` row; else `user.upsert` by `entraObjectId`, then the existing member upsert. If a local user exists, skip Graph and upsert the member (same as today's PUT).
- Keep `PUT /members/:userId` for role changes and `DELETE` for remove. Share Add always uses POST + `entraObjectId` so signed-in and never-signed-in share one path.

**Why project-scoped:** a global `/api/directory/users` would let any signed-in USER dump the tenant. Share is the only consumer.

**Alternative:** keep PUT-by-numeric-id and insert a provision endpoint. Rejected — two round-trips for one Add.

**Dev mode:** the same GET filters `prisma.user` by case-insensitive `displayName`/`email` contains, `$top` 10, no Graph. POST looks up `entraObjectId` locally (fixtures already exist); unknown id → 404. The "never signed in" path is covered by unit tests with a mocked Graph client.

### 3. ShareDialog typeahead, not prefetch

Drop `api.getUsers()` from Share. On query length ≥ 2, debounce 300 ms, `AbortController` the in-flight request, call `api.searchDirectoryUsers(projectId, q)`. Show displayName + email; Add sends `entraObjectId` + the selected role. Empty: "No matching people in the directory." Graph/server errors stay in the existing error strip. Role change / remove unchanged.

**Why:** prefetching Graph for the whole tenant is the bug we are deleting, just moved to Azure.

### 4. Ops: application permissions + admin consent, same secrets

Entra app registration (document in `DEPLOYMENT.md` and a comment in `.env.example`):

- Microsoft Graph **application** permissions: `User.Read.All`, `GroupMember.Read.All`
- Admin consent

No new environment variables. `AUTH_MODE=dev` never needs them.

## Risks / Trade-offs

- [Graph outage or missing admin consent → Share search 502] → Mitigation: dialog shows the error; members already on the project still list; role change/remove do not call Graph. Document consent as a deploy step.
- [`$search` requires `ConsistencyLevel: eventual` and can lag a few seconds on brand-new accounts] → Mitigation: accepted at company scale; owners retry. Dev mode is immediate (SQLite).
- [Application `User.Read.All` can read the whole tenant] → Mitigation: only OWNER/ADMIN of a project can call the endpoint; results capped at 10; query min length 2; no dump-all route.
- [Email unique collision: Graph mail matches a different local `entraObjectId`] → Mitigation: Prisma unique on `email`; return 409 and do not attach the wrong person.
- [Provisioned `User.group` can drift from Entra until next sign-in] → Mitigation: same as today after login (`resolveGroup` overwrites). Gate on Add uses live Graph membership.
- [Guest accounts without mail] → Mitigation: fall back to `userPrincipalName`; skip hits with neither.

## Migration Plan

1. Grant `User.Read.All` and `GroupMember.Read.All` (application) on the existing app registration and admin-consent. No Prisma migration.
2. Deploy. Dev/test (`AUTH_MODE=dev`) works without Graph.
3. Rollback: previous image. New routes 404; Share would break if the new client is still served — deploy server and SPA together (existing `npm run deploy`). Additive routes; old PUT members still works.

## Open Questions

None that change specs, approach, or tasks. Deferrable: whether to surface a "not in a planner group" hint on the search hit itself (would add one `checkMemberGroups` per result; keep the Add-time error for now).

## Files

| File | Role |
| --- | --- |
| `server/auth/graph.ts` | Write (new): client-credentials token cache, `searchDirectoryUsers(q)`, `directoryGroupIds(entraObjectId)`, OData escape |
| `server/auth/graph.test.ts` | Write (new): mocked `fetch` — token cache, `$search` query, empty/short q, checkMemberGroups parsing, 502 on Graph error |
| `server/auth/groups.ts` | Read-only: `resolveGroup` reused on Add |
| `server/auth/groups.test.ts` | Read-only |
| `server/auth/access.ts` | Read-only: `requireProjectAccess(..., 'own')` on the new routes |
| `server/auth/entra.ts` | Read-only: sign-in still creates/updates `User`; provisioned rows get `lastLoginAt` on first login |
| `server/auth/dev.ts` | Read-only: fixtures already have `entraObjectId` |
| `server.ts` | Write: `GET /api/projects/:id/directory-users`, `POST /api/projects/:id/members`; keep PUT/DELETE members and `GET /api/users` |
| `server-validation.ts` | Write: `directoryUsersQuerySchema` (`q`), `memberCreateSchema` (`entraObjectId`, `role`) |
| `server-validation.test.ts` | Write: reject short `q`, unknown keys, missing `entraObjectId`, OWNER role |
| `src/services/api.ts` | Write: `searchDirectoryUsers`, `addMember(projectId, entraObjectId, role)`; keep `getUsers` / `upsertMember` |
| `src/components/ShareDialog.tsx` | Write: debounced typeahead; Add via `addMember`; drop `getUsers` |
| `src/components/ShareDialog.test.tsx` | Write: no request under 2 chars; types → search results; Add calls `addMember` with `entraObjectId`; never-signed-in hit; 403 message; EDITOR still has no People section |
| `src/components/UsersPage.tsx` | Read-only: still `getUsers()` |
| `access.integration.test.ts` | Write: dev-mode directory search (fixtures, exclude members, EDITOR 403); POST members by fixture `entraObjectId`; unknown oid 404 |
| `auth.integration.test.ts` | Read-only |
| `readme.test.ts` | Read-only: passes once README lists the two new `/api` routes |
| `README.md` | Write: `GET /projects/:id/directory-users`, `POST /projects/:id/members` |
| `DEPLOYMENT.md` | Write: Graph application permissions + admin consent step |
| `.env.example` | Write: comment that Graph app permissions are required when `AUTH_MODE=entra` |
| `openspec/changes/search-azure-directory-on-share/specs/project-access/spec.md` | Write: only if implementation forces a wording change |
| `docs/bmad-archive/**` | Read-only: frozen |
| `src/generated/prisma` | Read-only: do not hand-edit |

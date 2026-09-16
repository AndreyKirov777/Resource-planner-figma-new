## Why

The Share dialog only searches people who have already signed in (`GET /api/users` plus a client-side filter). Colleagues who exist in the company Azure AD tenant but have never opened Resource Planner do not appear, so owners cannot share a project until the other person has logged in first.

## What Changes

- **Directory typeahead in Share.** As the owner types a name or email, the People search queries Microsoft Graph (the Entra tenant) and shows matching directory users — not only local `User` rows.
- **Add before first sign-in.** Picking a directory user who has no local account creates a `User` row (Entra object id, email, display name, resolved group) and then adds them as EDITOR or VIEWER. After they sign in they see the project under "Shared with me".
- **Access gate on add.** A directory hit that is not in `ENTRA_GROUP_ADMIN/MANAGER/USER` (and not in `ADMIN_EMAILS`) cannot be added; they would get the existing "no access" page on sign-in.
- **Dev mode.** `AUTH_MODE=dev` does not call Graph. Typing searches the local fixture users with the same endpoint and UI, so tests stay offline.
- **Users page unchanged.** The ADMIN Users tab still lists people who have signed in. `GET /api/users` remains for that page only; Share stops using it.

### Never

- Invite email, magic links, or any identity besides Entra OIDC / the existing dev fixtures.
- In-app editing of Entra group membership.
- Delegated Graph tokens, refresh tokens, or storing a user's Microsoft access token. Search uses the existing app registration with client credentials.
- Searching other tenants, or a public people-picker outside Share.
- Replacing the ADMIN Users page with a live Azure directory browser.
- Changing membership roles, OWNER/ADMIN share rights, or the USER visibility ceiling.

### Ask First

None that block planning. Assumptions recorded without asking:

- Search the whole single tenant (name / email / UPN), then refuse **add** when the person is not in an RP group. Results may include people who cannot be added; the error is shown on Add, not by hiding them from search (Graph group-filter on every keystroke is heavier and still misses `ADMIN_EMAILS`).
- Minimum two characters before a request; debounce on the client; at most 10 hits.
- Guest/external accounts with a mail or UPN are searchable; they still must pass the group / `ADMIN_EMAILS` gate to be added.
- `project-access` is the capability that already owns Share and the users list (delta in `add-multi-user-access`, not yet synced to `openspec/specs/`). This change modifies that capability rather than introducing a near-duplicate.

## Capabilities

### New Capabilities

- None. Directory search is part of project sharing, not a new product surface.

### Modified Capabilities

- `project-access`: Share search becomes a live Entra directory typeahead; members can be added before first sign-in; "users who never signed in are not offered" is reversed; `GET /api/users` is no longer the Share search source.

## Impact

- **Server:** new `GET /api/directory/users?q=` (OWNER/ADMIN on a project, or any signed-in caller with `own` on the project they are sharing — same people who see People today); member add accepts an Entra object id and provisions a `User` if needed; Graph client-credentials helper (token cache, `$filter` search, group check).
- **Client:** `ShareDialog` typeahead calls the new API through `src/services/api.ts`; stops prefetching `GET /api/users`.
- **Validation:** new strict Zod query / body schemas in `server-validation.ts`.
- **Ops:** Entra app registration needs Microsoft Graph application permissions (`User.Read.All`, `GroupMember.Read.All`); document in `.env.example` / `DEPLOYMENT.md`. Same `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` — no new secrets.
- **Dependencies:** none. Graph is `fetch` + the existing client secret.
- **Tests:** ShareDialog typeahead; directory search + provision integration (mocked Graph in entra mode, local filter in dev mode).

## Why

The Resource Planner is a single-user tool: `server.ts` mounts `cors()` wide open, every `/api` route is public, and the only "privacy" is the Client View hiding internal rates in the browser after fetching the full project. The company now needs several planners working in one instance, with their own projects, explicit sharing, and a User group that must never receive internal cost figures from the API.

## What Changes

- **Identity (Entra ID OIDC).** Sign-in via Microsoft Entra ID, single tenant, authorization-code flow with PKCE and a client secret, handled server-side with `openid-client`. New `User` and `Session` models; httpOnly `SameSite=Lax` session cookie, sliding 12 h / absolute 30 d expiry, `lastSeenAt` touched at most once per 5 minutes. Users are created on first sign-in only. `GET /api/me`; every other `/api` route returns 401 without a session and the SPA redirects to `/auth/login`. `AUTH_MODE=dev` offers a fixture sign-in page (admin, manager, user, user2) and is refused when `NODE_ENV=production`.
- **Groups.** `User.group` is `ADMIN | MANAGER | USER`, resolved on every sign-in from the ID token `groups` claim via `ENTRA_GROUP_ADMIN/MANAGER/USER` (precedence ADMIN > MANAGER > USER), plus `ADMIN_EMAILS` bootstrap. Someone in none of the three gets a "no access" page and no `User` row. Membership is managed in Entra only.
- **Project ownership and sharing.** `Project.ownerId/createdById/updatedById`; new `ProjectMember` (`OWNER | EDITOR | VIEWER`, unique per user+project). Creator, copier, and importer become OWNER. ADMIN bypasses membership. A Share dialog lets OWNER/ADMIN add, change, and remove members. Project list gains "My projects", "Shared with me", and (ADMIN) "All projects". Every project-scoped route resolves the project from the path or the edited row, never from the body, and answers 404 for projects the caller cannot see. `initializeDefaultProject()` auto-seeding is removed. Existing ownerless projects are assigned to the first ADMIN who signs in. Archived projects remain shareable and openable but are read-only for everyone except OWNER/ADMIN.
- **USER visibility ceiling (server-side).** For USER callers every response omits `ResourceList.intRate`, `ResourcePlan.intHourlyRate`, `Project.defaultMargin`, `Project.exchangeRate`, the nine `GlobalRateCard` regional rate columns, and any computed internal cost or margin; write bodies from USER ignore those fields. The UI hides the matching columns, totals, Columns-menu entries, and the Rate Card rate columns; Excel and PNG exports for USER contain no internal columns at all.
- **Rate card by group.** ADMIN: read, edit rows, import, clear. MANAGER: read with rates, no writes. USER: catalog only (role, namingInPM, discipline, description); all writes 403. Price is computed server-side per region for ADMIN/MANAGER and omitted for USER.
- **Server-side rate derivation.** `POST /api/projects/:projectId/resource-lists/from-rate-card` and `POST /api/projects/:projectId/resource-plans/from-resource-list` copy rows and compute client rates on the server with the existing `clientHourlyRate()` helper. `RateCard.tsx` and `ResourcePlan.tsx` stop computing these values in the browser.
- **AI generation.** Rate limit keyed by user id. USER callers get 403 and do not see the Generate button (decided: USER-applied drafts would otherwise lose internal rates).
- **BREAKING: Client View becomes an expiring share link.** New `ShareLink` model; `/client/:token` replaces `/client/:projectId`; public `GET /api/share/:token` returns a server-filtered client-safe payload; expired/revoked → 404 and "This link is no longer valid". OWNER/EDITOR/ADMIN create 7/30/90-day links from the plan page, list and revoke them. The unauthenticated `GET /api/projects/:id` path used by Client View is gone.
- **Conflict detection.** `version` on `Project`, `ResourceList`, `ResourcePlan`; updates carry the client's version, conditional update, 409 with `{updatedBy, updatedAt}` on mismatch; UI offers to reload.
- **BREAKING: transport hardening.** `cors()` removed (same-origin SPA); secure cookies behind HTTPS (`TRUST_PROXY`, `COOKIE_SECURE`); `DATABASE_URL` gets `?connection_limit=1`; `PRAGMA journal_mode=WAL` at startup; public `GET /api/health` for the Docker healthcheck; Vite dev proxy also forwards `/auth`. Users page (read-only list) for ADMIN. New env vars documented in `.env.example`, `docker-compose.yml`, `DEPLOYMENT.md`, plus the HTTPS reverse-proxy prerequisite and a daily `sqlite3 .backup` cron.

### Never

- Any authentication other than Entra OIDC and the dev fixture mode (no passwords, no magic links).
- In-app group assignment or editing of Entra group membership; admin "view as another group" impersonation.
- Real-time collaboration, WebSockets, CRDTs.
- Versioning of WBS and Roadmap rows.
- Migrating to Postgres.
- Changing the money formulas in `src/utils/calculations.ts`.
- Editing `node_modules` or the generated Prisma client by hand; bumping export `schemaVersion` unless a field is removed from the export payload (it is not: USER exports omit keys; ADMIN/MANAGER exports are unchanged).

### Ask First

All four were asked and answered on 2026-09-14; they are decisions, not open questions:

- USER may export a project as JSON; internal fields are omitted and a re-import of such a file stores `intRate`/`intHourlyRate` as `0`. USER Excel/PNG exports contain no internal columns at all (not zeros).
- Session lifetime: 12 h sliding, 30 d absolute.
- ARCHIVED projects remain shareable; read-only for everyone except OWNER/ADMIN.
- USER cannot use AI plan generation (403 + hidden button).

Assumptions recorded without asking (minor):

- `GET /api/users` (id, email, displayName, group, isActive) is readable by any signed-in user because the Share dialog must search users; only the Users *page* is ADMIN-only.
- Between Phase 1 and Phase 4 the Client View requires sign-in (no public path exists until share links ship).
- Group values are Prisma enums (SQLite enum support since Prisma 6.2; project is on 6.15).

## Capabilities

### New Capabilities

- `authentication`: Entra OIDC sign-in, server-side sessions and cookie policy, group resolution and ADMIN_EMAILS bootstrap, `/api/me`, 401 handling, logout, dev fixture mode.
- `project-access`: ownership on create/copy/import, membership roles and what each may do, ADMIN bypass, USER visibility ceiling, sharing dialog, project list scopes, path-based project resolution with 404 for invisible projects, archived read-only rule, ownership migration, users list, optimistic-version conflict detection.
- `share-links`: expiring, revocable public tokens for the client-safe plan payload and the `/client/:token` page.

### Modified Capabilities

- `rate-card`: group-dependent read/write; USER catalog mode; Price computed server-side and omitted for USER.
- `resource-list`: seeding from the rate card happens through a server endpoint; USER never receives or sees Hourly cost/Margin; manual Hourly cost entry for ADMIN/MANAGER only.
- `resource-plan`: applying a list entry goes through a server endpoint; internal columns/totals hidden and never offered to USER; version-checked row updates with 409 handling; client link scenario replaced by share links.
- `client-view`: reached by share token instead of project id; payload is server-filtered; invalid links show a message.
- `export-import`: USER JSON export omits internal fields and imports with zeros; import/copy are owned by the caller; USER Excel export has no internal columns.
- `ai-plan-generation`: rate limit per user id; USER gets 403 and no button.
- `project-settings`: creator is owner; no auto-seeded default project; delete is OWNER/ADMIN; project list scopes.

## Impact

- **Data:** `prisma/schema.prisma` + one migration: `User`, `Session`, `ProjectMember`, `ShareLink`; `Project.ownerId/createdById/updatedById/version`; `ResourceList.version/updatedById`; `ResourcePlan.version/updatedById`.
- **Dependency:** `openid-client` (new). No passport, no express-session, no cookie-parser (cookie read is a one-line parse; `res.cookie` already exists).
- **Server:** `server.ts` (auth mount, `requireAuth`, project resolution on all 47 `/api` routes, 9 new routes, USER response/body filtering, version checks, WAL pragma, health), new `server/auth/*` modules, `server-validation.ts` schemas.
- **Client:** `src/main.tsx` (auth gate, `/client/:token`), `src/services/api.ts` (401 redirect, new wrappers, `version`), `App.tsx`, `ProjectList`, `RateCard`, `ResourceList`, `ResourcePlan`, `ClientView`, `planningColumns.ts`, new `ShareDialog` and `UsersPage`.
- **Ops/docs:** `.env.example`, `docker-compose.yml` (env, healthcheck), `Dockerfile` (sqlite3 for backups), `DEPLOYMENT.md`, `README.md` endpoint list, `vite.config.mts` proxy.
- **Tests:** three existing integration files switch to a logged-in supertest agent; new auth/access integration tests; component tests for hidden columns, scopes, share dialog, and the token client view.

## Context

See proposal.md (Why) and the delta specs under `specs/` for the behavior contract.

Verified current state (2026-09-14, branch `feat/multi-user-access`):

- `server.ts` (1847 lines) mounts `cors()` and `express.json()`, serves `build/`, and declares 47 `/api` routes plus the SPA catch-all. No auth anywhere. `initializeDefaultProject()` seeds a project at boot and is exported for tests.
- Prisma 6.15 on SQLite; migrations under `prisma/migrations`; Docker `CMD npx prisma migrate deploy && npm run server`. Prisma supports enums on SQLite since 6.2.
- Client View at `/client/:projectId` (`src/main.tsx`) calls `api.getProject(id)` and receives `exchangeRate`, `defaultMargin`, nested `intHourlyRate`; it only hides them.
- Client rates are derived in the browser: `resourceFromRateCard()` in `RateCard.tsx` and `applyResourceListEntry()` in `ResourcePlan.tsx`, both via `clientHourlyRate()` from `src/utils/calculations.ts`. `App.tsx` `handleExportToExcel`/`handleExportToPNG` build the workbook and PNG from `buildPlanFinancials()` and hard-code internal columns.
- `generate-plan` rate-limits per `req.ip` with an in-memory map.
- `readme.test.ts` parses `app.<method>('/api…')` literals from `server.ts`; `/auth/*` routes in a mounted router are invisible to it (intended).
- Vite dev proxy forwards only `/api`; `docker-compose.yml` healthcheck hits `/api/projects`.
- Integration tests call `request(app)` per call and `initializeDefaultProject()` in `beforeAll`.
- Dockerfile copies `server/`, `src/utils`, `src/config` into the production image, so new server modules under `server/auth/` and server-side use of `calculations.ts` need no Dockerfile change beyond `sqlite` for backups.

## Goals / Non-Goals

**Goals:**

- One place that authenticates, one place that resolves project access, one place that strips internal figures. Handlers call small helpers; no per-route reimplementation.
- Zero new client-side money math; the two derivations move to the server and call the existing helper.
- Existing tests keep passing with a mechanical change (a logged-in supertest agent).
- Each of the four phases deploys on its own.

**Non-Goals:**

- Refresh tokens, access tokens, or calling Microsoft Graph. Only the ID token is used, once, at sign-in.
- Group overage handling (`hasgroups` / >200 groups) — documented as a risk.
- Row-level permissions below project level.
- Audit log beyond `createdById`/`updatedById`.

## Decisions

### 1. `openid-client` v6 directly; no passport, express-session, or cookie-parser

`server/auth/entra.ts` uses `discovery(new URL("https://login.microsoftonline.com/<tenant>/v2.0"), clientId, clientSecret)`, `buildAuthorizationUrl` with PKCE (`randomPKCECodeVerifier`/`calculatePKCECodeChallenge`), `randomState`, `randomNonce`, then `authorizationCodeGrant(config, currentUrl, {pkceCodeVerifier, expectedState, expectedNonce})` and `tokens.claims()` for `oid`, `email`/`preferred_username`, `name`, `groups`. The PKCE verifier, state, nonce, and `returnTo` travel in one short-lived httpOnly cookie signed with HMAC(`SESSION_SECRET`). Logout redirects to `buildEndSessionUrl(config, {post_logout_redirect_uri})`.

Cookie reading is `Object.fromEntries(header.split(';').map(...))`; writing uses Express's built-in `res.cookie`.

**Why:** three new dependencies for what is ~150 lines. `openid-client` does the protocol correctly (PKCE, nonce, issuer checks); nothing else is protocol.

**Alternative:** `express-openid-connect` (Auth0). Rejected — pulls express-session semantics and its own cookie format; group mapping and dev mode would fight it.

### 2. Session table with opaque id, sliding + absolute expiry, 5-minute touch

```prisma
model Session { id String @id; userId Int; createdAt DateTime @default(now()); lastSeenAt DateTime; expiresAt DateTime; user User @relation(...) }
```

`id` is `randomBytes(32).toString('base64url')`. `expiresAt = min(lastSeenAt + 12h, createdAt + 30d)`. `requireAuth` loads session+user in one query; if `now > expiresAt` → delete + 401; if `now - lastSeenAt > 5min` → update `lastSeenAt` and `expiresAt` (fire-and-forget). Expired rows are pruned opportunistically on each login (`deleteMany({expiresAt < now})`).

**Why:** absolute + sliding in one column keeps the hot path a single read. Throttled touch keeps SQLite writes rare under `connection_limit=1`.

**Alternative:** signed stateless cookie. Rejected — logout and group re-evaluation need server-side revocation.

### 3. Group resolution is a pure function

`server/auth/groups.ts`: `resolveGroup(claims, env): 'ADMIN'|'MANAGER'|'USER'|null`. ADMIN_EMAILS (case-insensitive) → ADMIN; else first match in `[ADMIN, MANAGER, USER]` group ids against `claims.groups`; else `null` → no-access page (`/auth/no-access`, server-rendered HTML, no User row). Stored on `User.group` (Prisma `enum UserGroup { ADMIN MANAGER USER }`) on every login. After a login that yields ADMIN, run the ownership migration (`project.findMany({ownerId: null})` → set `ownerId/createdById` and create OWNER member rows) — idempotent, cheap, happens exactly when the first admin exists.

### 4. Dev mode is the same session path with fixture users

`AUTH_MODE=dev`: `GET /auth/login` renders a static HTML form with four buttons; `POST /auth/dev-login {user}` upserts the fixture (`entraObjectId: 'dev-<name>'`, `@example.test` emails, groups admin/manager/user/user) and calls the same `createSession()`. Refused at module load when `NODE_ENV === 'production'`. Tests set `AUTH_MODE=dev` in `isolateTestDb`'s env and use `request.agent(app)` + `agent.post('/auth/dev-login')` so cookies persist; a helper `loginAs(app, 'admin')` in `testDb.ts` returns the agent.

**Why:** all middleware runs unchanged, so tests cover the real 401/403/404 paths. Entra is never contacted in tests.

### 5. Access resolution: one helper, called at the top of each project-scoped handler

`server/auth/access.ts`:

```ts
type Need = 'read' | 'write' | 'own';
async function requireProjectAccess(req, projectId: number, need: Need): Promise<Access>  // throws AccessError(404|403)
async function projectIdOf(kind: 'resourceList'|'resourcePlan'|'allocation'|'wbsItem'|'roadmapLane'|'roadmapItem', id: number): Promise<number | null>
```

`Access = { role: 'ADMIN'|'OWNER'|'EDITOR'|'VIEWER', archived: boolean }`. Rules: no membership and not ADMIN → 404; `write` needs EDITOR+ and (not archived or OWNER/ADMIN) else 403; `own` needs OWNER/ADMIN else 403. Row-scoped routes call `projectIdOf` first (null → 404). Routes whose body references other rows (`orderedIds`, `laneId`, `wbsItemIds`, `roadmapItemId`) verify those rows' `projectId` equals the resolved project (400 otherwise); the roadmap routes already do this for lanes/links, reorder does not.

`ADMIN` is an `Access.role`, not a membership row, so `ownerId` and `ProjectMember` stay clean. `Project.ownerId` is authoritative for OWNER; a `ProjectMember` row with role OWNER is written alongside it on create/copy/import/migration so `GET members` is one query. `PUT members` refuses to set OWNER (ownership transfer is out of scope); `DELETE members/:userId` refuses the owner.

**Why:** ids come from three different places (path project id, path row id, body), so a route-table middleware would need the same switch. A helper with a `try/catch` around `AccessError` is the smallest honest diff across 47 handlers.

**Alternative:** Prisma client extension filtering every query by membership. Rejected — hides 404-vs-403 semantics and doesn't cover row-scoped routes.

### 6. USER filtering is one middleware wrapping `res.json` and `req.body`

`server/auth/visibility.ts`: `INTERNAL_KEYS = ['intRate','intHourlyRate','defaultMargin','exchangeRate','ukraine','easternEurope','asiaGE','asiaARMKZ','latam','mexico','india','newYork','london']`, `omitDeep(value)` recursing arrays/objects. After `requireAuth`, for `group === 'USER'`: `req.body = omitDeep(req.body)` and `res.json = (b) => original(omitDeep(b))`. Applies to project GET (nested lists), lists, plans, export JSON, drafts (moot: USER is refused), rate-card rows, and any future route.

`GET /api/rate-cards?projectId=N` adds `price: Record<region, number>` per row only when `group !== 'USER'` (nine `clientHourlyRate()` calls per row on the server). `RateCard.tsx` reads `row.price[activeRegion]`; refetch on project change only.

**Why:** field-level stripping must be impossible to forget. Key names are unambiguous across the API (checked: `GET /api/exchange-rates` returns `rates`, not `exchangeRate`). Ponytail: one function, zero per-handler edits.

**Trade-off:** strings inside error `details` that mention a key are left alone (harmless).

### 7. Two derivation endpoints reuse `clientHourlyRate()` server-side

- `POST /api/projects/:projectId/resource-lists/from-rate-card {rateCardId, region}` → copies role/namingInPM→clientRole/description, `location` = region label (`regionToLocationLabel` in `src/utils/regions.ts`), `intRate` = row[region], `hourlyRate = clientHourlyRate(intRate, (defaultMargin ?? APP_DEFAULTS.defaultMargin)/100, exchangeRate)`.
- `POST /api/projects/:projectId/resource-plans/from-resource-list {resourceListId, allocations?}` → copies role/clientRole/name, `intHourlyRate = intRate`, `clientHourlyRate = hourlyRate > 0 ? hourlyRate : clientHourlyRate(intRate, (defaultMargin || 25)/100, exchangeRate)` (the `25` fallback is the existing behaviour in `applyResourceListEntry`, kept verbatim), `displayOrder` = next.
- Applying a list entry to an *existing* row (role picker on an existing row, typed role match) becomes `PUT /api/resource-plans/:id {role, resourceListId, version}`: when `resourceListId` is present the server copies rates from that entry the same way. `resourceFromRateCard()` and `applyResourceListEntry()` are deleted from the components.

**Why:** USER holds no `intRate`; the copy must happen where the number is. Keeping the formula in `calculations.ts` (already imported by the server and shipped in the image) is the decided single source.

### 8. Share links replace the Client View route

`ShareLink { id, token @unique, projectId, expiresAt, createdById, createdAt, revokedAt? }`, `token = randomBytes(32).toString('base64url')`. Routes: `POST /api/projects/:id/share-links {days: 7|30|90}` (write access), `GET /api/projects/:id/share-links` (read access), `DELETE /api/share-links/:id` (sets `revokedAt`; write access on the link's project), public `GET /api/share/:token` (404 when missing/expired/revoked). The public payload is built explicitly (allow-list) rather than via `omitDeep`, so any future field is private by default; `investment` is a client-facing discount and stays. `ClientView.tsx` calls `api.getShare(token)`; `buildPlanFinancials` receives `exchangeRate = 1` and rows with `intHourlyRate = 0`, so cost/margin are meaningless and remain unrendered as today. `main.tsx` route becomes `/client/:token`. The "Copy client link" button in `ResourcePlan.tsx` becomes "Share…" opening `ShareDialog`.

### 9. Optimistic version on three tables, opt-in from the client

`version Int @default(0)` and `updatedById Int?` on `Project`, `ResourceList`, `ResourcePlan`. Update schemas gain `version: z.number().int().optional()`. When present: `updateMany({where: {id, version}, data: {..., version: {increment: 1}, updatedById}})`; `count === 0` → load row (404 if gone) → 409 `{error: 'Conflict', updatedBy: displayName, updatedAt, version}`. `ResourcePlan` PUT does this inside the existing `$transaction` with allocations. `api.ts` throws `ConflictError` (class with `updatedBy`, `updatedAt`); `App.tsx` catches it in the three update handlers, `window.confirm`s the message, and calls `loadProjectData(currentProject.id)`. Rows carry `version` in the `Project`/`ResourceList`/`ResourcePlan` types, and the update payload whitelists pass it through.

**Why optional:** WBS/roadmap tests and third-party scripts keep working; the UI always sends it.

### 10. One `ShareDialog` for members and links

`src/components/ShareDialog.tsx` (Radix `Dialog` from `ui/`): "People" section (OWNER/ADMIN: user search via `GET /api/users`, role select, remove) and "Client links" section (write access: create 7/30/90, list, copy, revoke). Opened from the plan toolbar. Users page is `src/components/UsersPage.tsx`, a plain `ui/table` behind a tab rendered only when `me.group === 'ADMIN'`.

### 11. Identity reaches components as props

`main.tsx` fetches `/api/me` before rendering; on 401 it navigates to `/auth/login?returnTo=…` (the `/client/:token` route skips the gate). `App` receives `me` and threads `group` (and per-project `access`, returned on `GET /api/projects/:id`) to `ProjectList`, `RateCard`, `ResourceList`, `ResourcePlan`, `Wbs`, `Roadmap` as `group` / `canEdit` props. `apiFetch` in `api.ts` performs the same redirect on any 401 after boot. A header strip shows `displayName`, group, and a Sign out form (`POST /auth/logout`).

**Why props:** matches the "no Context for domain data" convention; six consumers is manageable. `canEdit` = `access !== 'VIEWER' && (status !== 'archived' || access in OWNER/ADMIN)`; each grid sets `editable: false` / drops `onCellEdited` and hides add/delete/reorder controls when false.

### 12. Column hiding for USER is a filter on `planningColumns.ts`

`LEAD_COLUMNS` entries gain `internal?: true` on `intHourly`, `intDaily`, `margin`; `getVisibleLeadColumns(hidden, group)` and `COLUMN_MENU_SECTIONS` drop internal ids for USER; `TOTAL_COLUMNS` index 0 (Cost) is dropped for USER. `ResourcePlan.tsx` settings card omits Default Margin, Total Internal Cost, Calculated Project Margin for USER. `App.tsx` Excel/PNG builders take `includeInternal: boolean` and skip those columns/rows entirely (the two column arrays and the summary rows are already literal lists; they become conditional). `ResourceList.tsx` drops the `intRate`/`margin` columns, the Hourly cost input, and the average-rate card for USER. `RateCard.tsx` for USER shows only the four catalog columns and no region tabs/Default Margin/Price; for MANAGER shows rates + Price but no edit/import/clear/add controls and `editable: false`.

### 13. Transport and SQLite

- Remove `cors` import and `app.use(cors())`; drop `cors`/`@types/cors` from `package.json`.
- `app.set('trust proxy', 1)` when `TRUST_PROXY=1`; cookie `secure` = `COOKIE_SECURE === 'true'` (default `true` in production, `false` otherwise).
- `server.ts` fallback `DATABASE_URL` and `.env.example` / `docker-compose.yml` append `?connection_limit=1`; at startup `await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')` and `busy_timeout=5000`.
- `GET /api/health` → `{ok: true}` public; compose healthcheck targets it.
- `vite.config.mts` proxy adds `'/auth': { target: 'http://localhost:3001', changeOrigin: true }`.
- Dockerfile production stage: `RUN apk add --no-cache sqlite` so the documented backup is `docker compose exec -T app sqlite3 /app/data/dev.db ".backup /app/data/backup-$(date +%F).db"`.
- CSRF: `SameSite=Lax` + same origin + JSON bodies; no token. Documented.

### 14. AI rate limit keyed by user id

`rateLimitStore` key becomes `String(req.user.id)`; `group === 'USER'` → 403 before the rate-card check. `mode: 'current'` also runs `requireProjectAccess(projectId, 'read')`.

## Risks / Trade-offs

- [Between Phase 1 and Phase 4 the Client View needs a signed-in session] → Mitigation: documented in the proposal; external clients get links again in Phase 4. Deploy phases 1-4 in one release if that gap is unacceptable.
- [Entra `groups` claim overage (>200 groups) emits no `groups`] → Mitigation: `ADMIN_EMAILS` bootstrap still works; document that the app registration must emit *security groups assigned to the application* (small set) rather than all groups.
- [`omitDeep` strips a legitimately-named key on some future route] → Mitigation: key list is explicit and short; `visibility.test.ts` pins the list; new keys must be checked against it.
- [`updateMany` with `version` on SQLite under `connection_limit=1`] → Mitigation: single statement, atomic; WAL + busy_timeout cover concurrent writers.
- [Existing integration tests hit 401 everywhere] → Mitigation: `loginAs()` agent helper; three files change `request(app)` → `agent` mechanically.
- [`initializeDefaultProject` removal breaks `App.tsx` boot path that creates a default project client-side] → Mitigation: `loadProjectData` shows the list on empty instead of `api.createProject`.
- [Session cookie shared across `localhost:5173` and `:3001` in dev] → Accepted: cookies ignore ports; that is what makes the Vite proxy flow work.
- [USER-imported files carry zero internal rates] → Accepted (decided). ADMIN/MANAGER see 0 cost and can re-apply list entries.

## Migration Plan

1. `npx prisma migrate dev --name add_multi_user_access` (User, Session, ProjectMember, ShareLink, new Project/ResourceList/ResourcePlan columns, enums). All new columns nullable or defaulted; existing rows untouched. Run `npx prisma generate`.
2. Configure the Entra app registration: redirect URIs `https://<host>/auth/callback` and `http://localhost:3001/auth/callback`, client secret, `groups` claim (security groups), three groups created. Put the VM behind Caddy/nginx with HTTPS first.
3. Fill `.env` on the VM (`ENTRA_*`, `ADMIN_EMAILS`, `SESSION_SECRET`, `AUTH_MODE=entra`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`, `DATABASE_URL=file:/app/data/dev.db?connection_limit=1`).
4. Deploy (`npm run deploy` runs `migrate deploy`). First ADMIN signs in → ownership migration assigns legacy projects.
5. Rollback: previous image + `prisma migrate resolve --rolled-back`; new tables are additive so the old server ignores them. Old `/client/:projectId` links are dead after Phase 4 by design.

## Open Questions

None that change specs or tasks. Deferrable: whether to prune expired sessions on a timer instead of at login (login-time pruning is enough at company scale).

## Files

| File | Role |
| --- | --- |
| `package.json` | Write: add `openid-client`; remove `cors`, `@types/cors` |
| `prisma/schema.prisma` | Write: `User`, `Session`, `ProjectMember`, `ShareLink`, enums `UserGroup`/`MemberRole`; `Project.ownerId/createdById/updatedById/version`; `ResourceList.version/updatedById`; `ResourcePlan.version/updatedById` |
| `prisma/migrations/<ts>_add_multi_user_access/migration.sql` | Write: generated by `migrate dev` |
| `server/auth/entra.ts` | Write (new): discovery, `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/no-access` router; signed state cookie |
| `server/auth/session.ts` | Write (new): cookie parse/set/clear, `createSession`, `requireAuth`, touch throttle, prune |
| `server/auth/groups.ts` | Write (new): `resolveGroup(claims, env)`; `ownershipMigration(prisma, adminUserId)` |
| `server/auth/groups.test.ts` | Write (new): precedence, ADMIN_EMAILS, null result |
| `server/auth/dev.ts` | Write (new): fixture users, sign-in page, `POST /auth/dev-login`, production guard |
| `server/auth/access.ts` | Write (new): `requireProjectAccess`, `projectIdOf`, `AccessError` |
| `server/auth/visibility.ts` | Write (new): `INTERNAL_KEYS`, `omitDeep`, `userFilterMiddleware` |
| `server/auth/visibility.test.ts` | Write (new): nested strip, arrays, untouched keys |
| `server.ts` | Write: remove cors + `initializeDefaultProject`; mount auth router, `requireAuth`, filter middleware; access checks on all 47 routes; new routes (`/api/health`, `/api/me`, `/api/users`, members ×3, share-links ×3, `/api/share/:token`, `from-rate-card`, `from-resource-list`); `?scope=`; rate-card `price`; version checks; per-user rate limit; USER 403 on generate-plan; WAL pragma; trust proxy |
| `server-validation.ts` | Write: `memberUpsertSchema`, `shareLinkCreateSchema`, `fromRateCardSchema`, `fromResourceListSchema`, `devLoginSchema`; `version` on project/list/plan update; `resourceListId` on plan update |
| `server-validation.test.ts` | Write: new schemas accept/reject; `version` accepted |
| `testDb.ts` | Write: set `AUTH_MODE=dev`; export `loginAs(app, fixture)` returning a supertest agent |
| `api.integration.test.ts` | Write: agent login; drop `initializeDefaultProject`; ownership on create/copy/import; export stripping for USER |
| `wbs.integration.test.ts` | Write: agent login; drop `initializeDefaultProject` |
| `roadmap.integration.test.ts` | Write: agent login; reorder cross-project 400 |
| `auth.integration.test.ts` | Write (new): 401 without cookie, dev login, `/api/me`, logout, expiry, health public |
| `access.integration.test.ts` | Write (new): 404 cross-project, VIEWER 403, EDITOR cannot share, ADMIN bypass, scopes, archived read-only, USER field stripping + body ignore, from-rate-card/from-resource-list, share-link lifecycle, 409 versions, rate-card 403 by group, generate-plan 403 for USER |
| `readme.test.ts` | Read-only: still passes once README lists the new `/api` routes |
| `globalSetup.ts` | Read-only: unchanged (test.db seeding) |
| `src/test/setup.ts` | Write: `process.env.AUTH_MODE = 'dev'` |
| `vite.config.mts` | Write: proxy `/auth` |
| `src/services/api.ts` | Write: `getMe`, `getUsers`, members, share links, `getShare(token)`, `fromRateCard`, `fromResourceList`, `getProjects(scope)`, `getRateCards(projectId)`; `ConflictError`; 401 redirect in `apiFetch`; `version`/`access`/`price`/`ownerId` on types; `version` + `resourceListId` in payload whitelists |
| `src/utils/apiErrors.ts` | Write: `ConflictError` class + `isConflict` |
| `src/main.tsx` | Write: auth gate around `App`; route `/client/:token` |
| `src/App.tsx` | Write: `me` prop; header with name/group/Sign out; Users tab for ADMIN; no default-project creation; thread `group`/`canEdit`; catch `ConflictError` → confirm + reload; Excel/PNG `includeInternal`; apply from-rate-card / from-resource-list wrappers |
| `src/App.test.tsx` | Write: `me` fixture; USER Excel/PNG omit internal columns; empty state |
| `src/App.wbs.test.tsx` | Write: `me` fixture |
| `src/components/ProjectList.tsx` | Write: scope selector; owner column; hide delete/share for non-owners |
| `src/components/ProjectList.test.tsx` | Write: scopes, ADMIN-only "All projects", owner name |
| `src/components/RateCard.tsx` | Write: delete `resourceFromRateCard`; `price` from API; group modes (catalog / read-only / full); add-to-list calls `onSeedFromRateCard(rateCardId, region)` |
| `src/components/RateCard.test.tsx` | Write: USER catalog columns only; MANAGER no write controls |
| `src/components/ResourceList.tsx` | Write: `group`/`canEdit` props; hide cost/margin/input/average for USER |
| `src/components/ResourceList.test.tsx` | Write: hidden columns for USER |
| `src/components/ResourcePlan.tsx` | Write: delete `applyResourceListEntry`; picker/typed-match call `onApplyListEntry(planId|null, resourceListId)`; hide internal totals/controls for USER; no Generate button for USER; Share… button; `canEdit` gating; `version` on writes |
| `src/components/ResourcePlan.test.tsx` | Write: internal columns absent for USER; Generate hidden; Share button |
| `src/components/planningColumns.ts` | Write: `internal` flag; group-aware `getVisibleLeadColumns` and menu sections; `TOTAL_COLUMNS` for group |
| `src/components/planningColumns.test.ts` | Write: USER never sees internal ids even from storage |
| `src/components/ShareDialog.tsx` | Write (new): members + client links |
| `src/components/ShareDialog.test.tsx` | Write (new): search/add/remove; link create/revoke; VIEWER sees none |
| `src/components/UsersPage.tsx` | Write (new): read-only table |
| `src/components/ClientView.tsx` | Write: `useParams().token`; `api.getShare`; invalid-link message |
| `src/components/ClientView.test.tsx` | Write: token route; 404 → message |
| `src/components/Wbs.tsx`, `src/components/roadmap/Roadmap.tsx` | Write: `canEdit` prop disables editing affordances |
| `src/components/GeneratePlanSheet.tsx` | Read-only: unchanged (gated by its trigger) |
| `src/utils/calculations.ts` | Read-only: `clientHourlyRate` now also called from `server.ts` |
| `src/utils/regions.ts` | Read-only: `regionToLocationLabel` used by from-rate-card |
| `src/utils/clientViewPng.ts` | Read-only: already client-safe |
| `src/config/defaults.ts` | Read-only: `APP_DEFAULTS.defaultMargin` fallback |
| `server/planner/generateResourcePlan.ts` | Read-only: unchanged |
| `ai.config.ts` | Read-only: `rateLimit.maxPerUser` now literally per user |
| `.env.example` | Write: new variables with comments; `?connection_limit=1` |
| `docker-compose.yml` | Write: env passthrough; healthcheck `/api/health`; `DATABASE_URL` param |
| `Dockerfile` | Write: `apk add --no-cache sqlite` in production stage |
| `DEPLOYMENT.md` | Write: HTTPS reverse proxy prerequisite (Caddy example), Entra app registration steps, env table, backup cron |
| `README.md` | Write: endpoint list (+`/api/health`, `/api/me`, `/api/users`, members, share links, `/api/share/:token`, `from-rate-card`, `from-resource-list`; rate-limit note "per user"); auth section |
| `openspec/changes/add-multi-user-access/specs/**` | Write: deltas (only if implementation forces a wording change) |

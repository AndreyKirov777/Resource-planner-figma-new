# API Contracts — Resource Planner

_Generated: 2026-06-30 · Deep scan · Source of truth: [server.ts](../server.ts) + [server-validation.ts](../server-validation.ts)_

REST API served by a single-file Express 5 app. Mirror of these routes lives in the typed client
[src/services/api.ts](../src/services/api.ts) — components call `api.*`, never `fetch` directly.

- **Base URL:** `http://localhost:3001/api` (dev). In dev the Vite server proxies `/api` → `:3001`; in
  production the same Express process serves both the API and the built SPA.
- **Content type:** `application/json` for all request/response bodies.
- **Validation:** write routes use Zod `.strict()` schemas — unknown fields (incl. `id`, `createdAt`,
  `updatedAt`, relation IDs) cause `400 Validation failed`.
- **Errors:** routes wrap logic in `try/catch` and return `{ error, details? }` with `4xx`/`5xx`. The client
  throws on any non-OK response.
- **Drift guard:** [readme.test.ts](../readme.test.ts) parses routes from `server.ts` and fails the test
  suite if the README endpoint list drifts. Keep README + code in sync when changing routes.

## Endpoint Summary (28 routes)

| # | Method | Path | Purpose | Body schema |
| --- | --- | --- | --- | --- |
| 1 | GET | `/api/projects` | List all projects | — |
| 2 | GET | `/api/projects/:id` | Project + lists + plans + allocations | — |
| 3 | POST | `/api/projects` | Create project | `projectCreateSchema` |
| 4 | PUT | `/api/projects/:id` | Update project | `projectUpdateSchema` |
| 5 | DELETE | `/api/projects/:id` | Delete project (cascades) | — |
| 6 | POST | `/api/projects/:id/copy` | Duplicate project + all data | `{ name? }` (raw) |
| 7 | GET | `/api/projects/:id/export` | Export project as JSON | — |
| 8 | POST | `/api/projects/import` | Import project from JSON | raw/wrapped JSON |
| 9 | POST | `/api/projects/:id/convert-planning-mode` | Convert weekly↔monthly | `convertPlanningModeSchema` |
| 10 | GET | `/api/rate-cards` | Get global rate card | — |
| 11 | GET | `/api/rate-cards/meta` | Last-import metadata | — |
| 12 | POST | `/api/rate-cards` | Create one rate-card entry | raw (coerced) |
| 13 | POST | `/api/rate-cards/bulk` | Replace entire rate card (Excel import) | `{ rateCards[], fileName? }` |
| 14 | PUT | `/api/rate-cards/:id` | Update rate-card entry | `rateCardUpdateSchema` |
| 15 | DELETE | `/api/rate-cards/:id` | Delete rate-card entry | — |
| 16 | DELETE | `/api/rate-cards` | Clear entire rate card | — |
| 17 | GET | `/api/projects/:projectId/resource-lists` | List a project's resources | — |
| 18 | POST | `/api/projects/:projectId/resource-lists` | Create resource | `resourceListCreateSchema` |
| 19 | PUT | `/api/resource-lists/:id` | Update resource | `resourceListUpdateSchema` |
| 20 | DELETE | `/api/resource-lists/:id` | Delete resource | — |
| 21 | GET | `/api/projects/:projectId/resource-plans` | List plans (ordered) + allocations | — |
| 22 | POST | `/api/projects/:projectId/resource-plans` | Create plan (+ allocations) | `resourcePlanCreateSchema` |
| 23 | PUT | `/api/resource-plans/:id` | Update plan (replaces allocations if sent) | `resourcePlanUpdateSchema` |
| 24 | DELETE | `/api/resource-plans/:id` | Delete plan (cascades allocations) | — |
| 25 | PUT | `/api/projects/:projectId/resource-plans/reorder` | Reorder plans | `reorderSchema` |
| 26 | GET | `/api/resource-plans/:resourcePlanId/allocations` | List allocations | — |
| 27 | POST | `/api/resource-plans/:resourcePlanId/allocations` | Create allocation | `allocationSchema` |
| 28 | PUT | `/api/allocations/:id` | Update allocation | `allocationUpdateSchema` |
| 28b | DELETE | `/api/allocations/:id` | Delete allocation | — |

> Plus a non-API SPA catch-all `GET /^(?!\/api).*/` that serves `build/index.html` (must remain **last**).

## Request Schemas (Zod, `.strict()`)

All from [server-validation.ts](../server-validation.ts). Strings have max lengths; unknown keys rejected.

**projectCreateSchema** — `name` (1–500, required), `description?`, `daysInFTE?` (1–365),
`clientCurrency?` (≤10), `exchangeRate?` (≥0), `defaultMargin?` (0–100), `planningMode?`
(`weekly|monthly`), `defaultLocation?` (≤50), `phases?` (JSON string of `[{name, periodCount|weekCount, color?}]`).
**projectUpdateSchema** — same fields, all optional.

**rateCardUpdateSchema** — `role?`, `namingInPM?`, `discipline?`, `description?`, and the 9 regional rate
floats (`ukraine?`, `easternEurope?`, `asiaGE?`, `asiaARMKZ?`, `latam?`, `mexico?`, `india?`, `newYork?`, `london?`).

**resourceListCreateSchema** — `role` (required), `clientRole?`, `name?`, `intRate?`, `location?`, `description?`.
**resourceListUpdateSchema** — same, all optional.

**resourcePlanCreateSchema** — `role` (required), `clientRole?`, `name?`, `intHourlyRate?`,
`clientHourlyRate?`, `displayOrder?`, `allocations?: allocationSchema[]`.
**resourcePlanUpdateSchema** — same, all optional.

**allocationSchema** — `periodNumber` (int ≥1), `allocation` (int 0–100).
**allocationUpdateSchema** — both optional.

**reorderSchema** — `orderedIds: number[]` (positive ints, ≥1 item).
**convertPlanningModeSchema** — `targetMode: 'weekly' | 'monthly'`.

> Rate-card **create** (`POST /api/rate-cards`) and **bulk** (`/bulk`) do **not** use a strict Zod schema —
> they coerce input via `toGlobalRateCardData()` (string→float with `parseFloat || 0`). Other write routes do.

## Notable Behaviors

- **Plan update + allocations (route 23):** if `allocations` is provided, the server **deletes all existing
  allocations** for the plan and recreates them in a transaction-like sequence. Sending an empty/omitted
  `allocations` leaves them untouched. Handles Prisma `P2002` (unique conflict → 400) and `P2025` (not found → 404).
- **Create plan (route 22):** auto-assigns `displayOrder = max(displayOrder)+1`; filters allocations to
  `periodNumber > 0`.
- **Bulk rate card (route 13):** atomic `$transaction` — `deleteMany()` then `createMany()` then upsert
  import meta. Replaces the whole card.
- **Convert planning mode (route 9):** converts phases and every plan's allocations in a transaction using
  [src/utils/modeConversion.ts](../src/utils/modeConversion.ts); returns the fully reloaded project.
- **Copy / export / import (routes 6–8):** copy still operates on project + lists + plans +
  allocations only (no WBS). Export/import also carry the WBS tree (`wbsItems` + nested
  `estimates`). The **global rate card is never copied/exported/imported per project.** Import
  accepts legacy `weeklyAllocations`/`weekNumber` as well as `allocations`/`periodNumber`, and
  v2 payloads with no `wbsItems` (empty WBS); export wraps payload as
  `{ schemaVersion: 3, exportedAt, data }`.

## Adding an Endpoint (checklist)

1. Add the route in [server.ts](../server.ts) **above** the SPA catch-all.
2. Add a `.strict()` Zod schema in [server-validation.ts](../server-validation.ts) for any body.
3. Add a matching method in [src/services/api.ts](../src/services/api.ts).
4. Update the API list in [README.md](../README.md) (the drift test enforces this).
5. `npm test` to verify integration + drift checks.

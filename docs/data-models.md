# Data Models — Resource Planner

_Generated: 2026-06-30 · Deep scan · Source of truth: [prisma/schema.prisma](../prisma/schema.prisma)_

> SQLite via Prisma 6.15. The Prisma client is generated to `src/generated/prisma` (not `@prisma/client`).
> Frontend never imports Prisma; it uses the mirrored TypeScript interfaces in
> [src/services/api.ts](../src/services/api.ts). If this doc and `schema.prisma` disagree, the schema wins.

## Entity-Relationship Overview

```
Project (1) ──────< ResourceList (N)        [onDelete: Cascade]
   │
   └──────< ResourcePlan (N) ──────< Allocation (N)   [both Cascade]
                                       @@unique(resourcePlanId, periodNumber)

GlobalRateCard (N)        ← standalone, GLOBAL (not linked to any Project)
RateCardImportMeta (1)    ← singleton id=1, last-import metadata
```

Key point: **the rate card is global**, a single shared set common to all projects. It is **not** a
relation of `Project` and is intentionally excluded from project copy/export/import.

## Tables

### Project
Project configuration and planning defaults.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| id | Int PK | autoincrement | |
| name | String | — | required |
| description | String? | null | |
| daysInFTE | Int | 21 | working days per FTE month |
| clientCurrency | String | "EUR" | client billing currency |
| exchangeRate | Float | 0.89 | **client-currency per USD** (applied as `internal * exchangeRate`) |
| defaultMargin | Float? | 45.0 | percentage (0–100) |
| planningMode | String | "weekly" | `'weekly' \| 'monthly'` |
| defaultLocation | String? | "ukraine" | rate-card region slug |
| phases | String? | one-phase JSON | **JSON stored as a string** (SQLite has no JSON type) |
| createdAt / updatedAt | DateTime | now / auto | |

Relations: `resourceLists ResourceList[]`, `resourcePlans ResourcePlan[]` (both cascade on delete).

`phases` default: `[{"name":"Phase 1","periodCount":8,"color":"#E3F2FD"}]`. Parse with `JSON.parse` on read,
`JSON.stringify` on write; validated by `phasesStringSchema`.

### GlobalRateCard
The shared rate card — one row per role, with internal rates per region.

| Field | Type | Notes |
| --- | --- | --- |
| id | Int PK | autoincrement |
| role | String | rate-card role name |
| namingInPM | String | PM-facing naming |
| discipline | String | grouping/discipline |
| description | String? | |
| ukraine, easternEurope, asiaGE, asiaARMKZ, latam, mexico, india, newYork, london | Float | regional internal rates |
| createdAt / updatedAt | DateTime | |

> **Slug ≠ column.** Region slugs in `LOCATIONS` are kebab-case (`eastern-europe`, `asia-ge`) but the
> columns are camelCase (`easternEurope`, `asiaGE`). Map between them — never pass a slug as a column key.

### RateCardImportMeta
Singleton (`id = 1`) recording the last rate-card import.

| Field | Type | Notes |
| --- | --- | --- |
| id | Int PK | fixed to 1 |
| fileName | String? | last imported file name |
| importedAt | DateTime? | last import time |
| updatedAt | DateTime | auto |

Upserted by the bulk import (`POST /api/rate-cards/bulk`) and cleared by `DELETE /api/rate-cards`.

### ResourceList
A project's roster of available resources/roles.

| Field | Type | Notes |
| --- | --- | --- |
| id | Int PK | |
| role | String | required |
| clientRole | String? | |
| name | String? | |
| intRate | Float | internal rate |
| location | String? | region slug |
| description | String? | |
| projectId | Int FK | → Project (**Cascade**) |
| createdAt / updatedAt | DateTime | |

### ResourcePlan
A planning row: a role with internal + client hourly rates and an allocation grid.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| id | Int PK | | |
| role | String | | required |
| clientRole | String? | | |
| name | String? | | |
| intHourlyRate | Float | | internal hourly cost |
| clientHourlyRate | Float | | client hourly rate |
| displayOrder | Int | 0 | manual ordering (reorder endpoint) |
| projectId | Int FK | | → Project (**Cascade**) |
| allocations | Allocation[] | | |
| createdAt / updatedAt | DateTime | | |

### Allocation
Per-period allocation percentage for a resource plan.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| id | Int PK | | |
| periodNumber | Int | | 1-indexed week or month number |
| allocation | Int | 0 | percentage 0–100 |
| resourcePlanId | Int FK | | → ResourcePlan (**Cascade**) |
| createdAt / updatedAt | DateTime | | |

Constraint: `@@unique([resourcePlanId, periodNumber])` — one allocation per period per plan.

## Relationships & Cascade Behavior

- `Project` 1—N `ResourceList`, `ResourcePlan` — deleting a project cascades to both.
- `ResourcePlan` 1—N `Allocation` — deleting a plan cascades to its allocations.
- `GlobalRateCard` / `RateCardImportMeta` have **no** project relation.
- **Destructive:** deleting a Project removes all its lists, plans, and allocations. There is one shared
  SQLite file — confirm before delete/clear operations and before `prisma db push` on a populated DB.

## Period Model (weekly vs monthly)

- `planningMode` is `'weekly' | 'monthly'`. `Allocation.periodNumber` is a week or month index accordingly.
- Conversions live in [src/utils/modeConversion.ts](../src/utils/modeConversion.ts):
  `weeksPerMonth = daysInFTE / 5`; weekly→monthly averages grouped weeks; monthly→weekly distributes evenly.
- `periodCount` (in phases) is current terminology; `weekCount` is a backward-compat alias still accepted on import.

## Conventions for Writes

- Zod schemas in [server-validation.ts](../server-validation.ts) are `.strict()` — sending `id`,
  `createdAt`, `updatedAt`, or relation IDs makes validation **fail**. Send only editable fields.
- After any schema change: `npx prisma generate` (regenerates `src/generated/prisma`) **and**
  `npx prisma db push`.
- `DATABASE_URL` defaults to `prisma/dev.db` when unset (see [server.ts](../server.ts) top).

## Seed / Lookup Data

- [prisma/client_roles.json](../prisma/client_roles.json) — array of `{ Role, "Naming in PM", "Client role" }`,
  consumed by [src/utils/clientRoleMapping.ts](../src/utils/clientRoleMapping.ts) to map a rate-card role to a
  client-facing role.
- On first server start, [server.ts](../server.ts) `initializeDefaultProject()` creates a "Default Project"
  if none exists.

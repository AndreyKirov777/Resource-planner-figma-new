# Integration Architecture — Resource Planner

_Generated: 2026-06-30 · Deep scan_

Although this is a single-package monolith, it has two logical tiers (React SPA + Express API) that
integrate over HTTP. This document describes that seam — the contract, the dev vs prod wiring, and the
shared code.

## Tiers

| Tier | Entry | Port (dev) | Tech |
| --- | --- | --- | --- |
| Frontend (SPA) | [src/main.tsx](../src/main.tsx) → [App.tsx](../src/App.tsx) | 5173 (Vite) | React 18, Vite, grids |
| Backend (API) | [server.ts](../server.ts) | 3001 (Express) | Express 5, Prisma, SQLite |

## Integration Points

| From | To | Type | Details |
| --- | --- | --- | --- |
| SPA ([api.ts](../src/services/api.ts)) | Express ([server.ts](../server.ts)) | REST/JSON over HTTP | All 28 `/api/*` endpoints (see [api-contracts.md](./api-contracts.md)) |
| Express | SQLite | Prisma Client | `src/generated/prisma` → `prisma/dev.db` |
| Both tiers | Shared TS modules | in-process import | `src/utils/modeConversion.ts`, `src/config/defaults.ts` |

There is exactly **one** network seam: the browser → `/api`. No third-party services, no message bus,
no external auth provider.

## How the Frontend Reaches the Backend

The API client uses a **relative base URL**: `const API_BASE_URL = '/api'`
([src/services/api.ts](../src/services/api.ts)). This single choice makes dev and prod work identically:

- **Dev:** Vite serves the SPA on `5173` and **proxies** `/api` → `http://localhost:3001`
  (see [vite.config.mts](../vite.config.mts) `server.proxy`). `changeOrigin: true`.
- **Prod:** Express serves the built SPA **and** `/api` from the **same origin** (3001), so `/api` resolves
  directly. No CORS or base-URL juggling needed.

```
DEV                                  PROD
Browser ─▶ Vite :5173 ──proxy──▶     Browser ─▶ Express :3001
                       Express :3001              ├─ /api/*   (JSON)
                                                  └─ /*       (build/index.html)
```

`cors()` is enabled open on the server, which also permits direct cross-origin calls during development.

## The Shared Contract

The frontend does **not** import Prisma. Instead, the domain types are **re-declared** as TypeScript
interfaces in [src/services/api.ts](../src/services/api.ts) (`Project`, `RateCard`, `ResourceList`,
`ResourcePlan`, `Allocation`, `Phase`, `RateCardImportMeta`). These mirror the Prisma models in
[prisma/schema.prisma](../prisma/schema.prisma). When the schema changes, **update both** the Prisma model
and the matching interface (and the Zod schema in [server-validation.ts](../server-validation.ts)).

Three definitions must stay aligned for any field:
1. `prisma/schema.prisma` — storage shape.
2. `server-validation.ts` — accepted write shape (`.strict()`).
3. `src/services/api.ts` — client-facing TypeScript type.

## Request Lifecycle (end to end)

```
Component event (grid edit, button)
  → App.tsx handler (e.g. handleResourcePlansChange)
  → api.updateResourcePlan(id, { ...editable fields only })   // strips id/timestamps
  → fetch PUT /api/resource-plans/:id
  → Express route: resourcePlanUpdateSchema.safeParse(body)    // .strict()
  → Prisma update (+ replace allocations in a transaction if sent)
  → res.json(updatedPlan)
  → api.ts throws on non-OK; else returns parsed JSON
  → App.tsx updates state (often re-fetches to stay consistent)
```

## Shared Code Across the Seam

The server imports browser-agnostic modules directly:
- [src/utils/modeConversion.ts](../src/utils/modeConversion.ts) — used by `POST /convert-planning-mode`
  and by the frontend for the same conversions.
- [src/config/defaults.ts](../src/config/defaults.ts) — `APP_DEFAULTS` used to fill project defaults on
  create/copy/import.

**Constraint:** these shared modules must stay free of React/DOM/browser APIs, since `server.ts` runs them
under Node via `tsx`.

## Data Flow Notes

- **Global rate card** is loaded once by `App.tsx` (`loadGlobalRateCards`) — independent of the current
  project — and is intentionally **not** included in project copy/export/import.
- **Per-project data** (`resourceLists`, `resourcePlans`) is (re)loaded whenever the active project changes.
- **Current project id** is kept in the URL (`?project=<id>`) via `react-router-dom` `useSearchParams`, so a
  reload restores the same project.

## Failure & Consistency Behavior

- The client throws on any non-OK response; `App.tsx` catches and surfaces a top-level error banner with a
  retry.
- Some flows are optimistic (reorder rolls back on failure); resource-plan edits write then re-fetch to
  reconcile server-assigned IDs/order.
- The plan-update route replaces allocations wholesale when they're included — partial allocation updates go
  through the dedicated allocation endpoints instead.

## Related Documents

- [API Contracts](./api-contracts.md) · [Data Models](./data-models.md) · [Architecture](./architecture.md)

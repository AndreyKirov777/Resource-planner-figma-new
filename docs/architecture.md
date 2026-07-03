# Architecture — Resource Planner

_Generated: 2026-06-30 · Deep scan · Monolith (single full-stack web app)_

## Executive Summary

Resource Planner is a single-package full-stack TypeScript web app. A React 18 SPA (built with Vite)
presents four tabbed workspaces — Projects, Resource Plan, Resource List, Rate Card — backed by a
single-file Express 5 API over a SQLite database (Prisma). Domain state is held centrally in `App.tsx`
and flows down to controlled components; all server I/O is funneled through one typed API client. Pricing
math (cost, price, effort, margin) lives in pure, unit-tested utility modules shared by both the frontend
and the backend.

In production the Express process serves the compiled SPA from `build/` and the JSON API from the same
origin, so the whole thing ships as one Docker container.

## Technology Stack

| Layer | Technology | Version | Role |
| --- | --- | --- | --- |
| Language | TypeScript | ~5.7 (strict) | Whole codebase; build is `noEmit` (no type-check on build) |
| UI | React | 18.3 | SPA component tree |
| Routing | react-router-dom | 7 | `useSearchParams` to keep current project in the URL |
| Build/dev | Vite | 5.4 (`react-swc`) | Dev server (5173), prod build → `build/` |
| Styling | Tailwind CSS | v4 | CSS-first config; `cn()` helper for class merging |
| UI kit | Radix UI + shadcn-style | — | 48 primitives in `src/components/ui/` |
| Grids | Glide Data Grid / AG Grid | 6.0 / `*` | High-density editable tables |
| API | Express | 5.1 | Single-file REST server on 3001 |
| Runtime | Node + tsx | 20 / 4.20 | Server TS run directly, no compile |
| Persistence | Prisma + SQLite | 6.15 | ORM + file DB (`prisma/dev.db`) |
| Validation | Zod | 3.23 | `.strict()` request schemas |
| Spreadsheet | ExcelJS | 4.4 | Rate-card import, plan export |
| Test | Vitest + Testing Library + supertest | 4 / 16 / 7 | jsdom unit/component + API integration |

**Architectural style:** component-based SPA + thin service/API backend (request → validate → ORM → JSON)
over a relational store. No microservices, no message bus, no auth layer.

## System Context

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (SPA)                                                     │
│  ┌──────────────┐   props + onXChange callbacks                   │
│  │   App.tsx    │  ◀────────────── central domain state           │
│  │ (state hub)  │                                                  │
│  └──────┬───────┘                                                  │
│         │ tab components (controlled)                              │
│   ProjectList · ResourcePlan · ResourceList · RateCard · ClientView│
│         │                                                          │
│         ▼  api.* (the ONLY fetch layer)                            │
│   src/services/api.ts                                              │
└─────────┬──────────────────────────────────────────────────────-─┘
          │ HTTP /api/*   (dev: Vite proxy 5173→3001 · prod: same origin)
          ▼
┌──────────────────────────────────────────────────────────────────┐
│  Express server.ts (port 3001)                                    │
│   route → Zod .strict() validate → Prisma → JSON                  │
│   serves build/ (static) + SPA catch-all (last)                   │
└─────────┬──────────────────────────────────────────────────────-─┘
          │ Prisma Client (src/generated/prisma)
          ▼
┌──────────────────────────────────────────────────────────────────┐
│  SQLite — prisma/dev.db                                            │
│  Project · ResourceList · ResourcePlan · Allocation                │
│  GlobalRateCard · RateCardImportMeta  (rate card is GLOBAL)        │
└──────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### State management
- **Single source of truth: [src/App.tsx](../src/App.tsx).** It owns `currentProject`, `resourceLists`,
  `rateCards` + `rateCardMeta`, `resourcePlans`, `activeTab`, `loading`, `error`.
- Children are **controlled** — they receive data plus `onXChange` / `onAddX` / `onDeleteX` callbacks.
  There is **no Redux/Context** for domain data; do not introduce one.
- On load, `App` reads `?project=<id>` from the URL, loads that project (or the first / a freshly created
  default), and loads the **global** rate card separately (it is not per-project).
- Optimistic patterns appear in places (e.g. reorder rolls back on failure); resource-plan edits push to the
  server then refresh from it for consistency.

### Component layers
1. **Feature components** (one per tab): `ProjectList`, `ResourcePlan`, `ResourceList`, `RateCard`, plus
   `ClientView`. See [component-inventory.md](./component-inventory.md).
2. **UI primitives** ([src/components/ui/](../src/components/ui/)): 48 shadcn-style Radix wrappers. Reuse
   these; treat as generated.
3. **Service layer** ([src/services/api.ts](../src/services/api.ts)): typed domain interfaces + every
   server call.
4. **Pure logic** ([src/utils/](../src/utils/)): calculations, mode conversion, phases, role mapping.

### Two grid libraries — pick by component
- **Glide Data Grid** → `ResourcePlan`, `ClientView` (cell-callback API: `getCellContent` / `onCellEdited`).
- **AG Grid** → `ResourceList`, `RateCard` (colDef API: `onCellValueChanged`). AG modules registered once
  in `App.tsx`. **Do not mix the two APIs** in one component.
- `useMemo`/`useCallback` are load-bearing for grid performance in `ResourcePlan.tsx` — preserve memoization.

### Export pipeline (in App.tsx)
- **Excel** (ExcelJS): phase-grouped headers, per-row financials, totals, and a Phase Summary section.
- **PNG**: a hand-drawn `<canvas>` snapshot (table + financial summary card).
- **JSON**: project export/import via the API.

## Backend Architecture

- **Single file: [server.ts](../server.ts).** All 28 endpoints inline. Order matters: static `build/` →
  API routes → **SPA catch-all last** (`/^(?!\/api).*/`).
- **Request lifecycle:** `safeParse` with a `.strict()` Zod schema → Prisma operation → `res.json(...)`;
  each route is `try/catch` with `5xx`/`4xx` JSON errors.
- **DB bootstrap:** `DATABASE_URL` defaults to `prisma/dev.db` if unset; `initializeDefaultProject()`
  seeds a Default Project on first start (skipped under Vitest).
- **Transactions** for multi-step mutations: bulk rate-card replace, plan reorder, planning-mode conversion.
- **Shared logic:** the server imports `src/utils/modeConversion.ts` and `src/config/defaults.ts`, so those
  modules must remain free of browser/React dependencies.

## Data Architecture

Six SQLite tables (full detail in [data-models.md](./data-models.md)):

- **Per-project:** `Project` → `ResourceList`, `ResourcePlan` → `Allocation` (all cascade on delete).
- **Global:** `GlobalRateCard` (shared across projects) + `RateCardImportMeta` (singleton id=1).
- **JSON-as-string:** `Project.phases` is a JSON string (SQLite has no JSON type).
- **Uniqueness:** `Allocation` is unique per `(resourcePlanId, periodNumber)`.

## Cross-Cutting Concerns

| Concern | Approach |
| --- | --- |
| Validation | Zod `.strict()` whitelists ([server-validation.ts](../server-validation.ts)) |
| Error handling | Per-route `try/catch` → JSON error; client throws on non-OK |
| Config/defaults | [src/config/defaults.ts](../src/config/defaults.ts) — currencies, region slugs, default margin/FTE |
| Money/effort math | [src/utils/calculations.ts](../src/utils/calculations.ts) — single source of truth |
| Auth/security | **None** — no authentication/authorization layer; CORS is open |
| Styling | Tailwind v4 utilities + `cn()` (clsx + tailwind-merge) |
| i18n | Not implemented |

## Key Design Decisions & Rationale

1. **Centralized state in `App.tsx`** instead of a state library — keeps the small app simple; the cost is a
   large `App.tsx`.
2. **Single-file Express server** — fast to read and reason about; new routes go inline.
3. **Global rate card** — pricing is org-wide, not per project; deliberately excluded from copy/export/import.
   (The README once described project-scoped rate cards — that is outdated.)
4. **Prisma client generated into `src/generated/prisma`** — lets both tiers share types; never imported by
   the frontend (which uses mirrored interfaces).
5. **Run server via `tsx`** — no separate compile step for the backend.
6. **Build output `build/` served by Express** — one origin, one container in production.

## Critical Gotchas (read before editing)

- **Build does not type-check** (`vite build` + `noEmit`). Run `tsc --noEmit` or `vitest` to catch type errors.
- **Units in calculations:** `margin` is a 0..1 decimal inside `calculations.ts` but persisted/displayed as a
  percentage (0–100) — convert at the boundary. `exchangeRate` is client-currency-per-USD, applied as
  `internal * exchangeRate` — don't invert.
- **Region slug ≠ DB column** (`eastern-europe` vs `easternEurope`).
- **Strip server-managed fields before POST/PUT** (strict Zod rejects `id`/timestamps/relation IDs).
- **Right grid API per component** (Glide vs AG Grid).
- **Versioned import specifiers** (e.g. `vaul@1.1.2`) are remapped in [vite.config.mts](../vite.config.mts);
  add the alias if you add such an import.
- **Excel rate-card import requires the `"RMNG RATES"` sheet.**
- **Trust the code over the README** where they disagree; conventions are captured in
  [_bmad-output/project-context.md](../_bmad-output/project-context.md).

## Testing Strategy

- **Vitest 4**, `environment: jsdom`, `globals: true`; setup file mocks `ResizeObserver` (both grids need it).
- **Unit:** `src/utils/*.test.ts` cover the money/effort/conversion formulas (highest value).
- **Component:** colocated `*.test.tsx` with Testing Library + user-event.
- **Integration:** repo-root `api.integration.test.ts` + `server-validation.test.ts` via supertest;
  `readme.test.ts` guards API-doc drift.

## Related Documents

- [Architecture Review](./architecture-review.md) — findings & recommended changes against this document
- [Source Tree Analysis](./source-tree-analysis.md) · [Data Models](./data-models.md) ·
  [API Contracts](./api-contracts.md) · [Component Inventory](./component-inventory.md) ·
  [Integration Architecture](./integration-architecture.md) · [Development Guide](./development-guide.md) ·
  [Deployment Guide](./deployment-guide.md)

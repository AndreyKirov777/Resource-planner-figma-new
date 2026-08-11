# Source Tree Analysis — Resource Planner

_Generated: 2026-06-30 · Deep scan · Monolith (single full-stack web app)_

Annotated map of the directories and files that matter for understanding and changing this codebase.
Generated/vendored output (`node_modules/`, `build/`, `dist/`, `src/generated/`) is noted but not expanded.

```
Resource planner figma/
│
├── index.html                     # Vite HTML entry → loads /src/main.tsx
├── package.json                   # One manifest for frontend + backend; scripts (dev/server/test/deploy)
├── tsconfig.json                  # TS strict config; noEmit (build does not type-check); @/* → src/*
├── tsconfig.node.json             # TS config for Node/Vite config files
├── vite.config.mts                # Vite: react-swc + tailwind plugins, /api proxy → :3001, outDir=build,
│                                   #   versioned-import aliases (e.g. vaul@1.1.2 → vaul), vitest config
│
├── server.ts                      # ★ Express API (single file, port 3001). All REST endpoints live here.
│                                   #   Sets DATABASE_URL default, serves build/, SPA catch-all LAST.
├── server-validation.ts           # ★ Zod .strict() request schemas (whitelists for every write route)
│
├── api.integration.test.ts        # Supertest integration tests against the Express app (repo root)
├── server-validation.test.ts      # Unit tests for the Zod schemas
├── readme.test.ts                 # Drift check: README API list must match routes in server.ts
├── test-calculation.js            # Ad-hoc calculation sanity script (not part of vitest suite)
│
├── run.sh / stop.sh               # Start/stop both dev processes; PIDs tracked in .app.pids
├── Dockerfile                     # Multi-stage build → production image (Node 20 alpine)
├── docker-compose.yml             # app service; db-data volume; healthcheck on /api/projects
├── .env / .env.example            # DATABASE_URL (optional; defaults to prisma/dev.db)
│
├── prisma/                        # ── Database tier ──────────────────────────────────────────────
│   ├── schema.prisma              # ★ Source of truth for the data model (6 models, SQLite)
│   ├── dev.db                     # SQLite database file (gitignored; persists across runs)
│   └── client_roles.json          # Seed/lookup: Role → "Naming in PM" → Client role mapping
│
├── scripts/                       # ── Deployment ─────────────────────────────────────────────────
│   ├── deploy-to-vm.sh            # rsync+SSH deploy to VM (npm run deploy); --setup-only / --skip-build
│   └── deploy.config.sh           # Editable deploy config (REMOTE_USER, REMOTE_APP_PATH)
│
├── public/                        # Static assets copied verbatim into the build
│
├── src/                           # ── React frontend (SPA) ──────────────────────────────────────
│   ├── main.tsx                   # ★ React entry point (mounts <App/>, BrowserRouter)
│   ├── App.tsx                    # ★ Top-level state container + 4-tab layout. Holds project,
│   │                               #   resourceLists, rateCards, resourcePlans. Excel/JSON/PNG export.
│   ├── index.css / styles/globals.css  # Tailwind v4 entry + global styles/tokens
│   │
│   ├── components/                # Feature components (PascalCase.tsx)
│   │   ├── ResourcePlan.tsx       # ★ Main planning grid (Glide). Allocations, phases, totals. Largest file.
│   │   ├── ResourceList.tsx       # Resource roster grid (AG Grid)
│   │   ├── RateCard.tsx           # Global rate-card grid + Excel import (AG Grid)
│   │   ├── ClientView.tsx         # Client-facing read view (Glide)
│   │   ├── ProjectList.tsx        # Projects list: open/create/copy/delete/rename
│   │   ├── *.test.tsx             # Colocated component tests
│   │   ├── figma/                 # ImageWithFallback.tsx (Figma-exported helper)
│   │   └── ui/                    # ★ 48 shadcn-style Radix primitives (kebab-case.tsx) + utils.ts (cn())
│   │
│   ├── services/
│   │   └── api.ts                 # ★ Single API client. Typed domain interfaces + all server I/O.
│   │
│   ├── config/
│   │   └── defaults.ts            # ★ APP_DEFAULTS, LOCATIONS (region slugs), SUPPORTED_CURRENCIES
│   │
│   ├── utils/                     # ── Pure business logic (unit-tested) ─────────────────────────
│   │   ├── calculations.ts        # ★ Money/effort/margin formulas (single source of truth)
│   │   ├── modeConversion.ts      # Weekly↔monthly allocation & phase conversion (used by server.ts too)
│   │   ├── phases.ts              # Phase parsing, default colors, period→phase lookup
│   │   ├── clientRoleMapping.ts   # Role → client role (reads prisma/client_roles.json)
│   │   └── *.test.ts             # Colocated unit tests
│   │
│   ├── guidelines/Guidelines.md   # Design guidelines
│   ├── test/setup.ts              # Vitest setup: jest-dom + global ResizeObserver mock (grids need it)
│   └── generated/                 # ⚠ Prisma client output — DO NOT EDIT (has stale "* 2.js" dup files)
│
├── docs/                          # ── This documentation set ─────────────────────────────────────
├── _bmad/ , _bmad-output/         # BMAD framework + generated artifacts (project-context.md)
├── build/ , dist/                 # Build output (gitignored)
└── logs/                          # run.sh logs (server.log, vite.log)
```

★ = highest-value files to read first. ⚠ = do not hand-edit.

## Critical Directories Explained

| Path | Role | Why it matters |
| --- | --- | --- |
| [src/](../src/) | Frontend SPA | Everything the user sees; state lives in `App.tsx` |
| [src/components/](../src/components/) | Feature grids/views | One file per tab; Glide vs AG Grid chosen per file |
| [src/components/ui/](../src/components/ui/) | UI primitives | Reuse these; treat as generated, extend deliberately |
| [src/services/api.ts](../src/services/api.ts) | API client | The only place that calls `fetch`; mirrors `server.ts` routes |
| [src/utils/](../src/utils/) | Pure logic | Money/effort/conversion formulas; highest-value test coverage |
| [src/config/defaults.ts](../src/config/defaults.ts) | Constants | Currencies, region locations, default margins/FTE |
| [server.ts](../server.ts) | API | All endpoints; add new routes above the SPA catch-all |
| [server-validation.ts](../server-validation.ts) | Validation | Add a `.strict()` schema for every new write route |
| [prisma/](../prisma/) | Data | `schema.prisma` is the schema source of truth |

## Entry Points

| Tier | Entry point | Bootstraps |
| --- | --- | --- |
| Frontend (dev) | [index.html](../index.html) → [src/main.tsx](../src/main.tsx) → `App` | Vite dev server (5173), proxies `/api` → 3001 |
| Frontend (prod) | `build/index.html` served by Express | Same bundle, same origin as API |
| Backend | [server.ts](../server.ts) `app.listen(3001)` | Express + Prisma; seeds a Default Project on first run |
| Tests | `vitest` (jsdom) | Component, unit, and supertest integration suites |

## Notable Conventions

- **Naming:** feature components `PascalCase.tsx`; UI primitives `kebab-case.tsx`; utils/services `camelCase.ts`.
- **Imports:** `@/*` alias exists but most files use relative imports — match the file you edit.
- **Shared code across tiers:** `server.ts` imports `src/utils/modeConversion.ts` and `src/config/defaults.ts`,
  so those utils must stay framework-free (no browser/React APIs).
- **Tests placement:** component/unit tests colocated; API/server integration tests at repo root.

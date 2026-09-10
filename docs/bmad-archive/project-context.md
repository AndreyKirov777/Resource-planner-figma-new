---
project_name: 'Resource planner'
user_name: 'Andrey'
date: '2026-06-30'
sections_completed:
  [
    'technology_stack',
    'language_specific',
    'framework_specific',
    'testing',
    'code_quality',
    'workflow',
    'critical_rules',
  ]
existing_patterns_found: 18
status: 'complete'
rule_count: 50
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**Runtime/Build:** Node + Vite 5.4 (`@vitejs/plugin-react-swc`), TypeScript ~5.7 (strict), Tailwind CSS v4 (`@tailwindcss/vite`). Server runs via `tsx` (TS executed directly — no compile step).

**Frontend:** React 18.3, react-router-dom 7, Radix UI primitives, lucide-react icons, sonner (toasts), react-hook-form + zod.

**Data grids (TWO libraries — pick by component):**

- `@glideapps/glide-data-grid` 6.0 → ResourcePlan, ClientView
- `ag-grid-react` / `ag-grid-community` (unpinned `*`) → RateCard, ResourceList

**Backend:** Express 5.1 (single file `server.ts`, port 3001), CORS open.

**DB/ORM:** SQLite via Prisma 6.15. Client generated to `src/generated/prisma` (NOT node_modules). `better-sqlite3` also present.

**Other:** ExcelJS 4.4 (import/export). Vitest 4 + Testing Library + jsdom.

**Version constraints to respect:**

- React 18 (not 19) — hooks/APIs must match 18.x.
- Express **5** (not 4) — error/routing semantics differ from v4.
- Tailwind **v4** (CSS-first config, no `tailwind.config.js`).
- `ag-grid-*` pinned to `*` — avoid relying on newest-only AG-Grid APIs.

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **Strict mode is on.** No implicit `any`, handle null/undefined. `noFallthroughCasesInSwitch` enforced.
- **Build does NOT type-check.** `npm run build` = `vite build` only (`noEmit` in tsconfig). Type errors won't fail the build — run `tsc --noEmit` or `vitest` to catch them before committing.
- **Path alias `@/*` → `src/*`** exists (tsconfig + vite), but most code uses relative imports. Either resolves; match the file you're editing.
- **Prisma import path:** server-side, import `PrismaClient` from `./src/generated/prisma` (the custom generator output), never from `@prisma/client`. Frontend never imports the Prisma client — it uses the typed interfaces re-declared in `src/services/api.ts`.
- **Versioned package specifiers:** some Figma-exported UI files import packages WITH a version suffix (e.g. `import { Drawer } from 'vaul@1.1.2'`). These are remapped in `vite.config.mts` `resolve.alias`. If you add such an import, add the matching alias; don't silently rewrite existing ones.
- **ESM only** (`module: ESNext`, `isolatedModules`). Vite config is `.mts`. Use `import`/`export`, not `require`.
- **Server error handling pattern:** wrap each route in `try/catch`, respond `res.status(5xx).json({ error: '...' })`. Frontend `api.ts` throws on non-OK responses.

### Framework-Specific Rules

**React**

- **State is centralized in `src/App.tsx`** (project, resourceLists, rateCards, resourcePlans). Child components are controlled — they receive data + `onXChange`/`onAddX`/`onDeleteX` callbacks via props. No Redux/Context for domain data; don't introduce one.
- **All server I/O goes through `src/services/api.ts`** (`api.getProjects()`, `api.createResourcePlan()`, …). Never call `fetch` directly from components.
- **AG Grid modules are registered once** in `App.tsx` (`ModuleRegistry.registerModules([AllCommunityModule])`). Glide grid is cell-callback based (`getCellContent`/`onCellEdited`); AG Grid is colDef based (`onCellValueChanged`). Match the grid the file already uses.
- `useMemo`/`useCallback` are load-bearing for grid perf in `ResourcePlan.tsx` — preserve memoization when editing.

**Express / API (`server.ts`)**

- **Single-file server** — add new endpoints inline in `server.ts`, then mirror them in `src/services/api.ts`.
- **Validate every request body** with a `.strict()` Zod schema from `server-validation.ts` (whitelist: no `id`/`createdAt`/`updatedAt`/relation IDs from the client). Add a schema when you add an endpoint.
- **Keep the SPA catch-all (`app.get(/^(?!\/api).*/)`) last** — it serves the build; API routes must be declared above it.
- `DATABASE_URL` auto-defaults to `prisma/dev.db` when unset (persistence). Don't hardcode a different path.

**Prisma / DB**

- **JSON-as-string fields:** `phases` is stored as a JSON _string_ (SQLite has no JSON type). `JSON.parse` on read, `JSON.stringify` on write; validate via `phasesStringSchema`.
- **The rate card is GLOBAL**, not per-project: single shared `GlobalRateCard` table (+ `RateCardImportMeta` singleton id=1). The README's "project-scoped rate cards" is OUTDATED — don't follow it.
- **Deleting a Project cascades** to its ResourceLists/ResourcePlans (`onDelete: Cascade`).
- After a schema change: `npx prisma generate` (regenerates into `src/generated/prisma`) **and** `npx prisma db push`.
- **planningMode** is `'weekly' | 'monthly'`; conversions live in `src/utils/modeConversion.ts`. `periodCount` is current; `weekCount` is a backward-compat alias.

### Testing Rules

- **Runner:** Vitest 4, `environment: 'jsdom'`, `globals: true` (no need to import `describe`/`it`/`expect`). Run with `npm test`.
- **Setup file `src/test/setup.ts`** loads `@testing-library/jest-dom` and **mocks `ResizeObserver`** globally — both grid libraries require it under jsdom. Don't remove it; extend it there if a component needs more browser APIs.
- **Test placement is mixed, follow the neighbor:**
  - Component/unit tests are colocated: `Foo.tsx` → `Foo.test.tsx`, `calculations.ts` → `calculations.test.ts`.
  - API/server integration tests live at repo root (`api.integration.test.ts`, `server-validation.test.ts`) and use **supertest** against the Express app.
- **Component tests** use `@testing-library/react` + `@testing-library/user-event` (query by role/text, not implementation details).
- **Pure logic in `src/utils/` (calculations, mode conversion, mappings) must have unit tests** — these encode the money/effort formulas and are the highest-value coverage.
- Coverage available via `@vitest/coverage-v8` (no hard threshold configured).

### Code Quality & Style Rules

- **No ESLint/Prettier config in the repo** — there's no lint gate. Match the style of the file you're editing (2-space indent in `src/`, single quotes, semicolons).
- **Reuse, don't reinvent (LEVER):** per `.cursor/rules/codeoptimization.mdc`, prefer extending existing code/components over creating new ones. "The best code is no code."
- **Single sources of truth — never inline-duplicate these:**
  - Money/effort math → `src/utils/calculations.ts` (`clientHourlyRate`, `marginPct`, `grossMarginPct`, `totalInternalCost`, `estimatedEffortHours`, `hoursPerPeriod`).
  - Defaults & enums → `src/config/defaults.ts` (`APP_DEFAULTS`, `LOCATIONS`, `SUPPORTED_CURRENCIES`). Don't hardcode currency/location lists or default margins/FTE days.
  - Phase helpers → `src/utils/phases.ts`; role mapping → `src/utils/clientRoleMapping.ts`.
- **Styling:** Tailwind v4 utility classes; compose conditional classes with `cn()` from `src/components/ui/utils.ts` (clsx + tailwind-merge). Don't concatenate class strings manually.
- **Reuse the `src/components/ui/` primitives** (shadcn-style Radix wrappers) instead of raw Radix or new bespoke inputs/dialogs. Treat these files as generated — extend deliberately, don't casually rewrite.
- **Naming conventions:** components `PascalCase.tsx`; `ui/` primitives `kebab-case.tsx`; utils/services `camelCase.ts`; exported domain types via `src/services/api.ts`.
- **Use Context7 MCP for current library docs** when editing `.ts`/`.tsx` (per `.cursor/rules/context7.mdc`) to avoid deprecated APIs.
- **Ignore `src/generated/`** — never hand-edit; it's Prisma output (and contains stale `* 2.js`/`* 3.js` duplicates from sync conflicts).

### Development Workflow Rules

- **Two processes in dev:** run the API and the frontend separately.
  - `npm run server` → Express on **3001** (or `npm run dev:server` for tsx watch-reload).
  - `npm run dev` → Vite on **5173**, proxies `/api` → `localhost:3001`.
  - Convenience: `npm run run` / `npm run stop` (`run.sh`/`stop.sh`, PIDs tracked in `.app.pids`).
- **Build output is `build/`, not `dist/`** (`vite build`). The Express server serves static files from `build/`, so a production run needs a fresh build.
- **Deployment:** `npm run deploy` (`scripts/deploy-to-vm.sh`); Docker via `Dockerfile` + `docker-compose.yml`. See `DEPLOYMENT.md`.
- **Database:** SQLite file `prisma/dev.db` persists across runs. For schema changes use `npx prisma db push` (dev) or `npx prisma migrate dev`, then `npx prisma generate`. Inspect with `npx prisma studio`.
- **Git:** feature branches off `main` (e.g. current `BMAD`). Commit messages are short and plain (sentence case) — no Conventional Commits enforced. Don't commit `prisma/dev.db`, `build/`, or `.env`.
- **BMAD artifacts** are written under `docs/bmad-archive/` (this file lives there).

### Critical Don't-Miss Rules (gotchas)

- **Trust the code, not the README.** `README.md` is partially stale: it describes project-scoped rate cards and `/weekly-allocations` endpoints. Reality: the rate card is **global**, and allocation endpoints are **`/api/resource-plans/:id/allocations`** and **`/api/allocations/:id`**. When in doubt, read `prisma/schema.prisma` + `server.ts` + `src/services/api.ts`.
- **Mind the units in calculations:**
  - `margin` is a **0..1 decimal inside `calculations.ts`**, but it's persisted/displayed as a **percentage (0..100)** — convert at the boundary, don't pass a percent into the formula.
  - `exchangeRate` is client-currency-per-USD (≈0.89 for EUR) and is applied as `internal * exchangeRate`. Don't invert it.
  - Always go through the `calculations.ts` helpers; they already guard against divide-by-zero / non-finite inputs.
- **Location slug ≠ DB column.** `LOCATIONS` slugs are kebab-case (`eastern-europe`, `asia-ge`) but `GlobalRateCard` columns are camelCase (`easternEurope`, `asiaGE`). Map between them — never pass a slug as a column key.
- **Strip server-managed fields before POST/PUT.** Zod schemas are `.strict()`, so sending `id`/`createdAt`/`updatedAt`/relation IDs makes validation FAIL. Send only editable fields.
- **Use the right grid API per component** (Glide vs AG Grid) — see Framework rules. Mixing them silently breaks rendering/editing.
- **Destructive & irreversible:** deleting a Project cascades to all its ResourceLists/ResourcePlans, and there's one shared SQLite file. Confirm before delete/clear operations and before `prisma db push` on a populated DB.
- **Excel rate-card import requires the `"RMNG RATES"` sheet** — imports without it will fail/produce empty data.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow ALL rules exactly as documented; when in doubt, prefer the more restrictive option.
- Trust this file + `schema.prisma` / `server.ts` / `src/services/api.ts` over `README.md` where they conflict.
- Update this file if new patterns emerge.

**For Humans:**

- Keep this file lean and focused on agent needs.
- Update when the technology stack or core patterns change.
- Review periodically and remove rules that become obvious over time.

Last Updated: 2026-06-30

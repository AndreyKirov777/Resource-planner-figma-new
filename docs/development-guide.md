# Development Guide — Resource Planner

_Generated: 2026-06-30 · Deep scan_

How to set up, run, test, and extend the app locally. Authoritative scripts live in
[package.json](../package.json); conventions in [_bmad-output/project-context.md](../_bmad-output/project-context.md).

## Prerequisites

- **Node.js 20+** (Docker images use `node:20-alpine`).
- **npm** (repo ships `package-lock.json`).
- No global DB needed — SQLite is a file (`prisma/dev.db`).

## First-Time Setup

```bash
npm install
npx prisma generate     # generates client into src/generated/prisma
npx prisma db push      # creates / syncs prisma/dev.db
```

`DATABASE_URL` is optional. If unset, [server.ts](../server.ts) defaults it to `prisma/dev.db` so data
persists across runs. See [.env.example](../.env.example).

## Running Locally (two processes)

The frontend (Vite) and backend (Express) run separately in dev.

```bash
# Terminal 1 — API on http://localhost:3001
npm run server          # tsx server.ts
# or auto-reload:
npm run dev:server      # tsx watch server.ts

# Terminal 2 — frontend on http://localhost:5173 (proxies /api → :3001)
npm run dev             # vite
```

**Convenience:** `npm run run` starts both in the background (logs in `logs/`, PIDs in `.app.pids`);
`npm run stop` kills them. Implemented in [run.sh](../run.sh) / [stop.sh](../stop.sh).

Open **http://localhost:5173**. On first run with an empty DB, the server seeds a "Default Project".

## NPM Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `vite` | Frontend dev server (5173) |
| `npm run server` | `tsx server.ts` | Backend API (3001) |
| `npm run dev:server` | `tsx watch server.ts` | Backend with reload |
| `npm run build` | `vite build` | Production bundle → `build/` (**no type-check**) |
| `npm test` | `vitest` | Run all tests |
| `npm run run` / `npm run stop` | `./run.sh` / `./stop.sh` | Start/stop both processes |
| `npm run deploy` | `./scripts/deploy-to-vm.sh` | Deploy to VM (see deployment guide) |

## Build & Type-Checking

- **Build does NOT type-check.** `npm run build` is `vite build` only; `tsconfig.json` has `noEmit`. Type
  errors will not fail the build.
- Catch type errors before committing: `npx tsc --noEmit` (or rely on `vitest`).
- Production build output is **`build/`** (not `dist/`); Express serves static files from there.

## Testing

- **Runner:** Vitest 4, `environment: jsdom`, `globals: true` (no need to import `describe`/`it`/`expect`).
- **Setup:** [src/test/setup.ts](../src/test/setup.ts) loads `@testing-library/jest-dom` and mocks
  `ResizeObserver` globally — both grid libraries need it under jsdom. Don't remove it.

```bash
npm test                       # watch mode (vitest)
npx vitest run                 # single run (CI-style)
npx vitest run path/to.test    # one file
npx vitest run --coverage      # coverage (v8); no hard threshold configured
```

Test placement (follow the neighbor):
- **Unit/component:** colocated — `Foo.tsx` → `Foo.test.tsx`, `calculations.ts` → `calculations.test.ts`.
- **API/server integration:** repo root — [api.integration.test.ts](../api.integration.test.ts),
  [server-validation.test.ts](../server-validation.test.ts) (supertest against the Express app),
  [readme.test.ts](../readme.test.ts) (API-doc drift guard).
- **Highest-value coverage:** the pure logic in `src/utils/` (money/effort/conversion formulas).

## Database Workflow

```bash
npx prisma studio        # browse/edit prisma/dev.db
npx prisma db push       # apply schema.prisma to the dev DB
npx prisma generate      # regenerate the client after a schema change
npx prisma migrate dev   # create a migration (alternative to db push)
```

After **any** change to [prisma/schema.prisma](../prisma/schema.prisma): run **both** `prisma generate`
and `prisma db push`. Don't commit `prisma/dev.db`.

> **Destructive:** `prisma db push` on a populated DB can drop data when tables/columns are renamed/removed.
> Confirm before running it against data you care about.

## Common Tasks

### Add an API endpoint
1. Add the route in [server.ts](../server.ts), **above** the SPA catch-all.
2. Add a `.strict()` Zod schema in [server-validation.ts](../server-validation.ts) for the body.
3. Add the matching method to [src/services/api.ts](../src/services/api.ts).
4. Update the API list in [README.md](../README.md) (drift test enforces it).
5. `npm test`.

### Add a frontend feature
1. Reuse [src/components/ui/](../src/components/ui/) primitives; don't hand-roll inputs/dialogs.
2. Keep domain state in [App.tsx](../src/App.tsx); pass data + `onXChange` callbacks down.
3. Use the **right grid API** for the file (Glide vs AG Grid) — don't mix.
4. Route money/effort math through [src/utils/calculations.ts](../src/utils/calculations.ts); pull
   currency/region/defaults from [src/config/defaults.ts](../src/config/defaults.ts).

### Add a versioned package import
Some Figma-exported files import with a version suffix (e.g. `vaul@1.1.2`). These are aliased in
[vite.config.mts](../vite.config.mts) `resolve.alias`. If you add such an import, add the matching alias.

## Code Style

- **No ESLint/Prettier config** — match the file you're editing (2-space indent in `src/`, single quotes,
  semicolons).
- **Reuse over reinvent** (LEVER) — extend existing components/utils; see `.cursor/rules/`.
- **Single sources of truth:** calculations → `utils/calculations.ts`; defaults/enums → `config/defaults.ts`;
  phase helpers → `utils/phases.ts`; role mapping → `utils/clientRoleMapping.ts`.
- **Never hand-edit `src/generated/`** (Prisma output; contains stale duplicate `* 2.js` files).
- **ESM only** (`import`/`export`); server imports Prisma from `./src/generated/prisma`, never `@prisma/client`.

## Git

- Feature branches off `main` (current branch: `BMAD`).
- Short, plain commit messages (sentence case); no Conventional Commits enforced.
- Don't commit `prisma/dev.db`, `build/`, or `.env`.

## Contribution Notes

There is no `CONTRIBUTING.md` and no lint/PR automation in the repo. Practical expectations: keep README's
API list in sync (test-guarded), keep `src/utils` tests green, and follow the conventions above.

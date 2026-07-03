# Architecture Review — Findings & Recommendations

_Reviewed: 2026-07-03 · Companion to [architecture.md](./architecture.md), which documents current state; this
file tracks gaps and recommended changes against it._

## Summary

The app is a coherent, well-documented small full-stack system: React 18 SPA → one typed API client →
single-file Express 5 API → Prisma/SQLite, with the AI planner cleanly isolated behind a provider-agnostic
seam. For its size the architecture is sound — business math lives in pure, tested modules shared by both
tiers, and `server/llm/` + `server/planner/` are genuinely well-factored (Zod-constrained LLM output with
enums built from live data). The issues below are concentrated in deployment safety, the absence of any
type-check gate, two oversized frontend files, and hand-maintained duplication between tiers.

## High priority — correctness and data-safety

1. ✅ **DONE — The Dockerfile can silently destroy production data.** The container start command is
   `npx prisma db push --accept-data-loss` ([Dockerfile:53](../Dockerfile#L53)), even though a proper
   migration history exists in [prisma/migrations/](../prisma/migrations/). `db push --accept-data-loss`
   drops columns/tables on schema drift without asking. Replace it with `npx prisma migrate deploy`.
   _Fixed: [Dockerfile](../Dockerfile) CMD now runs `npx prisma migrate deploy && npm run server`._

2. ✅ **DONE — Two databases exist on disk.** There's `prisma/dev.db` and a stray `prisma/prisma/dev.db`.
   [server.ts:4-7](../server.ts#L4-L7) pins an absolute path, but the Prisma CLI resolves `file:./dev.db`
   relative to the schema directory, so CLI commands run with a relative `DATABASE_URL` have been writing
   to a different database than the server reads. Standardize on one URL (set it in `.env`, read by both
   CLI and server) and delete the stray copy after confirming it holds nothing needed.
   _Fixed: stray `prisma/prisma/dev.db` (stale, old schema — `WeeklyAllocation` etc.) removed via `git rm`;
   `.env`/[.env.example](../.env.example) document `DATABASE_URL=file:./dev.db` as the single canonical URL
   (resolves to `prisma/dev.db` for both CLI and server). Note: `prisma/dev.db` remains git-tracked despite
   being gitignored — left as-is to avoid data surprises._

3. ✅ **DONE — Nothing type-checks this codebase, ever.** `vite build` uses SWC with `noEmit` (no type-checking),
   there's no `typecheck` script in [package.json](../package.json), and there's no CI at all. In a
   strict-mode TS codebase where the server imports frontend modules, type errors are only caught if
   someone happens to open the file in an editor. Add `"typecheck": "tsc --noEmit"` and a minimal GitHub
   Actions workflow running `typecheck` + `vitest run` — the cheapest, highest-leverage change here.
   _Fixed: added `@types/react`/`@types/react-dom`, stripped versioned import specifiers from 41
   `src/components/ui/*.tsx` files, deleted macOS duplicate junk in `src/generated/`, and resolved all
   genuine type errors (server catch blocks, ag-grid/glide typings) — `tsc --noEmit` now passes with 0
   errors (was 1,109). Added `"typecheck"` script and [.github/workflows/ci.yml](../.github/workflows/ci.yml)
   running typecheck + `vitest run` (153/153 pass). Also cleaned 6 pre-existing test failures (App test
   Router wrapper; garbled `client_roles.json` data)._

4. ✅ **DONE — Unpinned dependencies.** `ag-grid-community`, `clsx`, and `tailwind-merge` are version `"*"` in
   [package.json](../package.json). A fresh `npm install` can pull a new ag-grid major and break both grid
   components. Pin them.
   _Fixed: pinned `ag-grid-community`/`ag-grid-react` `^34.1.2`, `clsx` `^2.1.1`, `tailwind-merge` `^3.3.1`._

## Medium priority — structure

5. **Split [server.ts](../server.ts) (991 lines, 28 inline routes).** Every route repeats the same
   `try/catch → console.error → res.status(500)` boilerplate. Express 5 forwards rejected promises to
   error middleware natively, so the try/catches can be deleted in favor of one central error handler, and
   routes split into `server/routes/{projects,rateCards,resourceLists,resourcePlans,allocations,planner}.ts`.
   Mechanical change, big readability payoff.

6. **Make the type sharing intentional instead of mirrored.** The frontend hand-maintains Prisma model
   mirrors in [src/services/api.ts:57-131](../src/services/api.ts#L57-L131), while the server imports
   frontend code (`server/planner` → `src/utils`, `src/config`) — the dependency arrow points the wrong
   way. The `Phase` shape is declared in three places (`api.ts:50-55`, `modeConversion.ts:11-16`,
   `server/planner/phases.ts:23-27` as `ProjectPhase`), and
   [src/utils/clientRoleMapping.ts](../src/utils/clientRoleMapping.ts) vs.
   [server/planner/clientRole.ts](../server/planner/clientRole.ts) are near-identical copies. Create a
   `shared/` directory for domain types, pure calculations, region/phase logic, and defaults; have both
   `src/` and `server/` import from it, and delete the duplicate copies. Longer-term, deriving API types
   from the Zod schemas in [server-validation.ts](../server-validation.ts) via `z.infer` would remove the
   mirror entirely.

7. **Decompose [App.tsx](../src/App.tsx) (1,171 lines).** About 550 of those lines are two inline export
   functions — `handleExportToExcel` (~270 lines, L494-763) and `handleExportToPNG` (~280 lines,
   L765-1047) — that belong in `src/services/export/`. `ClientView.tsx` contains a third, trimmed copy of
   the Excel export that should reuse the same module. What remains is a fetch-and-callback hub with zero
   memoization (0 `useMemo`/`useCallback` across 11 `useState`), passing ~19 freshly-created props into
   `ResourcePlan` on every render. Consider TanStack Query for server state — it would replace most of the
   manual load/mutate/refetch plumbing (including the `setTimeout` re-render hack at
   [App.tsx:483-486](../src/App.tsx#L483-L486)) and add caching/optimistic updates for free.

8. **Batch the write paths.** `handleResourcePlansChange` (App.tsx L227-267) awaits one `PUT` per plan in a
   serial loop and then refetches everything; `handleApplyGeneratedPlan` (L328-417) deletes and re-creates
   every row one call at a time. One slow request mid-loop leaves the DB half-updated. Add bulk endpoints
   (the pattern already exists — `/api/rate-cards/bulk` wraps a transaction) and make apply-generated-plan
   a single transactional endpoint.

9. **Deduplicate ResourcePlan/ClientView.** The glide theme object (27 lines: `ResourcePlan.tsx:1544-1570`
   vs. `ClientView.tsx:520-546`), `getAllocationBgColor` (`ResourcePlan.tsx:54-66` vs.
   `ClientView.tsx:15-27`), and the effort/price calculation helpers (`ResourcePlan.tsx:244-261` vs.
   `ClientView.tsx:77-88`) are verbatim copies across the two files. Extract them to a shared module —
   otherwise a styling or formula fix lands in one view and not the other, and ClientView is precisely what
   clients see.

## Lower priority — worth knowing, fix opportunistically

- **Two data-grid libraries** (AG Grid + Glide) ship in one bundle for four grids. Consolidating on one is
  a real project since their APIs are opposites (colDef vs. cell-callback) — treat it as a deliberate
  decision, but stop the split from growing.
- **Region naming has two parallel schemes** — camelCase DB/API keys (`easternEurope`) vs. kebab-case UI
  slugs (`eastern-europe`) — bridged by switches in [RateCard.tsx](../src/components/RateCard.tsx) and
  [regions.ts](../src/utils/regions.ts). Adding a region today touches a migration plus ~5 code sites.
  Unifying on one key set (or normalizing rates into a `(role, region, rate)` table) would collapse that.
- **No auth, open CORS**, and a per-IP rate limiter whose `Map` never evicts old IPs
  ([server.ts:44](../server.ts#L44)) — fine for an internal tool, but the deploy scripts target a VM, so at
  minimum put it behind a reverse proxy with access control, and set `app.set('trust proxy', ...)` if the
  rate limiter should see real client IPs.
- **Dead weight**: `better-sqlite3` and `recharts` are dependencies unused by any feature code (recharts
  only appears in the shadcn `chart.tsx` boilerplate). `react-hook-form` is installed but `ProjectList.tsx`
  manages 17 separate `useState` form fields by hand — either use it or drop it.
- **Repo hygiene**: tracked junk (`nul`, `.app 2.pids`, `.app 3.pids`, legacy `test-calculation.js`), macOS
  " 2"/" 3" duplicate files inside `src/generated/`, and the 40-line versioned-alias block in
  [vite.config.mts](../vite.config.mts) (a Figma Make export artifact) that can be deleted once the
  versioned import specifiers are cleaned from source.
- **Small component fixes** flagged during the sweep: `RateCard.tsx` grabs the ag-grid API via
  `document.querySelector('.ag-theme-alpine').__agGridReact` ([RateCard.tsx:109-114](../src/components/RateCard.tsx#L109-L114))
  instead of the `onGridReady`/ref API; several prop→state mirror effects (`RateCard` filter arrays,
  `ResourcePlan.phases`) should be `useMemo`/derived values instead; `ResourcePlan`'s `getCellContent`
  memoization is partially defeated by un-memoized calc helpers omitted from its dependency array
  ([ResourcePlan.tsx:590](../src/components/ResourcePlan.tsx#L590)).

## Suggested order of attack

Items 1–4 are about a day of combined work and eliminate the sharpest risks (data loss, silent type
errors, dependency drift). Item 5 and the export extraction in item 7 are the best structure-per-effort
refactors. The rest can ride along with feature work rather than being a dedicated project.

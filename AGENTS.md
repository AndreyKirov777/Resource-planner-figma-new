<!-- bmad:context -->
<!-- Verified 2026-08-14 against f50b922. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Resource Planning Application

Staffing plans with cost, effort and margin estimation. React 18 + Vite + TypeScript SPA over a
single-file Express 5 + Prisma API on SQLite. Generated reference docs live in `docs/` — start at
`docs/index.md`; BMad planning artifacts in `_bmad-output/`.

## Policy

- Never hand-edit `src/generated/prisma` — run `npx prisma generate`. It is gitignored, so a fresh
  clone has none and typecheck fails until you do.

## Where things are

- Every REST endpoint lives in one file: `server.ts`. Its Zod request schemas: `server-validation.ts`.
- Test-database isolation helpers: `globalSetup.ts` (whole run) and `testDb.ts` (per integration file).

## Running and verifying

- Run `npm run typecheck` before calling work done — `npm run build` does not type-check, and CI runs both.
- Copy `.env.example` to `.env` before any `npx prisma migrate` or `db push`; the CLI needs
  `DATABASE_URL`, though `server.ts` falls back to `prisma/dev.db` without it.

## Conventions that differ from defaults

- Update the matching schema in `server-validation.ts` when adding a request field — every schema is
  `.strict()` and rejects unknown keys with a 400.
- Reach the API only through `src/services/api.ts`; never call `fetch` from a component.
- In an integration test, `await isolateTestDb('<name-unique-to-the-file>')` before
  `await import('./server')` — a static import hoists above it and silently runs the suite against
  `prisma/dev.db`.

## Known pitfalls

- On the Cursor Cloud VM, `node_modules/.bin` shims lose their execute bit after `npm install`
  (`sh: 1: vite: Permission denied`). Fix with `chmod +x node_modules/.bin/*`.

<!-- /bmad:context -->

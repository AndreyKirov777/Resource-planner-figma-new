# AGENTS.md

## Cursor Cloud specific instructions

This is a **Resource Planning Application**: a React 18 + Vite + TypeScript frontend backed by an
Express API server that uses Prisma ORM over a SQLite database.

### Services

- **Backend API** (`server.ts`): Express + Prisma, listens on `http://localhost:3001` (`/api/...`).
  - Run: `npm run server` (or `npm run dev:server` for auto-restart via `tsx watch`).
  - On first start it seeds a default project if the DB has none.
- **Frontend** (Vite): dev server on `http://localhost:3000`.
  - Run: `npm run dev`. The frontend calls the backend at the hardcoded base URL `http://localhost:3001/api` (`src/services/api.ts`), so the backend must be running too.
- Standard scripts live in `package.json` (`dev`, `server`, `dev:server`, `build`).

### Non-obvious gotchas

- **`.env` is gitignored but required.** Prisma reads `DATABASE_URL` from `.env`. On a fresh VM the
  file does not exist; the startup update script creates it with `DATABASE_URL="file:./dev.db"`
  (resolved relative to `prisma/`). Without it, `npm run server` / `prisma` commands fail.
- **Generated Prisma client is gitignored.** `src/generated/prisma` (see `prisma/schema.prisma`
  `output`) must be regenerated with `npx prisma generate` (handled by the update script).
- **`.bin` shims may lose their execute bit** on this filesystem after `npm install`, causing
  `sh: 1: vite: Permission denied` (or the same for `tsx`). Fix: `chmod +x node_modules/.bin/*`
  (handled by the update script). Alternatively invoke directly, e.g. `node node_modules/vite/bin/vite.js`.
- **`node_modules/` and `build/` are committed to the repo** (they were tracked before the current
  `.gitignore` rules). Consequently `npm install`, `npm run build`, and simply running the dev
  servers will show many `node_modules/*` / `build/*` files as modified in `git status`. Do NOT
  commit that churn.
- **`prisma/dev.db` is a committed SQLite file with sample data** (e.g. project "Andrey's test
  project"). Using the app (adding resources, etc.) writes to this tracked file. Avoid committing
  test-data changes to `dev.db`.
- **No lint or automated test framework is configured.** `test-calculation.js` is a standalone
  script run with `node test-calculation.js` that prints client-rate calculation checks.
- The DB schema is already migrated; `npx prisma migrate status` reports "up to date". Use
  `npx prisma migrate deploy` only if a fresh DB ever needs migrations applied.

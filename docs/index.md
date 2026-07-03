# Resource Planner — Documentation Index

_Generated: 2026-06-30 · Initial scan (deep) · This is the primary entry point for AI-assisted development._

## Project Overview

- **Type:** Monolith — single full-stack web application (one `package.json`)
- **Primary Language:** TypeScript (strict)
- **Architecture:** Component-based React SPA + single-file Express/Prisma API over SQLite
- **Domain:** Project resource planning — staffing plans with cost, price, effort & margin estimation

## Quick Reference

- **Frontend:** React 18.3 · Vite 5.4 (`react-swc`) · Tailwind v4 · Radix/shadcn UI · Glide Data Grid + AG Grid
- **Backend:** Express 5.1 (single file [server.ts](../server.ts), port 3001) · run via `tsx`
- **Data:** Prisma 6.15 + SQLite (`prisma/dev.db`); client generated to `src/generated/prisma`
- **Validation:** Zod `.strict()` ([server-validation.ts](../server-validation.ts))
- **State:** Centralized in [src/App.tsx](../src/App.tsx); all server I/O via [src/services/api.ts](../src/services/api.ts)
- **Entry points:** [index.html](../index.html) → [src/main.tsx](../src/main.tsx) (FE) · [server.ts](../server.ts) (BE)
- **Build output:** `build/` (not `dist/`); build does **not** type-check
- **Run:** `npm run server` (API) + `npm run dev` (FE), or `npm run run` for both · **Test:** `npm test`

## Generated Documentation

- [Project Overview](./project-overview.md) — purpose, stack, structure at a glance
- [Architecture](./architecture.md) — system design, layers, data flow, key decisions & gotchas
- [Architecture Review](./architecture-review.md) — findings & recommendations against current architecture
- [Source Tree Analysis](./source-tree-analysis.md) — annotated directory map & entry points
- [Data Models](./data-models.md) — Prisma schema, 6 tables, relationships, period model
- [API Contracts](./api-contracts.md) — all 28 REST endpoints + Zod request schemas
- [Component Inventory](./component-inventory.md) — feature components + 48 UI primitives
- [Development Guide](./development-guide.md) — setup, run, test, DB workflow, common tasks
- [Deployment Guide](./deployment-guide.md) — Docker & VM deployment
- [Integration Architecture](./integration-architecture.md) — frontend↔backend seam & shared contract

## Existing Documentation (pre-existing)

- [README.md](../README.md) — feature overview + test-guarded API list
- [DEPLOYMENT.md](../DEPLOYMENT.md) · [DEPLOYMENT_SUMMARY.md](../DEPLOYMENT_SUMMARY.md) — deployment runbook
- [docs/ai-resource-plan-generation-spec.md](./ai-resource-plan-generation-spec.md) — AI plan-generation spec
- [_bmad-output/project-context.md](../_bmad-output/project-context.md) — **agent rules & conventions (read first when coding)**
- [src/guidelines/Guidelines.md](../src/guidelines/Guidelines.md) — design guidelines

## Getting Started

```bash
npm install
npx prisma generate && npx prisma db push
npm run run            # starts API (3001) + frontend (5173); npm run stop to halt
# → open http://localhost:5173
```

See the [Development Guide](./development-guide.md) for details and the [Deployment Guide](./deployment-guide.md)
for production.

## Top Gotchas (full list in architecture.md)

1. **Build doesn't type-check** — run `tsc --noEmit` / `vitest` before committing.
2. **Rate card is GLOBAL**, not per-project (README's project-scoped description is outdated).
3. **Units:** `margin` is 0..1 in `calculations.ts` but 0–100 when persisted; `exchangeRate` is
   client-currency-per-USD (`internal * exchangeRate`).
4. **Region slug ≠ DB column** (`eastern-europe` vs `easternEurope`).
5. **Strict Zod** — strip `id`/timestamps/relation IDs before POST/PUT.
6. **Right grid per component** — Glide (ResourcePlan, ClientView) vs AG Grid (ResourceList, RateCard).
7. **Trust the code over the README**; conventions captured in `_bmad-output/project-context.md`.

## For AI Agents

- **Read [_bmad-output/project-context.md](../_bmad-output/project-context.md) first** — it encodes the
  non-obvious rules.
- Schema source of truth: [prisma/schema.prisma](../prisma/schema.prisma). API source of truth:
  [server.ts](../server.ts) + [src/services/api.ts](../src/services/api.ts).
- For UI features → [architecture.md](./architecture.md) + [component-inventory.md](./component-inventory.md).
- For API/data features → [api-contracts.md](./api-contracts.md) + [data-models.md](./data-models.md).
- For full-stack features → also [integration-architecture.md](./integration-architecture.md).

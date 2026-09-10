# Project Overview — Resource Planner

_Generated: 2026-06-30 · Scan: initial / deep · Repository type: monolith (single full-stack web app)_

## Purpose

**Resource Planner** is an internal tool for building and pricing project staffing plans. A user
creates a **project**, fills a **resource plan** (rows of roles with internal + client hourly rates
and a per-period allocation grid), and the app computes costs, prices, effort, and margins in real
time. Plans are organized into **phases** and can run on a **weekly** or **monthly** cadence. Pricing
draws on a **global rate card** (regional internal rates per role) that is imported from Excel. Plans
export to **Excel, JSON, and PNG**, and a **client-facing view** presents a cleaned-up version of the
numbers.

This is a brownfield single-package application: a React + Vite frontend and an Express + Prisma/SQLite
backend live in one repository and ship as one Docker image.

## Executive Summary

| Aspect | Summary |
| --- | --- |
| Domain | Professional-services resource planning, costing & margin estimation |
| Repository type | Monolith — one `package.json`, frontend in [src/](../src/), backend in [server.ts](../server.ts) |
| Frontend | React 18 SPA, Vite 5 build, TypeScript (strict), Tailwind v4, Radix/shadcn UI |
| Data grids | Two libraries — Glide Data Grid (Resource Plan, Client View) + AG Grid (Resource List, Rate Card) |
| Backend | Express 5, single-file API on port 3001, run via `tsx` (no compile step) |
| Database | SQLite via Prisma 6.15; client generated to `src/generated/prisma` |
| Validation | Zod `.strict()` schemas in [server-validation.ts](../server-validation.ts) |
| Persistence model | Per-project data (lists, plans, allocations) + **one global** rate card shared across projects |
| Export/Import | Excel (ExcelJS), JSON project export/import, PNG snapshot |
| Tests | Vitest 4 + Testing Library + supertest (jsdom) |
| Deployment | Docker (multi-stage) / docker-compose, or VM rsync+SSH script; static build served by Express |

## Tech Stack Summary

| Category | Technology | Version | Notes |
| --- | --- | --- | --- |
| Language | TypeScript | ~5.7 | `strict`; build does **not** type-check (`noEmit`) |
| Frontend framework | React | 18.3 | Not 19 — match 18.x hook/API semantics |
| Routing | react-router-dom | 7 | Only used for `useSearchParams` (project id in URL) |
| Build/dev | Vite | 5.4 | `@vitejs/plugin-react-swc`; output dir is `build/` not `dist/` |
| Styling | Tailwind CSS | v4 | CSS-first config (`@tailwindcss/vite`), no `tailwind.config.js` |
| UI primitives | Radix UI + shadcn-style wrappers | — | 48 primitives in [src/components/ui/](../src/components/ui/) |
| Grids | Glide Data Grid / AG Grid Community | 6.0 / `*` | Pick by component — do not mix APIs |
| Server | Express | 5.1 | v5 routing/error semantics differ from v4 |
| Runtime | Node + tsx | Node 20 / tsx 4.20 | Server TS executed directly |
| ORM/DB | Prisma / SQLite | 6.15 / — | Client output to `src/generated/prisma` |
| Validation | Zod | 3.23 | `.strict()` whitelists on every write endpoint |
| Spreadsheets | ExcelJS | 4.4 | Rate card import + plan export |
| Testing | Vitest / Testing Library / supertest | 4 / 16 / 7 | `environment: jsdom`, `globals: true` |

> Versions and rules above are the authoritative agent context captured in
> [bmad-archive/project-context.md](bmad-archive/project-context.md). Where this overview and the
> code disagree, trust the code (`prisma/schema.prisma`, `server.ts`, `src/services/api.ts`).

## Architecture Type

- **Style:** Component-based SPA frontend + thin service/API backend over a relational store.
- **State:** Centralized in [src/App.tsx](../src/App.tsx); child components are controlled via props and
  `onXChange` callbacks. No Redux/Context for domain data.
- **Server I/O:** All requests funnel through [src/services/api.ts](../src/services/api.ts) — components never
  call `fetch` directly.
- **Backend:** Single-file Express app; each route validates its body with a Zod schema, talks to Prisma,
  and returns JSON. A SPA catch-all serves the built frontend in production.

## Repository Structure

This is a **monolith**: one repository, one `package.json`, two logical tiers that share TypeScript types
and run as one process in production.

```
Resource planner figma/
├── src/                # React frontend (SPA)
├── server.ts           # Express API (single file)  ─┐ share types & utils
├── server-validation.ts# Zod request schemas          │ (calculations, modeConversion,
├── prisma/             # schema + SQLite db + seeds   │  config/defaults)
└── build/              # Vite output, served by Express in prod
```

See [source-tree-analysis.md](./source-tree-analysis.md) for the annotated tree.

## Key Documentation Links

- [Architecture](./architecture.md) — system design, layers, data flow, gotchas
- [Source Tree Analysis](./source-tree-analysis.md) — annotated directory map
- [Data Models](./data-models.md) — Prisma schema, tables, relationships
- [API Contracts](./api-contracts.md) — all 28 REST endpoints
- [Component Inventory](./component-inventory.md) — frontend components & UI primitives
- [Development Guide](./development-guide.md) — setup, run, test, common tasks
- [Deployment Guide](./deployment-guide.md) — Docker & VM deployment
- [Integration Architecture](./integration-architecture.md) — how the frontend and backend connect

## Existing Documentation (pre-existing, not generated here)

- [README.md](../README.md) — feature overview + test-guarded API list
- [DEPLOYMENT.md](../DEPLOYMENT.md) / [DEPLOYMENT_SUMMARY.md](../DEPLOYMENT_SUMMARY.md) — deployment runbook
- [docs/ai-resource-plan-generation-spec.md](./ai-resource-plan-generation-spec.md) — spec for AI-assisted plan generation
- [bmad-archive/project-context.md](bmad-archive/project-context.md) — agent rules & conventions
- [src/guidelines/Guidelines.md](../src/guidelines/Guidelines.md) — design guidelines

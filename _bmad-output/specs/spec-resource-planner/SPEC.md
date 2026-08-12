---
id: SPEC-resource-planner
companions:
  - ../../project-context.md                          # binding convention catalog (50 rules) — read first when implementing
  - ../../../docs/architecture.md                     # system design, layers, data flow, gotchas
  - ../../../docs/data-models.md                      # Prisma schema, 6 tables, period model
  - ../../../docs/api-contracts.md                    # the 28 REST endpoints + Zod write schemas
  - ../../../docs/integration-architecture.md         # frontend↔backend seam, shared contract
  - ../../../docs/component-inventory.md              # feature components + UI primitives
  - ../../../docs/ai-resource-plan-generation-spec.md # AI plan-generation feature — design of record
sources:
  - ../../../README.md          # feature list absorbed into Capabilities (partially stale; trust code)
  - ../../../issues-tasks.md    # tech-debt tracker absorbed into Open Questions / Assumptions
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Resource Planner

## Why

Resource Planner exists so a delivery lead, pre-sales engineer, or PM can turn the shape of a project into a **defensible, costed, margin-aware staffing plan** in minutes rather than spreadsheets — and present a clean version of the numbers to a client. Internally, a planner builds rows of roles with per-period allocations; the app computes internal cost, client price, margin, and effort in real time, grounded in a shared, org-wide rate card with regional rates imported from Excel. The product already exists and works (a React SPA over a single-file Express/Prisma/SQLite API); the **opportunity now is to remove the blank-page cost** — let a planner describe a project in plain language and get an editable draft plan, with roles and rates constrained to the real rate card so nothing is hallucinated, and a human always accepting before anything is saved. This is the anchor every downstream trade-off resolves against: speed and correctness of *costed staffing plans*, with deterministic money math as the non-negotiable core.

## Capabilities

- **CAP-1 — Project lifecycle & settings**
  - **intent:** A user can create, open, rename, copy, and delete projects, each carrying planning settings (client currency, exchange rate, default margin, FTE days, planning mode, default region, phases).
  - **success:** A created project persists and reopens by its `?project=<id>` URL after reload; copy duplicates all per-project data **but not** the global rate card; deleting a project cascades to its resource lists, plans, and allocations.

- **CAP-2 — Resource plan authoring**
  - **intent:** A user can build a resource plan as ordered rows of roles, each with an internal and a client hourly rate, grouped into phases, and reorder them.
  - **success:** Row edits and manual reordering persist through the API and survive reload; phases group the planning periods; the plan grid reflects server state after each edit.

- **CAP-3 — Per-period allocation**
  - **intent:** A user can set each role's allocation percentage (0–100) for every planning period in the grid.
  - **success:** Each allocation is uniquely keyed per `(plan, period)` and persists; per-row and per-phase totals and estimated effort recompute from the allocations.

- **CAP-4 — Real-time costing & margin**
  - **intent:** The system computes internal cost, client price, margin, and estimated effort from rates and allocations, live, through one shared calculation module.
  - **success:** All figures match `src/utils/calculations.ts` (margin handled as 0..1 internally vs 0–100 persisted; `exchangeRate` applied as `internal × exchangeRate`); the helpers guard against divide-by-zero / non-finite inputs; no other module re-implements the money/effort math.

- **CAP-5 — Global rate card management**
  - **intent:** A user can import the org-wide rate card from Excel, edit and clear entries inline, and read regional internal rates per role.
  - **success:** Bulk import (requiring the `"RMNG RATES"` sheet) atomically replaces the entire card and records last-import metadata; the card is shared across every project and is never included in project copy/export/import.

- **CAP-6 — Resource roster (resource list)**
  - **intent:** A user can manage a project's roster of available roles/resources and seed it from the rate card.
  - **success:** Roster rows persist per project; a rate-card role can be added to a project's roster in one action.

- **CAP-7 — Weekly / monthly planning**
  - **intent:** A user can plan in a weekly or monthly cadence and convert a plan between the two.
  - **success:** Conversion transforms the project's phases and every plan's allocations consistently within a transaction (`weeksPerMonth = daysInFTE / 5`) and returns the fully reloaded project.

- **CAP-8 — Client-facing view**
  - **intent:** A user can present a cleaned-up, client-facing view of the plan's pricing.
  - **success:** The client view renders client roles and client rates without exposing internal cost or margin detail.

- **CAP-9 — Export & import**
  - **intent:** A user can export a plan to Excel, export/import a project as JSON, and capture a PNG snapshot.
  - **success:** Excel export is phase-grouped with per-row financials and totals; JSON export wraps `{ schemaVersion, exportedAt, data }` and round-trips on import (accepting legacy `weeklyAllocations`/`weekNumber`), with the global rate card excluded; PNG renders the table + financial summary.

- **CAP-10 — AI draft plan generation**
  - **intent:** A user can describe a project in natural language, pick a delivery region, and receive an editable draft resource plan to review before anything is saved.
  - **success:** The endpoint returns a **draft that is not persisted** and previews in the real plan grid; proposed roles are constrained to `GlobalRateCard` values; internal rates are resolved deterministically server-side and client rates computed via `calculations.ts`; the plan is saved only on explicit user acceptance; the LLM provider is swappable via config without code changes.

## Constraints

- **Single sources of truth, enforced.** Domain state is centralized in `src/App.tsx` (no Redux/Context for domain data); **all** server I/O goes through `src/services/api.ts` (components never `fetch` directly); money/effort math lives only in `src/utils/calculations.ts`; currencies/regions/default margin/FTE come only from `src/config/defaults.ts`. Do not introduce parallel state, fetch, math, or defaults layers.
- **Strict write validation.** Every write endpoint validates its body with a `.strict()` Zod schema (`server-validation.ts`); clients send only editable fields — sending `id`/`createdAt`/`updatedAt`/relation IDs makes validation fail.
- **Three aligned definitions per field.** Any field must stay consistent across `prisma/schema.prisma` (storage), `server-validation.ts` (accepted write shape), and `src/services/api.ts` (client interface). The frontend never imports Prisma (it mirrors the types); the Prisma client is generated to `src/generated/prisma`.
- **The rate card is global.** One shared `GlobalRateCard` (+ `RateCardImportMeta` singleton id=1), common to all projects, deliberately excluded from project copy/export/import. It is not a relation of `Project`.
- **Fixed pricing units.** `margin` is 0..1 inside `calculations.ts` but 0–100 when persisted/displayed — convert at the boundary; `exchangeRate` is client-currency-per-USD applied as `internal × exchangeRate` (don't invert); region slugs are kebab-case but DB columns are camelCase (`eastern-europe` → `easternEurope`) and must be mapped, never passed through as a column key.
- **`daysInFTE` semantics differ by capability — not one blanket rule.** For per-period costing (CAP-4, `hoursPerPeriod()` in `calculations.ts`): cadence-only — monthly hours = `daysInFTE × 8`, weekly stays fixed at 40h/week (5 × 8h) regardless of `daysInFTE`. For weekly↔monthly conversion (CAP-7, `getWeeksPerMonth()` in `modeConversion.ts`): `daysInFTE` is used unconditionally as `weeksPerMonth = daysInFTE / 5` — there is no weekly/monthly branch there, since the function's entire purpose is converting between the two. Decided 2026-08-12, formalizing existing behavior in both files; neither was changed.
- **Two grids, never mixed.** Glide Data Grid backs `ResourcePlan`/`ClientView` (cell-callback API); AG Grid backs `ResourceList`/`RateCard` (colDef API). Match the grid the file already uses; don't mix the two APIs in one component.
- **Single-file backend.** The API stays one Express 5 file (`server.ts`); new routes go inline **above** the SPA catch-all, are mirrored in `src/services/api.ts`, and are reflected in `README.md` (a drift test enforces the endpoint list).
- **Server-shared modules stay browser-agnostic.** Modules the server imports under `tsx` (`calculations.ts`, `modeConversion.ts`, `config/defaults.ts`) must not use React/DOM/browser APIs.
- **Persistence specifics.** `Project.phases` is a JSON **string** (SQLite has no JSON type); `Allocation` is unique per `(resourcePlanId, periodNumber)`; Excel rate-card import requires the `"RMNG RATES"` sheet.
- **AI stays grounded and deterministic.** The LLM proposes only rate-card-constrained roles and per-phase allocations; all rate lookups and money math are deterministic server-side through `calculations.ts`; the provider is pluggable (Vercel AI SDK `ai` + `ai.config.ts` via `c12`, API keys in `.env`); generated drafts are human-in-the-loop and never auto-saved.
- **The full convention catalog is binding.** The 50 rules in `_bmad-output/project-context.md` (companion) govern all implementation; where `README.md` and the code disagree, the code wins.

## Non-goals

- **No multi-tenancy or per-user data isolation** — all data is a single shared dataset. (Authentication is not assumed absent forever — see Open Questions.)
- **A single local SQLite file is the only datastore** — no multi-database, no horizontal scaling, no concurrent-writer guarantees.
- **No real-time multi-user collaboration** — no presence, no concurrent-edit conflict resolution.
- **No internationalization / localization.**
- **Not consolidating to a single grid library in this spec** — the two-grid split is accepted as-is here (the tech-debt item to unify is out of scope).
- **AI v1 boundaries:** no token-streaming UI; the LLM does not set project name, currency, margin, or `daysInFTE`; one delivery region per generation (no per-role region); no prompt-driven editing of an already-populated plan.

## Success signal

A planner starts from a project description and ends with a reviewed, costed, margin-aware staffing plan — built by hand in the grid **or** accepted from an AI-generated draft grounded in the global rate card — then exports it (Excel/JSON/PNG) or hands the client view to a client. Concretely demonstrable end-to-end: create a project, import the rate card from Excel, generate or build a plan with per-period allocations, see correct totals/margins/effort, accept and persist, reload the page and get the identical plan back, and export it to Excel — with every cost/price/margin/effort number produced by the shared calculation module rather than re-derived anywhere.

## Assumptions

- The AI feature reflects `docs/ai-resource-plan-generation-spec.md` as its design of record and is **planned/unbuilt** — no AI endpoint exists among the current 28 routes.
- The rate card is **global** per the 2026-06-30 brownfield docs and `prisma/schema.prisma`; the older `issues-tasks.md` "project-scoped rate card" fix (C3) is superseded and does not reflect current code.
- The tool is single-user / internal, inferred from the absence of an auth layer, open CORS, and a single SQLite file.

## Open Questions

- **Authentication/authorization scope.** `issues-tasks.md` H6 flags the API as fully open. Is auth/authz in near-term scope? It would reshape every endpoint and the data model, so it needs a human decision before downstream skills consume this spec.
- **AI generation guardrails.** Confirm the v1 default provider/model (Anthropic `claude-opus-4-8`) and the concrete cost/rate-limit guardrail values (per-user throttle; `429` on exceed) for `ai.config.ts`.

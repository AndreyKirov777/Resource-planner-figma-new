---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-08-14'
mode: 'system-level'
detected_stack: 'fullstack'
playwright_utils_profile: 'api-only'
inputDocuments:
  - '_bmad/tea/config.yaml'
  - '_bmad-output/project-context.md'
  - '_bmad-output/specs/spec-resource-planner/SPEC.md'
  - 'docs/architecture.md'
  - 'docs/architecture-review.md'
  - 'docs/integration-architecture.md'
  - 'docs/data-models.md'
  - 'docs/api-contracts.md'
  - '_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
  - '_bmad-output/implementation-artifacts/spec-isolate-test-database.md'
  - 'package.json'
  - 'resources/knowledge/risk-governance.md'
  - 'resources/knowledge/nfr-criteria.md'
  - 'resources/knowledge/test-levels-framework.md'
  - 'resources/knowledge/test-quality.md'
  - 'resources/knowledge/adr-quality-readiness-checklist.md'
  - 'resources/knowledge/overview.md'
  - 'resources/knowledge/api-request.md'
  - 'resources/knowledge/auth-session.md'
  - 'resources/knowledge/recurse.md'
  - 'resources/knowledge/playwright-cli.md'
---

# Test Design Progress — Resource planner

## Step 1: Detect Mode & Prerequisites

### Mode selected

**System-Level Mode** (PRD/SPEC + architecture → architecture QA docs + system test design)

### Why

- User chose Create (`C`) with no explicit system vs epic scope.
- `{implementation_artifacts}/sprint-status.yaml` does **not** exist → file-based detection selects System-Level.
- Both a system contract and epic/story specs exist; workflow rule prefers System-Level first.

### Prerequisites (System-Level) — available

| Required | Source | Status |
|----------|--------|--------|
| Functional + NFR-style requirements | `_bmad-output/specs/spec-resource-planner/SPEC.md` (CAP-1–CAP-10, Constraints) | Present |
| Architecture / tech-spec | `docs/architecture.md`, `docs/integration-architecture.md`, `docs/data-models.md`, `docs/api-contracts.md` | Present |
| ADR / architecture decisions | SPEC Constraints; `docs/architecture-review.md`; `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md` | Present (decision records, not a formal ADR set) |
| Project conventions | `_bmad-output/project-context.md` | Present |

### Related epic/story artifacts (not in scope unless mode changes)

WBS implementation specs under `_bmad-output/implementation-artifacts/` (`spec-wbs-*`) plus UX design docs. These can seed a later Epic-Level run if Andrey wants a WBS-only plan.

### Halt conditions

None. Required System-Level inputs are present.

## Step 2: Load Context & Knowledge Base

### Configuration (`_bmad/tea/config.yaml`)

| Flag | Value |
|------|--------|
| tea_use_playwright_utils | true |
| tea_use_pactjs_utils | false |
| tea_pact_mcp | none |
| tea_browser_automation | auto |
| test_stack_type | auto → **fullstack** (React 18 + Express 5 + Prisma/SQLite) |
| test_framework | auto (actual: Vitest 4 + Testing Library + supertest; **no Playwright installed**) |
| risk_threshold | p1 |
| test_artifacts | `_bmad-output/test-artifacts` |
| test_design_output | `_bmad-output/test-artifacts/test-design` |

**Playwright utils profile:** API-only (`overview`, `api-request`, `auth-session`, `recurse`). No `playwright.config.*`, no `page.goto` / `page.locator` in the repo. `@playwright/test` is not a dependency. Existing tests are Vitest/jsdom + supertest.

**Skipped:** Pact.js utils (disabled); `contract-testing.md` (monolith, not microservices — contract is three-definition alignment: Prisma / Zod / `api.ts`); webhook fragments (no event bus); auth-session is loaded but **product has no auth**.

### Tech stack (extracted)

- Frontend: React 18.3, Vite 5.4, Tailwind v4, Glide Data Grid + AG Grid, react-router-dom 7
- Backend: Express 5.1 (`server.ts`), Prisma 6.15, SQLite (`prisma/dev.db`)
- Shared: `src/utils/calculations.ts`, `modeConversion.ts`, `src/config/defaults.ts`
- Validation: Zod `.strict()` in `server-validation.ts`
- Test isolation: `prisma/test.db` (+ per-file `test-api.db` / `test-wbs.db`) via `spec-isolate-test-database.md` (done)
- CI: `.github/workflows/ci.yml` runs `typecheck` + `vitest run`

### Integration points

1. SPA `src/services/api.ts` → Express `/api/*` (dev: Vite proxy 5173→3001; prod: same origin)
2. Express → SQLite via Prisma
3. ExcelJS import (`"RMNG RATES"` sheet) / Excel+JSON+PNG export
4. LLM seam (`server/llm/` + `POST /api/projects/generate-plan`) — provider-pluggable; draft not persisted until accept
5. No auth, no message bus, no third-party SaaS besides optional LLM providers

### Functional scope (epics / capabilities)

| ID | Capability | Notes |
|----|------------|--------|
| CAP-1 | Project lifecycle & settings | persist, copy (excludes rate card), cascade delete |
| CAP-2 | Resource plan authoring | roles, rates, phases, reorder |
| CAP-3 | Per-period allocation | unique (plan, period) |
| CAP-4 | Real-time costing & margin | `calculations.ts` only |
| CAP-5 | Global rate card | Excel import, org-wide |
| CAP-6 | Resource roster | per-project |
| CAP-7 | Weekly / monthly planning | conversion via `daysInFTE / 5` |
| CAP-8 | Client-facing view | no internal cost/margin |
| CAP-9 | Export & import | Excel / JSON v3 + WBS / PNG |
| CAP-10 | AI draft plan generation | human-in-the-loop; Goal 3 (apply+undo) deferred |
| CAP-11 | WBS & estimate reconciliation | additive (sprint-change-proposal 2026-08-12); many `spec-wbs-*` slices |

### NFRs found vs missing thresholds

| Category | What exists | Threshold / evidence | Status |
|----------|-------------|----------------------|--------|
| Security | Open CORS; no AuthN/AuthZ; Zod input validation; Prisma parameterized queries | Auth is SPEC Open Question | **CONCERNS** — no auth SLO; treat as accepted product risk unless Andrey says otherwise |
| Performance | Grid memoization notes; single SQLite writer | No p95/p99, no k6 | **Missing** — ask below |
| Reliability | Per-route try/catch; isolated test DBs | No health check, retries, circuit breaker | **Missing** |
| Maintainability | Vitest + typecheck + CI; coverage tool present, no hard threshold | Coverage % not gated | **Missing threshold** |
| Data integrity | Cascade delete; JSON-as-string phases; unique allocations; WBS cascade | Live `dev.db` previously lost data to tests (now isolated) | High-value, no numeric SLO |
| Compliance | Internal single-user tool | N/A | Skip |

### NFR threshold questions (to resolve in later steps if unanswered)

1. Performance: any p95 target for plan-grid recalc or `/api` writes under a typical plan size (e.g. 50 rows × 12 months)?
2. Maintainability: should coverage be gated (e.g. 80%) or remain ungated as today?
3. Security: is the open API an accepted residual risk for this internal tool, or near-term auth in scope?
4. Reliability: is a `/api/health` + backup/restore drill in scope, or out of band?

### Knowledge fragments loaded (System-Level required + API-only Playwright profile)

- `risk-governance.md`, `nfr-criteria.md`, `test-levels-framework.md`, `test-quality.md`, `adr-quality-readiness-checklist.md`
- Playwright utils: `overview.md`, `api-request.md`, `auth-session.md`, `recurse.md`
- `playwright-cli.md` (tea_browser_automation=auto) — CLI not used this step (system-level; browser exploration is epic-level)

### Existing test inventory (context only — coverage analysis is epic-level)

27 test files: unit (`calculations`, `phases`, `modeConversion`/`wbs*`), component (`ResourcePlan`, `Wbs`, `ClientView`, …), integration (`api.integration.test.ts`, `wbs.integration.test.ts`, `server-validation.test.ts`), drift (`readme.test.ts`). No E2E.

### Gaps / substitutions (not halt conditions)

- No formal PRD — SPEC.md used as FR/NFR contract
- No formal ADR set — architecture.md + architecture-review.md + SPEC Constraints
- No `sprint-status.yaml` / epics.md — implementation specs + CAP list used for scope
- Playwright utils configured but not installed — design will prefer Vitest/supertest as the actual stack; Playwright is a future E2E option

## Step 3: Testability & Risk Assessment

Scoring: Probability 1–3 × Impact 1–3. ≥6 MITIGATE (CONCERNS at gate). =9 BLOCK. 4–5 MONITOR. 1–3 DOCUMENT.

### 1. Testability review

#### 🚨 Testability concerns

1. **No browser E2E and grids are hostile to it.** There is no Playwright/Cypress config and no `page.goto` usage. Plan/client views use Glide (canvas/cell-callback); roster/rate card use AG Grid. A thin E2E layer will flake if it tries to drive cells like DOM. **Implication:** critical journeys (create project → import rates → allocate → see totals → export) must be proven at API + pure-function + targeted component levels; E2E, if added, should assert shell/navigation/export download, not cell editing.

2. **Observability is console-only.** Routes `console.error` and return JSON; there is no `/api/health`, structured logs, RED metrics, or trace IDs. Failures in CI or production are hard to attribute. **Implication:** tests must assert HTTP status + JSON body; do not plan monitoring-based NFR evidence until operators add it.

3. **No product seeding API.** Controllability relies on Prisma in `testDb.ts` / `globalSetup.ts` and supertest writes. That is enough for this monolith, but there is no documented fixture factory shared with UI tests. **Implication:** keep API-first setup; do not invent `/api/test-data` unless E2E lands.

4. **Destructive globals.** `GlobalRateCard` is a singleton table; bulk import replaces the entire card. Integration tests previously hit `prisma/dev.db` and caused live data loss. Isolation now exists (`prisma/test.db`, `test-api.db`, `test-wbs.db`) — **must stay a hard invariant**. `prisma/dev.db` remains git-tracked.

5. **LLM seam is async, key-gated, and non-deterministic.** Generation is testable with an injected model (Goal 1b spec), but live-provider tests are not reproducible. **Implication:** unit/integration with a fake model only; never call Anthropic/OpenAI in CI.

6. **Fault injection is ad hoc.** No retry/circuit-breaker/offline UI. Reliability tests would need route mocking in the client; `api.ts` throws on non-OK with no retry.

#### ✅ Testability assessment summary (already strong)

- **Headless business logic:** costing, effort, mode conversion, WBS tree/reconciliation, Zod schemas, and all REST writes are API-accessible. Matches ADR criterion 1.2.
- **Deterministic money math:** `calculations.ts` is pure, shared by both tiers, and already unit-tested — highest-leverage coverage.
- **Write validation is testable:** `.strict()` Zod + `server-validation.test.ts` + `readme.test.ts` endpoint drift gate.
- **Integration isolation is now real:** `isolateTestDb` + Vitest `globalSetup`; CI runs `typecheck` + `vitest run` on Node 20.
- **LLM is injectable:** planner orchestration accepts an injected model; empty rate card → 409 is a hard, testable guard.
- **State is centralized:** `App.tsx` as hub makes component tests controllable via props (no Redux).

#### Architecturally Significant Requirements (ASRs)

| ID | ASR | Class |
|----|-----|--------|
| ASR-1 | Money/effort math lives only in `calculations.ts`; margin 0..1 inside vs 0–100 persisted; `exchangeRate` is client-per-USD applied as `internal × exchangeRate` | ACTIONABLE |
| ASR-2 | Rate card is global; excluded from project copy/export/import; Excel import requires `"RMNG RATES"` | ACTIONABLE |
| ASR-3 | Three aligned definitions per field: Prisma ↔ Zod `.strict()` ↔ `api.ts` | ACTIONABLE |
| ASR-4 | `daysInFTE`: costing weekly=40h fixed, monthly=`daysInFTE×8`; conversion always `daysInFTE/5` | ACTIONABLE |
| ASR-5 | Project delete cascades lists/plans/allocations/WBS; WBS parent delete cascades subtree + estimates | ACTIONABLE |
| ASR-6 | AI draft is not persisted; roles constrained to live rate card; human accept required | ACTIONABLE |
| ASR-7 | JSON project export `schemaVersion: 3` must round-trip WBS; accept legacy v2 / `weeklyAllocations` | ACTIONABLE |
| ASR-8 | `Project.phases` is a JSON **string**; `Allocation` unique `(resourcePlanId, periodNumber)` | ACTIONABLE |
| ASR-9 | Two grid libraries never mixed; Glide vs AG Grid APIs | FYI (UI test design) |
| ASR-10 | Single SQLite file, no concurrent-writer guarantees, no auth, open CORS | FYI (product constraint) |
| ASR-11 | Server-shared modules must stay browser-agnostic | ACTIONABLE |
| ASR-12 | WBS estimate `role` defaults to `""` not null (SQLite unique-NULL trap); discipline enum from live rate card unless card empty | ACTIONABLE |

---

### 2. Risk register

| ID | Category | Risk | P | I | Score | Action | Mitigation | Owner | Timeline |
|----|----------|------|---|---|-------|--------|------------|-------|----------|
| R-01 | BUS | Wrong client price / margin / effort (unit mismatch or duplicated math) | 2 | 3 | **6** | MITIGATE | Keep exclusive unit tests on `calculations.ts`; golden fixtures for weekly vs monthly, EUR exchange, divide-by-zero | Dev | This design cycle |
| R-02 | DATA | Integration tests or scripts write the live `dev.db` (already happened) | 2 | 3 | **6** | MITIGATE | Guard: no test file imports `server` without `isolateTestDb`; CI must not set `DATABASE_URL` to `dev.db`; never commit test-data `dev.db` | Dev | Already started; keep as invariant |
| R-03 | DATA | Destructive ops: project cascade delete, rate-card bulk replace, WBS subtree delete | 2 | 3 | **6** | MITIGATE | API tests for cascade + empty-card replace; UI confirm is out of API — document residual | Dev | This design cycle |
| R-04 | DATA | JSON export/import loses WBS or corrupts legacy weekly allocations | 2 | 3 | **6** | MITIGATE | Round-trip integration tests v3 + v2 + `weeklyAllocations` alias; rate card excluded | Dev | This design cycle |
| R-05 | BUS | WBS reconciliation disagrees with plan hours (`estimatedEffortHours`) | 2 | 3 | **6** | MITIGATE | Unit tests on reconciliation engine vs `calculations.ts`; empty WBS / unmatched discipline cases | Dev | This design cycle |
| R-06 | BUS | `daysInFTE` dual semantics applied on the wrong path (costing vs conversion) | 2 | 3 | **6** | MITIGATE | Explicit unit matrix already specified in WBS-0; regression tests must name both paths | Dev | This design cycle |
| R-07 | BUS | AI draft persists or invents roles not on the rate card | 2 | 3 | **6** | MITIGATE | Injected-model tests: empty card 409; unknown role rejected; DB unchanged until accept | Dev | This design cycle |
| R-08 | SEC | Unauthenticated API: anyone who can reach the host can read/delete all projects | 3 | 2 | **6** | MITIGATE or **WAIVE** | Product is specified as internal single-user. If waived: document residual + no public bind. If not: auth is a new epic, not a test patch | Andrey | Before any non-localhost deploy |
| R-09 | TECH | No E2E of the planner journey; grid edits untested in a real browser | 3 | 2 | **6** | MITIGATE | Do **not** E2E-drive Glide cells. Cover journey via API+unit; optional Playwright smoke: load app, open project, export download | QA | After coverage plan |
| R-10 | DATA | Excel rate-card import without `"RMNG RATES"` silently empty / fails | 2 | 2 | 4 | MONITOR | API/unit test for missing sheet; happy-path fixture workbook | Dev | This design cycle |
| R-11 | TECH | Prisma / Zod / `api.ts` field drift (three-definition rule) | 2 | 2 | 4 | MONITOR | `readme.test.ts` covers routes not types; add targeted schema-alignment tests for new WBS fields | Dev | Ongoing |
| R-12 | PERF | Large plan / WBS tree latency — **no SLO defined** | 2 | 2 | 4 | MONITOR | Threshold **UNKNOWN**; do not invent p95. Revisit if Andrey sets a target | Andrey | Optional |
| R-13 | OPS | No health check, backup restore never drilled, SQLite single-writer | 2 | 2 | 4 | MONITOR | Deployment guide exists; Dockerfile `migrate deploy` already fixed (architecture-review) | Ops | Optional |
| R-14 | SEC | LLM API keys in `.env`; prompt injection via project description | 2 | 2 | 4 | MONITOR | Keys gitignored; output constrained by Zod enum from rate card (mitigates injection more than auth) | Dev | Ongoing |
| R-15 | BUS | Client view leaks internal cost/margin | 2 | 2 | 4 | MONITOR | Component tests already exist (`ClientView.test.tsx`); keep assertion that internal fields are absent | Dev | Ongoing |
| R-16 | TECH | `App.tsx` size / serial PUTs — correctness more than testability | 2 | 1 | 2 | DOCUMENT | Architecture-review items 7–8; not a test gate | — | Backlog |
| R-17 | OPS | Coverage ungated; CI has no coverage threshold | 2 | 1 | 2 | DOCUMENT | `@vitest/coverage-v8` present, unused as gate | Andrey | Optional |

**No score=9 BLOCK items.** Highest cluster is DATA/BUS at 6 around money, persistence, and destructive writes.

---

### 3. NFR planning assessment

This step **plans** validation; it does not grade implementation PASS/FAIL (`nfr-assess` later).

| NFR | In scope? | Threshold from artifacts | Planned evidence | Risk link |
|-----|-----------|--------------------------|------------------|-----------|
| Security (AuthN/AuthZ) | Ambiguous (SPEC Open Question) | **UNKNOWN** — no auth by design today | Waiver **or** future auth epic; until then: document open CORS | R-08 |
| Security (injection / secrets) | Yes (baseline) | Zod `.strict()`; Prisma parameterized; `.env` gitignored | `server-validation` invalid-payload tests; no secrets in repo scan (manual/CI) | R-14 |
| Performance | Weakly | **UNKNOWN** — no p95/p99, no k6 | Do not add k6 until a number exists; optional perceived-perf later | R-12 |
| Reliability | Weakly | **UNKNOWN** — no health, retry, RTO/RPO | API 4xx/5xx JSON shape tests; test-DB isolation as reliability of *tests* | R-02, R-13 |
| Scalability | Out (product non-goal) | Single SQLite, no horizontal scale | N/A | ASR-10 |
| Maintainability | Yes | Typecheck + vitest in CI; coverage **UNKNOWN** (no %) | CI green; `readme.test.ts`; colocated unit tests for `src/utils` | R-11, R-17 |
| Compliance | Out | Internal tool | N/A | — |
| Data integrity (project-specific) | **Yes — primary NFR** | Cascade, unique keys, JSON string phases, export round-trip | Integration tests on isolated SQLite | R-02–R-06 |

**Clarification items (do not guess):**

1. Is R-08 (open API) an accepted residual risk for localhost/internal use?
2. Any performance SLO for grid recalc or API writes?
3. Should coverage become a CI gate?

---

### 4. Highest risks — mitigation priority

1. **R-01 / R-05 / R-06 (BUS, score 6):** Money, `daysInFTE`, and WBS reconciliation — unit-test these as one family. A single wrong helper poisons every screen and export.
2. **R-02 / R-03 / R-04 (DATA, score 6):** Isolated DB invariant + cascade/replace + JSON round-trip — integration tests on throwaway SQLite only.
3. **R-07 (BUS, score 6):** AI draft must not write and must not invent roles.
4. **R-08 (SEC, score 6):** Needs Andrey's waiver or an auth epic — tests cannot "fix" an open API.
5. **R-09 (TECH, score 6):** Close the journey gap without trying to E2E-edit Glide cells.

Default for undefined NFR targets: **CONCERNS** until clarified (per `nfr-criteria.md`).

## Step 4: Coverage Plan & Execution Strategy

Test IDs: `{CAP}-{LEVEL}-{SEQ}`. Level chosen per `test-levels-framework.md` — one primary level per behavior; no duplicate assertions of the same logic at a higher level.

Legend: **Have** = existing test file likely covers; **Gap** = add or harden.

### 1. Coverage matrix

#### P0 — must (core money, data integrity, previously broken)

| ID | Scenario | Level | Risk | CAP | Status |
|----|----------|-------|------|-----|--------|
| CAP4-UNIT-001 | `clientHourlyRate` / `marginPct` / `grossMarginPct` / `totalInternalCost` / `estimatedEffortHours` golden values; divide-by-zero / non-finite | Unit | R-01 | CAP-4 | Have (`calculations.test.ts`) — keep as canonical |
| CAP4-UNIT-002 | Margin 0–100 at boundary vs 0–1 inside helper; `exchangeRate` not inverted | Unit | R-01 | CAP-4 | Have / harden if missing named cases |
| CAP7-UNIT-001 | Costing: weekly hours always 40; monthly = `daysInFTE × 8` | Unit | R-06 | CAP-7 | Have (`wbs-0` / calculations) — named dual-path |
| CAP7-UNIT-002 | Conversion: `weeksPerMonth = daysInFTE / 5` with no weekly/monthly branch | Unit | R-06 | CAP-7 | Have (`modeConversion`) |
| CAP11-UNIT-001 | Reconciliation hours vs `estimatedEffortHours` aggregation (match / mismatch / empty WBS) | Unit | R-05 | CAP-11 | Have (`wbs.test.ts` etc.) — harden empty/unmatched discipline |
| CAP1-API-001 | DELETE project cascades lists, plans, allocations, WBS | API | R-03 | CAP-1 | Gap if not in `api.integration` |
| CAP5-API-001 | Rate-card bulk replace/clear on **isolated** DB only; never `dev.db` | API | R-02, R-03 | CAP-5 | Have (`api.integration` + `isolateTestDb`) — treat as invariant |
| CAP3-API-001 | Allocation unique `(resourcePlanId, periodNumber)`; replace in transaction | API | R-03 | CAP-3 | Have / confirm |
| CAP9-API-001 | JSON export/import `schemaVersion: 3` round-trips WBS; rate card excluded | API | R-04 | CAP-9 | Gap vs CAP-11 extension |
| CAP9-API-002 | Legacy import: v2 payload and `weeklyAllocations`/`weekNumber` aliases | API | R-04 | CAP-9 | Gap |
| CAP10-API-001 | `POST generate-plan` does not write DB; empty rate card → 409; injected model only | API | R-07 | CAP-10 | Have (`generateResourcePlan.test.ts`) — confirm no-write |
| CAP10-API-002 | Proposed roles constrained to live rate-card enum; unknown role rejected | API | R-07 | CAP-10 | Have / harden |
| META-API-001 | Integration files use `isolateTestDb`; CI `DATABASE_URL` ≠ `dev.db` | API | R-02 | — | Have (`testDb.ts`) — do not regress |

**Not P0 E2E:** do not re-assert formulas in the browser. No Glide cell-edit E2E.

#### P1 — should (core journeys, import/export, WBS API, client view)

| ID | Scenario | Level | Risk | CAP | Status |
|----|----------|-------|------|-----|--------|
| CAP1-API-002 | Create / open via `?project=` / rename / copy (copy excludes rate card) | API | — | CAP-1 | Have |
| CAP2-API-001 | Plan CRUD + reorder persists | API | — | CAP-2 | Have |
| CAP5-API-002 | Excel import requires `"RMNG RATES"`; missing sheet fails/empty | API/Unit | R-10 | CAP-5 | Gap if only happy path |
| CAP6-API-001 | Roster persist; add rate-card role to project list | API | — | CAP-6 | Have (`ResourceList` / API) |
| CAP7-API-001 | Convert planning mode in a transaction; phases + allocations consistent | API | R-06 | CAP-7 | Have / confirm |
| CAP8-CMP-001 | Client view renders client roles/rates; **no** internal cost/margin | Component | R-15 | CAP-8 | Have (`ClientView.test.tsx`) |
| CAP11-API-001 | WBS item create/update/delete; subtree cascade; `parentId` same project | API | R-03 | CAP-11 | Have (`wbs.integration.test.ts`) |
| CAP11-API-002 | Estimate unique `(wbsItemId, discipline, role)`; `role=""` not null | API | ASR-12 | CAP-11 | Have / confirm |
| CAP11-API-003 | Discipline must be in live enum unless rate card empty | API | ASR-12 | CAP-11 | Have |
| VAL-API-001 | `.strict()` rejects `id` / `createdAt` / `updatedAt` / relation IDs | API | R-11 | — | Have (`server-validation.test.ts`) |
| DOC-UNIT-001 | `readme.test.ts` endpoint list matches `server.ts` | Unit | R-11 | — | Have |
| CAP9-API-003 | Excel plan export phase-grouped with per-row financials (API or service) | API | R-01 | CAP-9 | Gap (export often UI-only) |

#### P2 — secondary

| ID | Scenario | Level | Risk | CAP | Status |
|----|----------|-------|------|-----|--------|
| CAP11-CMP-001 | WBS table structure edit / row menu (not math) | Component | — | CAP-11 | Have (`Wbs.test.tsx`, `WbsRowMenu`) |
| CAP11-CMP-002 | Drag-drop reorder/reparent happy path | Component | — | CAP-11 | Partial |
| CAP8-CMP-002 | PNG snapshot smoke (canvas exists / does not throw) | Component | — | CAP-8/9 | Partial |
| ERR-API-001 | 4xx/5xx JSON `{ error }` shape | API | R-13 | — | Partial |
| CAP10-API-003 | Rate-limit 429 on generate-plan; 422 `NoObjectGeneratedError` | API | R-07 | CAP-10 | Have / confirm |
| CAP2-CMP-001 | ResourcePlan phases UI (not cell math) | Component | — | CAP-2 | Have |

#### P3 — if time

| ID | Scenario | Level | Risk | Status |
|----|----------|-------|------|--------|
| SMOKE-E2E-001 | Optional Playwright: open SPA, pick project, see a tab — **no grid editing** | E2E | R-09 | Gap (framework not installed) |
| PERF-P3-001 | k6/load — **blocked** until SLO exists | Perf | R-12 | Not planned |
| AUTH-P3-001 | Auth/authz suite — **blocked** until R-08 decision | E2E/API | R-08 | Not planned |

**Duplicate-coverage guard:** calculations stay unit-only; API tests assert persistence and status codes, not recompute margin; component tests query role/text, not formula results.

---

### 2. NFR coverage and evidence plan

| NFR | Planned validation | Tool / level | Evidence for later `nfr-assess` | Blocker |
|-----|-------------------|--------------|----------------------------------|---------|
| Data integrity | CAP1-API-001, CAP5-API-001, CAP9-API-001/002, META-API-001 | Vitest + supertest + isolated SQLite | CI `vitest run` log | None |
| Security (injection/validation) | VAL-API-001 | Zod + API | CI | None |
| Security (AuthN) | None until decision | — | Waiver note **or** new epic | R-08 **UNKNOWN** |
| Performance | None | k6 not introduced | — | Threshold **UNKNOWN** (R-12) |
| Reliability | ERR-API-001; test isolation | API | CI | No `/api/health` — do not fake it |
| Maintainability | typecheck + vitest + readme drift | GitHub Actions | `.github/workflows/ci.yml` | Coverage % **UNKNOWN** — not gated |
| Scalability | Out of scope | — | Product non-goal | — |

Assumptions: internal single-user; Playwright not required to ship P0/P1.

---

### 3. Execution strategy

| Cadence | What | Notes |
|---------|------|--------|
| **PR** | `npm run typecheck` + `npx vitest run` | Already in CI; keep **&lt; 15 min**. All P0–P2 automated tests live here. |
| **Nightly** | Not needed yet | Add only if Playwright smoke or coverage HTML is too slow for PR. |
| **Weekly** | Optional: `vitest run --coverage` report (no fail gate) | Do **not** add k6/chaos until thresholds exist. |

No separate E2E job until SMOKE-E2E-001 is explicitly requested.

---

### 4. Resource estimates (gaps + hardening, not rewrite)

Existing suite (~27 files) already covers much of P0/P1. Estimates are **remaining work** to close score≥6 risks and listed gaps.

| Priority | Effort | Notes |
|----------|--------|--------|
| P0 | ~12–20 hours | Cascade, JSON v3/legacy round-trip, AI no-write, named `daysInFTE` / reconciliation cases |
| P1 | ~10–18 hours | Excel missing-sheet, Excel export assertions, copy-excludes-rate-card, conversion transaction |
| P2 | ~6–12 hours | Drag-drop component, error-shape, PNG smoke |
| P3 | ~4–10 hours | Playwright smoke **only if** Andrey wants it (install + one spec) |
| **Total** | **~32–60 hours** | ~1.5–3 weeks part-time; ~1 week if focused on P0 only |

---

### 5. Quality gates

| Gate | Threshold | Justification |
|------|-----------|---------------|
| P0 pass rate | **100%** | Money + destructive data |
| P1 pass rate | **≥ 95%** | Standard TEA |
| High-risk (score ≥ 6) | Mitigated **or** waived with owner + expiry | R-08 needs Andrey |
| Line coverage | **Not 80% overall** | Glide/AG Grid/`App.tsx` would force low-value tests. **Instead:** no overall fail gate; **target ≥ 80% lines on `src/utils/calculations.ts`, `modeConversion.ts`, and WBS reconciliation modules** (measure in weekly coverage run) |
| NFR | Evidence identified above; PASS/CONCERNS/FAIL deferred to `nfr-assess` | Missing thresholds stay CONCERNS |
| CI | `typecheck` + `vitest run` green on PR | Already required |
| Isolation | Any new `import './server'` test **must** call `isolateTestDb` | R-02 invariant |

## Step 5: Generate Outputs & Validate

**Execution mode:** `tea_execution_mode=auto`; capability probe found Task subagents, but this step ran **sequential** so architecture, QA, and handoff share one risk-ID set (R-001–R-017). No Playwright CLI sessions opened.

### Outputs

| Document | Path |
| -------- | ---- |
| Architecture | `_bmad-output/test-artifacts/test-design-architecture.md` |
| QA recipe | `_bmad-output/test-artifacts/test-design-qa.md` |
| BMAD handoff | `_bmad-output/test-artifacts/test-design/resource-planner-handoff.md` |

### Checklist (system-level)

- Prerequisites: SPEC used as PRD; architecture.md + architecture-review as ADR substitute — met
- Risk IDs unique R-001–R-017; P×I correct; ≥6 flagged with owner/timeline
- NFR unknowns not guessed; evidence planned; no final PASS/FAIL
- Coverage: one primary level per behavior; P0 = money + destructive data
- Execution: PR = Vitest+typecheck (actual stack); nightly unused; weekly coverage report
- Estimates as ranges; overall 80% coverage gate adjusted (math modules only)
- Architecture doc: no test scripts, no quality-gate section, no test-levels recipe
- QA doc: dependencies after summary; playwright-utils example present; priorities without execution timing
- Handoff: inventory, epic gates, story AC mapping, risk-to-story table
- CLI: no orphaned browsers; artifacts only under `_bmad-output/test-artifacts/`

**Completed by:** Master Test Architect  
**Date:** 2026-08-14  
**Mode:** System-level  





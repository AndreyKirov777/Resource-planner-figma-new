---
workflowStatus: 'complete'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-08-14'
workflowType: 'testarch-test-design'
inputDocuments:
  - 'docs/bmad-archive/test-artifacts/test-design-architecture.md'
  - 'docs/bmad-archive/specs/spec-resource-planner/SPEC.md'
---

# Test Design for QA: Resource planner

**Purpose:** Test execution recipe. What to test, at which level, and what QA needs from Dev.

**Date:** 2026-08-14
**Author:** Master Test Architect
**Status:** Draft
**Project:** Resource planner

**Related:** [test-design-architecture.md](./test-design-architecture.md) for testability and architectural mitigations.

---

## Executive Summary

**Scope:** System-level coverage of CAP-1–CAP-11. Actual runner is **Vitest 4 + Testing Library + supertest** on isolated SQLite. Playwright is optional P3 smoke only (not installed).

**Risk Summary:**

- Total Risks: 17 (9 high ≥6, 6 medium, 2 low)
- Critical categories: BUS (money, WBS, AI) and DATA (isolation, cascade, import)

**Coverage Summary:**

- P0: ~13 · P1: ~12 · P2: ~6 · P3: ~3
- **Total:** ~34 scenarios · remaining effort **~1.5–3 weeks** (1 person, part-time; suite already exists)

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| **Glide/AG Grid cell-edit E2E** | Canvas/virtualization; will flake | Unit math + API persistence; component tests for chrome only |
| **Auth/authz suite** | No auth in SPEC (R-008) | Waiver or future epic |
| **k6 / load tests** | No SLO (R-012) | Do not invent p95 |
| **Multi-tenancy, i18n, realtime collab** | SPEC non-goals | N/A |
| **Live LLM provider in CI** | Non-deterministic, keyed, paid | Injected model only |
| **Goal 3 apply-plan + undo** | Deferred | When built, snapshot must include WBS |
| **Pact/consumer contracts** | Monolith; types mirrored in `api.ts` | Three-definition + `readme.test.ts` |

---

## Dependencies & Test Blockers

### Backend/Architecture Dependencies

Source: Architecture doc Quick Guide. **None block the current Vitest suite.**

1. **R-008 decision** — Andrey — before non-localhost deploy
   - QA needs: waiver text **or** auth story
   - Does not block P0 money/data tests
2. **Keep `isolateTestDb`** — Dev — standing
   - QA needs: new `import './server'` tests always isolate
   - Blocks: any new API test that would hit `dev.db`

### QA Infrastructure Setup

1. **Factories** — already: Prisma seed in `testDb.ts` (2 fake rate-card rows, 2 disciplines). Prefer unique names via timestamp/uuid; no shared `dev.db`.
2. **Environments**
   - Local: `npx vitest run` (globalSetup recreates `prisma/test.db`; API/WBS files use `test-api.db` / `test-wbs.db`)
   - CI: `.github/workflows/ci.yml` — `prisma generate` + `typecheck` + `vitest run`
   - Staging: same Docker/SQLite model; do not run destructive tests against a shared file

If Playwright is added later (`tea_use_playwright_utils` is on in TEA config):

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('create project @p0', async ({ apiRequest }) => {
  const name = `test-${faker.string.uuid()}`;
  const { status, body } = await apiRequest<{ name: string }>({
    method: 'POST',
    path: '/api/projects',
    body: { name },
  });
  expect(status).toBe(201);
  expect(body.name).toBe(name);
});
```

**Today’s equivalent:** supertest against `app` after `await isolateTestDb('api')`. `expect` from Vitest globals.

---

## Risk Assessment

Full register: Architecture doc. QA coverage only here.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Score | QA Test Coverage |
| ------- | -------- | ----------- | ----- | ---------------- |
| **R-001** | BUS | Wrong price/margin/effort | **6** | CAP4-UNIT-001/002 — `calculations.ts` only |
| **R-002** | DATA | Tests write `dev.db` | **6** | META-API-001 — `isolateTestDb` invariant |
| **R-003** | DATA | Cascade / replace / WBS subtree | **6** | CAP1-API-001, CAP5-API-001, CAP11-API-001 |
| **R-004** | DATA | JSON import drops WBS / legacy | **6** | CAP9-API-001/002 |
| **R-005** | BUS | Reconciliation ≠ plan hours | **6** | CAP11-UNIT-001 |
| **R-006** | BUS | `daysInFTE` wrong path | **6** | CAP7-UNIT-001/002 |
| **R-007** | BUS | AI writes or invents roles | **6** | CAP10-API-001/002 |
| **R-008** | SEC | Open API | **6** | No tests until waiver/epic |
| **R-009** | TECH | No browser E2E | **6** | Do not drive grids; optional SMOKE-E2E-001 |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
| ------- | -------- | ----------- | ----- | ---------------- |
| R-010 | DATA | Missing `"RMNG RATES"` sheet | 4 | CAP5-API-002 |
| R-011 | TECH | Prisma/Zod/`api.ts` drift | 4 | VAL-API-001, DOC-UNIT-001 |
| R-012 | PERF | No SLO | 4 | Not planned |
| R-013 | OPS | No health/backup drill | 4 | ERR-API-001 only |
| R-014 | SEC | LLM keys / prompt injection | 4 | No live provider in CI; Zod enum |
| R-015 | BUS | Client view leak | 4 | CAP8-CMP-001 |
| R-016 | TECH | Large App.tsx | 2 | None (backlog) |
| R-017 | OPS | Coverage ungated | 2 | Weekly report, no fail gate |

---

## NFR Test Coverage Plan

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
| ------------ | ----------------------- | ------------------ | ------------ | ----------------- | -------- |
| Data integrity | Cascade, unique keys, round-trip | Isolated SQLite API tests | Vitest/supertest | CI `vitest run` | P0 |
| Security (validation) | `.strict()` Zod | Invalid payload rejected | API | CI | P1 |
| Security (auth) | UNKNOWN | None | — | Waiver or epic | — |
| Performance | UNKNOWN | None | k6 not added | — | P3 blocked |
| Reliability | UNKNOWN | 4xx/5xx JSON `{ error }` | API | CI | P2 |
| Maintainability | typecheck + tests green | CI workflow | GitHub Actions | `.github/workflows/ci.yml` | P1 |
| Maintainability | ≥80% lines on math/reconciliation modules | Weekly coverage run | `@vitest/coverage-v8` | coverage report | P2 |

**Missing:** auth scope, p95, overall coverage fail-gate. Do not assign PASS/CONCERNS/FAIL here.

---

## Entry Criteria

- [ ] Architecture doc reviewed (R-008 decision recorded if deploying beyond localhost)
- [ ] `npx vitest run` and `npm run typecheck` green locally
- [ ] Isolated test DBs (`prisma/test*.db`) gitignored; `dev.db` not used by tests
- [ ] No live `ANTHROPIC_API_KEY` / OpenAI calls in CI
- [ ] New API tests call `isolateTestDb` before importing `server`

## Exit Criteria

- [ ] All P0 tests passing (100%)
- [ ] P1 pass rate ≥ 95% (failures triaged)
- [ ] No open high-severity bugs on money, cascade, or import
- [ ] High-risk (≥6) mitigated or waived (R-008)
- [ ] `calculations.ts` / `modeConversion.ts` / WBS reconciliation remain the home of formula tests

---

## Project Team

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| Andrey | PM / product | R-008, optional SLOs, UAT |
| Dev (same team) | Implementation | Unit + API tests colocated with code |
| Master Test Architect | QA strategy | This plan; ATDD is a separate workflow |

---

## Test Coverage Plan

**P0/P1/P2/P3 = priority and risk, NOT execution timing.** All automated tests run on every PR.

### P0 (Critical)

**Criteria:** Blocks core functionality + high risk (≥6) + no workaround

| Test ID | Requirement | Test Level | Risk Link | Notes |
| ------- | ----------- | ---------- | --------- | ----- |
| CAP4-UNIT-001 | Cost/price/margin/effort golden + non-finite | Unit | R-001 | `calculations.test.ts` only |
| CAP4-UNIT-002 | Margin 0–100 vs 0–1; exchangeRate not inverted | Unit | R-001 | Named cases |
| CAP7-UNIT-001 | Costing: weekly 40h; monthly `daysInFTE×8` | Unit | R-006 | Do not test via UI |
| CAP7-UNIT-002 | Conversion: `daysInFTE/5` always | Unit | R-006 | `modeConversion` |
| CAP11-UNIT-001 | Reconciliation vs `estimatedEffortHours` | Unit | R-005 | Empty WBS / unmatched discipline |
| CAP1-API-001 | DELETE project cascades lists/plans/alloc/WBS | API | R-003 | Isolated DB |
| CAP5-API-001 | Rate-card replace/clear on isolated DB | API | R-002, R-003 | Never `dev.db` |
| CAP3-API-001 | Allocation unique `(plan, period)` | API | R-003 | |
| CAP9-API-001 | JSON v3 round-trip includes WBS; no rate card | API | R-004 | Gap |
| CAP9-API-002 | Legacy v2 + `weeklyAllocations` import | API | R-004 | Gap |
| CAP10-API-001 | generate-plan does not write; empty card 409 | API | R-007 | Injected model |
| CAP10-API-002 | Roles constrained to live rate card | API | R-007 | |
| META-API-001 | `isolateTestDb` on every server import | API | R-002 | Do not regress |

**Total P0:** ~13

### P1 (High)

**Criteria:** Important features + common workflows

| Test ID | Requirement | Test Level | Risk Link | Notes |
| ------- | ----------- | ---------- | --------- | ----- |
| CAP1-API-002 | Create/rename/copy; copy excludes rate card | API | — | |
| CAP2-API-001 | Plan CRUD + reorder | API | — | |
| CAP5-API-002 | Excel import requires `"RMNG RATES"` | API | R-010 | Missing-sheet case |
| CAP6-API-001 | Roster persist; add rate-card role | API | — | |
| CAP7-API-001 | Convert mode in transaction | API | R-006 | Persistence, not formula |
| CAP8-CMP-001 | Client view: no internal cost/margin | Component | R-015 | Have |
| CAP11-API-001 | WBS CRUD; subtree cascade; same-project parent | API | R-003 | Have |
| CAP11-API-002 | Estimate unique; `role=""` not null | API | R-003 | |
| CAP11-API-003 | Discipline enum unless card empty | API | — | |
| VAL-API-001 | `.strict()` rejects id/timestamps | API | R-011 | Have |
| DOC-UNIT-001 | README endpoints match `server.ts` | Unit | R-011 | Have |
| CAP9-API-003 | Excel export phase-grouped financials | API/Unit | R-001 | Assert via export helper if extracted |

**Total P1:** ~12

### P2 (Medium)

**Criteria:** Secondary flows + UI chrome (not math)

| Test ID | Requirement | Test Level | Risk Link | Notes |
| ------- | ----------- | ---------- | --------- | ----- |
| CAP11-CMP-001 | WBS structure edit / row menu | Component | — | Have |
| CAP11-CMP-002 | Drag-drop reorder/reparent | Component | — | Happy path |
| CAP8-CMP-002 | PNG snapshot does not throw | Component | — | |
| ERR-API-001 | 4xx/5xx `{ error }` JSON | API | R-013 | |
| CAP10-API-003 | generate-plan 429 / 422 | API | R-007 | |
| CAP2-CMP-001 | Phases UI | Component | — | Have |

**Total P2:** ~6

### P3 (Low)

**Criteria:** Nice-to-have / exploratory

| Test ID | Requirement | Test Level | Notes |
| ------- | ----------- | ---------- | ----- |
| SMOKE-E2E-001 | Open SPA, select project, see a tab | E2E | Optional Playwright; **no grid editing** |
| PERF-P3-001 | Load test | Perf | Blocked until SLO |
| AUTH-P3-001 | Auth suite | API | Blocked until R-008 |

**Total P3:** ~3 (2 blocked)

**Duplicate-coverage guard:** formulas = unit only; API asserts status + persisted fields; components query role/text, not totals.

---

## Execution Strategy

**Philosophy:** Run everything in PRs if it stays under ~15 minutes. Defer only expensive/long jobs.

### Every PR: Vitest + typecheck (~minutes)

All P0–P2 automated tests (unit, component, API). Parallel workers are Vitest’s, not Playwright shards.

```bash
npm run typecheck
npx vitest run
```

### Nightly

None. No k6. Do not add a Playwright job until SMOKE-E2E-001 is requested.

### Weekly

Optional `npx vitest run --coverage` (report only). Target ≥80% lines on `src/utils/calculations.ts`, `modeConversion.ts`, and WBS reconciliation modules — **not** an overall 80% fail gate (grids/`App.tsx` would force junk tests).

**Manual (not automated):** UAT of grid editing; Docker deploy smoke; R-008 network-exposure review.

---

## QA Effort Estimate

QA/dev test work only (this team implements tests next to code):

| Priority | Count | Effort Range | Notes |
| -------- | ----- | ------------ | ----- |
| P0 | ~13 | ~0.5–1 week | Mostly harden existing; gaps = JSON round-trip + cascade |
| P1 | ~12 | ~0.5–1 week | Missing-sheet, copy excludes card, Excel export |
| P2 | ~6 | ~2–4 days | Drag-drop, error shape, PNG |
| P3 | ~3 | ~1–2 days | Playwright smoke only if requested |
| **Total** | ~34 | **~1.5–3 weeks** | 1 person, part-time; existing suite lowers the floor |

**Assumptions:** isolation fixtures stay; no Playwright install unless P3 is pulled in.

---

## Implementation Planning Handoff

| Work Item | Owner | Target | Notes |
| --------- | ----- | ------ | ----- |
| Harden CAP4/CAP7/CAP11 unit matrices | Dev | This cycle | R-001, R-005, R-006 |
| JSON v3 + legacy import API tests | Dev | This cycle | R-004 gap |
| Cascade + rate-card replace isolation | Dev | This cycle | Confirm CAP1-API-001 |
| Record R-008 waiver or auth epic | Andrey | Before public bind | |
| Optional Playwright smoke | Dev | Optional | framework workflow first |

---

## Tooling & Access

| Tool or Service | Purpose | Access Required | Status |
| --------------- | ------- | --------------- | ------ |
| Vitest 4 + Testing Library + supertest | Functional suite | Local + CI | Ready |
| Isolated SQLite `prisma/test*.db` | API isolation | Gitignored files | Ready |
| GitHub Actions CI | typecheck + vitest | Repo Actions | Ready |
| Playwright + playwright-utils | Optional P3 smoke | Not installed | Pending |
| k6 | Performance | Not used | N/A until SLO |
| LLM provider keys | Live generation | `.env` only | Must not be in CI tests |

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope | Validation Steps |
| ----------------- | ------ | ---------------- | ---------------- |
| **`calculations.ts`** | Used by plan, WBS, AI, export | All CAP4 unit tests | `vitest` path filter |
| **`server.ts` + Zod** | New WBS/AI routes | `api.integration`, `wbs.integration`, `server-validation`, `readme.test` | Full `vitest run` |
| **`api.ts` types** | Three-definition rule | Compile + validation tests | `typecheck` |
| **ResourcePlan / ClientView** | Grids | Component tests only | Do not add E2E cell tests |
| **GlobalRateCard** | Shared singleton | Isolated DB replace tests | Never against `dev.db` |

**Regression:** PR CI must stay green. WBS work must not skip CAP-4 unit tests.

---

## Appendix A: Code Examples & Tagging

Prefer Vitest `describe`/`it` colocated with source. If Playwright is added:

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';

test('@P0 @API generate-plan does not persist', async ({ apiRequest }) => {
  const { status } = await apiRequest({
    method: 'POST',
    path: '/api/projects/generate-plan',
    body: { mode: 'new', prompt: 'x', region: 'easternEurope' },
  });
  expect([409, 201, 200]).toContain(status);
});
```

Selective Vitest:

```bash
npx vitest run src/utils/calculations.test.ts
npx vitest run api.integration.test.ts wbs.integration.test.ts
```

---

## Appendix B: Knowledge Base References

- `risk-governance.md` — scoring and gates
- `probability-impact.md` — P×I scale
- `test-levels-framework.md` — unit vs API vs E2E
- `test-priorities-matrix.md` — P0–P3
- `nfr-criteria.md` — NFR planning (no final evidence grade)
- `test-quality.md` — no hard waits, isolation, explicit assertions
- `adr-quality-readiness-checklist.md` — testability criteria

---

**Generated by:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0 (BMad v6)

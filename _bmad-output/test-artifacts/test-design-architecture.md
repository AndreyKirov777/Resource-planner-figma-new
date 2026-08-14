---
workflowStatus: 'complete'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-08-14'
workflowType: 'testarch-test-design'
inputDocuments:
  - '_bmad-output/specs/spec-resource-planner/SPEC.md'
  - 'docs/architecture.md'
  - 'docs/architecture-review.md'
  - 'docs/integration-architecture.md'
  - '_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md'
  - '_bmad-output/project-context.md'
---

# Test Design for Architecture: Resource planner

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture/Dev. Contract with QA on what must stay true so tests remain cheap and deterministic.

**Date:** 2026-08-14
**Author:** Master Test Architect
**Status:** Architecture Review Pending
**Project:** Resource planner
**PRD Reference:** `_bmad-output/specs/spec-resource-planner/SPEC.md` (used as FR/NFR contract; no separate PRD)
**ADR Reference:** `docs/architecture.md`, `docs/architecture-review.md`, SPEC Constraints (no formal ADR set)

**Companion:** [test-design-qa.md](./test-design-qa.md)

---

## Executive Summary

**Scope:** System-level testability of the brownfield Resource Planner (CAP-1–CAP-10 plus CAP-11 WBS). Not a WBS-only epic plan.

**Business Context:**

- **Revenue/Impact:** Internal presale/delivery tool. Wrong cost/margin/effort is the product-failure mode.
- **Problem:** Produce a defensible, costed staffing plan (and now a WBS second estimate) without spreadsheet drift.
- **GA Launch:** Product already in use; this design covers the current system including WBS.

**Architecture:**

- React 18 SPA → `src/services/api.ts` → Express 5 `server.ts` → Prisma/SQLite
- Money/effort only in `src/utils/calculations.ts` (shared by both tiers)
- Global `GlobalRateCard`; WBS tree + estimates; AI draft is read-only until accept
- No auth; open CORS; single SQLite writer

**Expected Scale:** Single-user / internal. No RPS or multi-tenant targets. SQLite file DB is a product constraint.

**Risk Summary:**

- **Total risks:** 17
- **High-priority (≥6):** 9
- **Test effort:** see QA doc (~32–60 hours remaining; Vitest already in CI)

---

## Quick Guide

### BLOCKERS - Team Must Decide

No pre-implementation blockers for the existing Vitest/supertest suite. Isolation (`isolateTestDb`) and CI (`typecheck` + `vitest run`) already exist.

**Product decision that changes the security test plan:**

1. **R-008 Open API** — Accept unauthenticated access as residual risk for localhost/internal, or schedule an auth epic. Tests cannot patch an open API. (Andrey)

### HIGH PRIORITY - Team Should Validate

1. **R-001 / ASR-1** — Keep all money/effort math in `calculations.ts`; never re-implement in UI, export, or WBS. (Dev)
2. **R-002** — CI and any `import './server'` test must keep using throwaway SQLite (`test-api.db` / `test-wbs.db`). Live `dev.db` data loss already happened. (Dev)
3. **R-003 / ASR-5** — Cascade delete (project and WBS subtree) and rate-card bulk replace stay destructive and explicit. (Dev)
4. **R-004 / ASR-7** — JSON `schemaVersion: 3` must round-trip WBS; rate card stays excluded; legacy v2 / `weeklyAllocations` still import. (Dev)
5. **R-006 / ASR-4** — `daysInFTE` dual semantics: costing weekly=40h, monthly=`daysInFTE×8`; conversion always `daysInFTE/5`. (Dev)
6. **R-007 / ASR-6** — `POST /api/projects/generate-plan` remains non-persisting; roles from live rate card only. (Dev)

### INFO ONLY

1. **Test strategy:** Unit for math; API/supertest for persistence and cascades; component tests for Client View / WBS chrome. No Glide cell-edit E2E.
2. **Tooling:** Vitest 4 + Testing Library + supertest (actual). Playwright is optional P3 smoke only.
3. **CI:** Every PR runs typecheck + full Vitest. No k6 until an SLO exists.
4. **Coverage:** ~34 scenarios P0–P3; details in QA doc.
5. **Two grids:** Glide vs AG Grid is accepted; do not add a third library to make E2E easier.

---

## For Architects and Devs - Open Topics

### Risk Assessment

**Total risks identified:** 17 (9 high ≥6, 6 medium, 2 low)

#### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | - | - | ----- | ---------- | ----- | -------- |
| **R-001** | **BUS** | Wrong client price/margin/effort (unit mismatch or duplicated math) | 2 | 3 | **6** | Single module + golden unit tests | Dev | This cycle |
| **R-002** | **DATA** | Tests/scripts write live `prisma/dev.db` | 2 | 3 | **6** | `isolateTestDb` invariant; CI never uses `dev.db` | Dev | Keep (already started) |
| **R-003** | **DATA** | Cascade delete / rate-card replace / WBS subtree delete | 2 | 3 | **6** | Preserve cascade contracts; API tests on isolated DB | Dev | This cycle |
| **R-004** | **DATA** | JSON export/import drops WBS or corrupts legacy allocations | 2 | 3 | **6** | v3 round-trip + legacy import in API tests | Dev | This cycle |
| **R-005** | **BUS** | WBS reconciliation disagrees with `estimatedEffortHours` | 2 | 3 | **6** | Engine must call `calculations.ts` | Dev | This cycle |
| **R-006** | **BUS** | `daysInFTE` applied on the wrong path | 2 | 3 | **6** | Keep dual-path constraint; named unit matrix | Dev | This cycle |
| **R-007** | **BUS** | AI draft persists or invents off-card roles | 2 | 3 | **6** | Endpoint stays read-only; enum from live card | Dev | This cycle |
| **R-008** | **SEC** | Unauthenticated API can read/delete all projects | 3 | 2 | **6** | Waive for internal **or** auth epic | Andrey | Before non-localhost deploy |
| **R-009** | **TECH** | No browser E2E; grids hostile to cell-level UI tests | 3 | 2 | **6** | Do not E2E-edit Glide cells; API+unit for journeys | QA (see QA doc) | After this design |

#### Medium-Priority Risks (Score 3–5)

| Risk ID | Category | Description | P | I | Score | Mitigation | Owner |
| ------- | -------- | ----------- | - | - | ----- | ---------- | ----- |
| R-010 | DATA | Excel import without `"RMNG RATES"` | 2 | 2 | 4 | Fail/empty-card behavior stays testable | Dev |
| R-011 | TECH | Prisma / Zod / `api.ts` field drift | 2 | 2 | 4 | Three-definition rule; `readme.test.ts` for routes | Dev |
| R-012 | PERF | Large plan/WBS latency — no SLO | 2 | 2 | 4 | Do not invent p95; set a number or leave ungated | Andrey |
| R-013 | OPS | No `/api/health`; backup restore untested | 2 | 2 | 4 | Optional; product is single-file SQLite | Ops |
| R-014 | SEC | LLM keys in `.env`; prompt injection | 2 | 2 | 4 | Keys stay gitignored; output Zod-constrained | Dev |
| R-015 | BUS | Client view leaks internal cost/margin | 2 | 2 | 4 | Keep component assertions (QA doc) | Dev |

#### Low-Priority Risks (Score 1–2)

| Risk ID | Category | Description | P | I | Score | Action |
| ------- | -------- | ----------- | - | - | ----- | ------ |
| R-016 | TECH | Large `App.tsx` / serial PUTs | 2 | 1 | 2 | Document (architecture-review items 7–8) |
| R-017 | OPS | Coverage ungated in CI | 2 | 1 | 2 | Weekly report; no overall 80% fail gate |

#### Risk Category Legend

- **TECH**: architecture/integration · **SEC**: access/exposure · **PERF**: latency/load · **DATA**: loss/corruption · **BUS**: wrong business numbers · **OPS**: deploy/monitor

---

### NFR Testability Requirements

| NFR Category | Threshold / Requirement | Current Design Support | Gap / Decision Needed | Planned Evidence |
| ------------ | ----------------------- | ---------------------- | --------------------- | ---------------- |
| Security | AuthN/AuthZ | None (open CORS) | R-008 waive or epic | Waiver **or** future auth tests |
| Security | Injection / secrets | Zod `.strict()` + Prisma; `.env` gitignored | None for baseline | `server-validation` tests |
| Performance | Latency/throughput | Unknown | **UNKNOWN** — no p95 | No k6 until a number exists |
| Reliability | Health / RTO / retries | Per-route try/catch only | **UNKNOWN** | 4xx/5xx JSON shape; no fake health tests |
| Maintainability | Typecheck + tests in CI | Present; coverage % ungated | Overall 80% not justified for grids | CI log; ≥80% on `calculations.ts` / `modeConversion.ts` / WBS reconciliation |
| Data integrity | Cascade, unique keys, export round-trip | Designed | Keep contracts | Isolated-DB API tests |
| Scalability | Horizontal scale | Out of scope (SQLite) | N/A | N/A |

**Unknown thresholds:** performance SLO; auth in-scope; coverage fail-gate %. Do not guess. Final PASS/CONCERNS/FAIL is `nfr-assess`.

---

### Testability Concerns and Architectural Gaps

#### 1. Blockers to Fast Feedback

No architecture change is required to keep writing Vitest/API tests. Seeding is Prisma in `testDb.ts` (acceptable for this monolith).

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
| ------- | ------ | ------------------------------ | ----- | -------- |
| **Observability is console-only** | Cannot use logs/metrics as NFR evidence | Optional `/api/health` + structured errors if ops wants reliability evidence | Dev/Ops | Optional |
| **Glide/AG Grid** | Cell E2E will flake | Do **not** add a third grid or cell-level test hooks | Arch | Standing |

#### 2. Architectural Improvements Needed

1. **Keep `isolateTestDb` as a hard invariant**
   - **Current problem:** Live `dev.db` was wiped by integration tests.
   - **Required change:** Any new `import './server'` test calls `isolateTestDb` first. CI must not set `DATABASE_URL` to `dev.db`.
   - **Impact if not fixed:** Repeat data loss.
   - **Owner:** Dev · **Timeline:** Standing

2. **Do not duplicate money math**
   - **Current problem:** Export/WBS/AI could re-derive margin.
   - **Required change:** Call `calculations.ts` only.
   - **Impact if not fixed:** R-001/R-005 silent money bugs.
   - **Owner:** Dev · **Timeline:** Standing

---

### Testability Assessment Summary

#### What Works Well

- Headless REST for all writes; business logic is not UI-only
- Pure, shared `calculations.ts` / `modeConversion.ts`
- `.strict()` Zod + `readme.test.ts` route drift gate
- Per-file throwaway SQLite for API/WBS integration
- LLM planner accepts an injected model (CI must never call a live provider)

#### Accepted Trade-offs

- No auth (R-008) until Andrey decides
- Two grid libraries; no E2E cell editing
- No seeding HTTP API (Prisma in tests is enough)
- No health/metrics until ops asks
- `prisma/dev.db` remains git-tracked — do not commit test-data churn

---

### Risk Mitigation Plans (High-Priority Risks ≥6)

Production/architecture only. QA verification IDs: [test-design-qa.md](./test-design-qa.md).

| ID | Strategy | Owner | Timeline | Status | Verification |
| -- | -------- | ----- | -------- | ------ | ------------ |
| R-001 | `calculations.ts` only; margin 0..1 inside vs 0–100 persisted; `exchangeRate` = client-per-USD | Dev | Standing | In progress | CAP4-UNIT-* |
| R-002 | Keep `testDb.ts`; no test targets `dev.db`; do not commit test-data `dev.db` | Dev | Standing | Complete (do not regress) | META-API-001 |
| R-003 | Keep `onDelete: Cascade` and atomic rate-card replace | Dev | This cycle | Planned | CAP1/5/11-API-001 |
| R-004 | JSON `{ schemaVersion: 3 }` includes WBS; exclude rate card; accept v2 + `weeklyAllocations` | Dev | This cycle | Planned | CAP9-API-001/002 |
| R-005 | Reconciliation aggregates `estimatedEffortHours`; no second hours formula | Dev | This cycle | Planned | CAP11-UNIT-001 |
| R-006 | Do not unify `daysInFTE`: costing vs conversion stay different | Dev | Standing | In progress | CAP7-UNIT-001/002 |
| R-007 | `generate-plan` never writes; empty card 409; live rate-card enum; injected model in tests | Dev | Standing | In progress | CAP10-API-001/002 |
| R-008 | Waive for internal/localhost **or** auth epic. Do not bind untrusted networks | Andrey | Before non-localhost deploy | Planned | Waiver or epic |
| R-009 | QA-owned. Arch: no third grid, no cell-level test APIs | QA | After this design | Planned | QA doc |
---

### Assumptions and Dependencies

#### Assumptions

1. SPEC.md is the FR/NFR contract (no PRD).
2. Tool remains internal/single-user unless R-008 is reversed.
3. Playwright is not required to close P0/P1.
4. Performance and coverage % stay ungated until Andrey sets numbers.
5. Goal 3 (apply-plan + undo) stays deferred; when built, snapshots must include WBS.

#### Dependencies

1. Andrey: R-008 waive vs auth — before any non-localhost deploy
2. Dev: keep isolation invariant — standing

#### Risks to Plan

- **Risk:** Treating this as a WBS-only epic plan
  - **Impact:** CAP-4 money math and export round-trip get under-tested
  - **Contingency:** This document is system-level; run a separate epic-level design for WBS UI if needed

---

**End of Architecture Document**

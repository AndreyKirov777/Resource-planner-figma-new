---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-map-criteria
  - step-04-analyze-gaps
  - step-05-gate-decision
lastStep: step-05-gate-decision
lastSaved: '2026-08-27'
workflowType: testarch-trace
coverageBasis: acceptance_criteria
oracleConfidence: high
oracleResolutionMode: formal_requirements
oracleSources:
  - _bmad-output/specs/spec-resource-planner/SPEC.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md
  - _bmad-output/specs/spec-roadmap/SPEC.md
  - _bmad-output/implementation-artifacts/deferred-work.md
  - _bmad-output/test-artifacts/test-design-qa.md
externalPointerStatus: not_used
collectionStatus: COLLECTED
sourceSha: 7075f3bc94e7c89b5f37304a78ac6c5fa454d3dc
tempCoverageMatrixPath: /tmp/tea-trace-coverage-matrix-2026-08-27T090000.json
gateType: release
decisionMode: deterministic
collectionMode: contract_static
---

# Traceability Matrix & Gate Decision - Resource planner v1 as shipped

**Target:** Resource planner v1 as shipped (product + WBS + Roadmap A/B)
**Date:** 2026-08-27
**Evaluator:** Murat (TEA) for Andrey
**Coverage Oracle:** acceptance_criteria
**Oracle Confidence:** high
**Oracle Sources:** product SPEC, WBS change proposal, roadmap SPEC
**Commit under trace:** `7075f3bc94e7c89b5f37304a78ac6c5fa454d3dc`
**Branch:** `feat/wbs-schedule-gantt`

This workflow does not generate tests. Gaps → `bmad-testarch-atdd` or `bmad-testarch-automate`. Spec drift → `bmad-correct-course`.

---

## Step 1 — Coverage oracle

### Scope lock (Andrey, 2026-08-27)

**In scope:** product CAP-1–CAP-10, WBS CAP-11 (change proposal + shipped `spec-wbs-*`), roadmap CAP-1–CAP-12 (slices A/B), SPEC Constraints that are testable.

**Out of scope (do not fail the gate):**

| Item | Why |
| --- | --- |
| Roadmap CAP-13 | Frozen 2026-08-22; implementation exists, entry point disabled on purpose |
| Goal 3 (apply-plan + undo) | Deferred |
| `WbsItem.notes` | Split out, not shipped |
| Roadmap Slice C | Only on request |
| `spec-wbs-schedule` | Superseded 2026-08-21 |

**Known spec drift (not a missing feature):** product SPEC still says AI is “planned/unbuilt” and JSON `schemaVersion: 3`. Code has shipped AI Goals 1a/1b/2 and export is `schemaVersion: 4` (roadmap arm). Amend the SPEC; do not treat as an app defect.

### Oracle metadata

| Key | Value |
| --- | --- |
| coverageBasis | `acceptance_criteria` |
| oracleResolutionMode | `formal_requirements` |
| oracleConfidence | `high` |
| externalPointerStatus | `not_used` |
| collectionMode | `contract_static` |
| gateType | `release` (full-app correspondence, not a single story) |

Formal SPECs with explicit success criteria exist, so synthetic journeys were not used.

### Criterion inventory (34 in-scope)

**Product (`spec-resource-planner`)**

| ID | Criterion | Priority |
| --- | --- | --- |
| RP-1 | Project lifecycle & settings (create/open/rename/copy/delete, URL restore) | P1 |
| RP-2 | Resource plan authoring (rows, rates, phases, reorder) | P1 |
| RP-3 | Per-period allocation persistence and totals | P1 |
| RP-4 | Real-time costing & margin via `calculations.ts` only | P0 |
| RP-5 | Global rate card import/edit/clear | P0 |
| RP-6 | Resource roster | P1 |
| RP-7 | Weekly ↔ monthly conversion (`daysInFTE / 5`) | P1 |
| RP-8 | Client-facing view (no internal cost/margin) | P1 |
| RP-9 | Export/import Excel + JSON + PNG | P1 |
| RP-10 | AI draft plan generation (draft not persisted until accept) | P1 |

**WBS (change proposal CAP-11)**

| ID | Criterion | Priority |
| --- | --- | --- |
| WBS-1 | WBS tree CRUD + API | P1 |
| WBS-2 | Hours estimates by discipline (+ optional role) | P0 |
| WBS-3 | Independent estimates + variance report | P0 |
| WBS-4 | WBS round-trips in project JSON export/import | P1 |
| WBS-5 | Structure edit (keyboard + drag-drop) with cycle guards | P1 |

**Roadmap (`spec-roadmap` CAP-1–12)**

| ID | Criterion | Priority |
| --- | --- | --- |
| RM-1 | Roadmap tab + empty state | P1 |
| RM-2 | Lanes, items, milestones persist | P1 |
| RM-3 | Period timeline in project units | P1 |
| RM-4 | Pointer/keyboard snap-and-commit | P1 |
| RM-5 | N:1 WBS scope linking, unique leaf attribution | P0 |
| RM-6 | Bars labelled with hours/FTE, no progress | P2 |
| RM-7 | Coverage recon (unplaced / empty / phase mismatch) | P1 |
| RM-8 | Demand engine + WBS-3 total invariant | P0 |
| RM-9 | Over-demand stripe + load strip | P1 |
| RM-10 | By-period matrix agrees with stripe and strip | P0 |
| RM-11 | Side-panel item editor | P1 |
| RM-12 | Bootstrap roadmap from WBS | P1 |

**Constraints**

| ID | Criterion | Priority |
| --- | --- | --- |
| NFR-1 | Money/effort math only in `calculations.ts` | P0 |
| NFR-2 | Components never `fetch`; all I/O via `api.ts` | P2 |
| NFR-3 | Every write uses `.strict()` Zod | P1 |
| NFR-4 | Three aligned definitions (Prisma / Zod / `api.ts`) | P1 |
| NFR-5 | Two grids, never mixed | P2 |
| NFR-6 | `daysInFTE`: weekly 40h, monthly `× 8`; conversion ` / 5` | P0 |
| NFR-7 | Tests never touch `prisma/dev.db` | P0 |

### Supporting artifacts found

- TEA system test design (2026-08-14) — **stale for roadmap**; still valid for money/data isolation
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-resource-planner-2026-06-30/` (AI generation only)
- Implementation specs: all `spec-wbs-*` and shipped roadmap specs `status: done` except `spec-roadmap-lane-summary-bars.md` still says `planned` while git shows it landed (`0d8b2e1`)
- `docs/architecture.md`, `docs/api-contracts.md`, `_bmad-output/project-context.md`

---

## Step 2 — Test inventory

**Search root:** repo (workflow `test_dir` is `{project-root}/tests`, which does not exist; tests live next to source). 41 files, **805** `it`/`test` cases. No `test.skip` / `test.only` / `fixme`.

### By level

| Level | Files (representative) | Cases (approx) |
| --- | --- | --- |
| E2E | none (Playwright not installed) | 0 |
| API | `api.integration.test.ts`, `wbs.integration.test.ts`, `roadmap.integration.test.ts` | 83 |
| Component | `*.test.tsx` (App, ResourcePlan, Wbs, Roadmap, RolesEditor, …) | ~213 |
| Unit | `src/utils/*`, `server/planner/*`, `server/llm/*`, `server-validation.test.ts`, `readme.test.ts` | ~509 |
| Live | `_bmad-output/test-artifacts/live-verification-results.json` **absent** | 0 |

```json
{
  "present": false,
  "results_file": "_bmad-output/test-artifacts/live-verification-results.json",
  "source_sha": "",
  "observed_at": "",
  "producer": "",
  "read_error": "",
  "current_source_sha": "7075f3bc94e7c89b5f37304a78ac6c5fa454d3dc"
}
```

Live records: `[]`. Collection status: `COLLECTED` (static suite readable).

### Coverage heuristics inventory

**API endpoints in `server.ts` (47) vs direct API tests**

Exercised in integration files: projects CRUD (partial), rate-cards bulk/list/delete/meta, resource-plans create/list, WBS CRUD + estimates + export/import, roadmap lanes/items/links/bulk/reorder/`startDate`.

**No direct API test found:**

- `POST /api/projects/:id/copy`
- `POST /api/projects/:id/convert-planning-mode`
- `POST /api/projects/generate-plan`
- Allocation CRUD (`GET/POST/PUT/DELETE` allocations) — only a thin “weekly allocations” block in `api.integration.test.ts`
- Resource-list CRUD (individual PUT/DELETE)
- `PUT /api/projects/:projectId/resource-plans/reorder`
- `GET /api/projects/:id` (single-project get)

**Auth/authz:** not in SPEC (non-goal). Negative-path auth: not applicable.

**Error-path:** Zod `.strict()` well covered (`server-validation.test.ts` 75 cases). Happy-path-only risk on conversion, copy, generate-plan UI, client view chrome.

**UI journeys:** no Playwright E2E. Component tests cover WBS, Roadmap keyboard, reconciliation, RolesEditor. `GeneratePlanSheet` has **no** component test.

---

## Step 3 — Requirements → tests

**FULL** on this stack means the success line is proven at the right level (unit for pure math, API for persistence, component for UI chrome). Playwright E2E is not required — TEA 2026-08-14 already waived Glide/AG Grid cell-edit E2E as flake-prone.

### Coverage summary

| Priority | Total | FULL | Coverage % | Status |
| --- | --- | --- | --- | --- |
| P0 | 10 | 10 | 100% | PASS |
| P1 | 21 | 15 | 71% | FAIL (gate needs 80% FULL; target 90%) |
| P2 | 3 | 0 | 0% | informational |
| P3 | 0 | 0 | — | — |
| **Total** | **34** | **25** | **74%** | **FAIL** (overall minimum 80%) |

### Detailed mapping

#### RP-4: Real-time costing & margin (P0) — FULL

- **Tests:** `src/utils/calculations.test.ts` (20) — `hoursPerPeriod`, margin 0..1 vs 0–100, exchangeRate, divide-by-zero guards
- **Endpoints:** n/a (pure module)
- **Error-path:** yes (non-finite / zero)
- **Gaps:** none for the math contract

#### RP-5: Global rate card (P0) — FULL

- **Tests:** `api.integration.test.ts` “Global rate card”; `src/components/RateCard.test.tsx`; `server/planner/rateCard.test.ts` (taxonomy)
- **Endpoints:** `POST /api/rate-cards/bulk`, `GET /api/rate-cards`, `DELETE /api/rate-cards`, meta
- **Gaps:** Excel `"RMNG RATES"` sheet parsing is not a dedicated unit test (import goes through bulk API)

#### WBS-2: Hours estimates (P0) — FULL

- **Tests:** `wbs.integration.test.ts` estimates replace; `src/components/RolesEditor.test.tsx` (46); `src/utils/wbsGrid.test.ts`
- **Error-path:** invalid hours, race, empty roster/rate card

#### WBS-3: Reconciliation (P0) — FULL

- **Tests:** `src/utils/wbs.test.ts`; `src/components/ReconciliationPanel.test.tsx`; `src/components/Wbs.test.tsx` reconciliation strip
- **Error-path:** Unassigned / Unmapped buckets

#### RM-5: Scope linking (P0) — FULL

- **Tests:** `roadmap.integration.test.ts` (project invariant, milestone refused, link move, cascade); `src/utils/roadmap.test.ts` `itemEffort` / carved-out subtree; `src/components/Wbs.roadmap.test.tsx`
- **Error-path:** 400 on duplicate leaf, milestone scope

#### RM-8: Demand engine (P0) — FULL

- **Tests:** `src/utils/roadmapLoad.test.ts` — empty, phase baseline, overlap, carved-out, unmapped, unplaceable, WBS-3 invariant, residual `feasiblePeriods` (matches SPEC delivery list)

#### RM-10: By-period matrix agrees cell-for-cell (P0) — FULL

- **Tests:** `roadmapLoad.test.ts` `buildByPeriodMatrix`; `src/components/roadmap/Roadmap.test.tsx` “Done-means cross-check”

#### NFR-1: `calculations.ts` single source (P0) — FULL

- **Tests:** `calculations.test.ts`; ClientView consolidation comment + tests import the same helpers

#### NFR-6: `daysInFTE` semantics (P0) — FULL

- **Tests:** `calculations.test.ts` weekly stays 40 regardless of `daysInFTE`; monthly scales `× 8`

#### NFR-7: Tests never touch `dev.db` (P0) — FULL

- **Tests:** `testDb.ts` / `globalSetup.ts` isolation; `wbs.integration.test.ts` / `api.integration.test.ts` / `roadmap.integration.test.ts` all `isolateTestDb` before `import('./server')`
- **Note:** deferred-work still flags concurrent `vitest run` on one checkout and residual `api.integration.test.ts` flake — isolation exists; it is not proven race-free

#### RP-2: Plan authoring (P1) — FULL

- **Tests:** `src/components/ResourcePlan.test.tsx`; `src/components/ResourcePlanPhases.test.tsx`; `api.integration.test.ts` resource-plans

#### RP-3: Allocations (P1) — FULL

- **Tests:** ResourcePlan component; `api.integration.test.ts` weekly allocations; `phases.test.ts` remap
- **Gaps:** individual allocation CRUD endpoints thinly covered (see heuristics)

#### RP-6: Resource roster (P1) — FULL

- **Tests:** `src/components/ResourceList.test.tsx` (4)

#### RP-9: Export/import (P1) — FULL

- **Tests:** `wbs.integration.test.ts` JSON round-trip (`schemaVersion` **4**); `src/App.test.tsx` Excel; `src/components/ClientView.test.tsx` PNG
- **Spec drift:** product SPEC still says `schemaVersion: 3`

#### WBS-1 / WBS-4 / WBS-5 (P1) — FULL

- **Tests:** `wbs.integration.test.ts` (47); `src/components/Wbs.test.tsx` (47); `wbsTree.test.ts` cycle walkers; `wbsGrid.test.ts` indent/outdent/drop

#### RM-1, RM-2, RM-3, RM-4, RM-7, RM-9, RM-12 (P1) — FULL

- **Tests:** `Roadmap.test.tsx` (empty/bootstrap, keyboard CAP-4, stripe, load strip, lane bars); `roadmap.integration.test.ts`; `roadmap.test.ts` (bootstrap, coverage, conversion remap); `roadmapGeometry.test.ts` (`snapDrag`, phase bands, zoom)

#### NFR-3: `.strict()` Zod (P1) — FULL

- **Tests:** `server-validation.test.ts` (75); WBS Zod block in `wbs.integration.test.ts`

#### RP-1: Project lifecycle (P1) — PARTIAL

- **Tests:** `api.integration.test.ts` GET/POST/PUT projects; `src/App.test.tsx`
- **Missing:** `POST /copy`; delete-cascade of all entity types in one test; `?project=` URL restore (no E2E/component)

#### RP-7: Weekly ↔ monthly conversion (P1) — UNIT-ONLY

- **Tests:** `convertPlanningModeSchema` in `server-validation.test.ts` only
- **Missing:** `src/utils/modeConversion.ts` has **no** unit file; `POST /convert-planning-mode` has **no** integration test; roadmap remap of conversion is covered in `roadmap.test.ts` / `ResourcePlanPhases.test.tsx` (phase change), not mode conversion itself

#### RP-8: Client view (P1) — PARTIAL

- **Tests:** PNG export only (`ClientView.test.tsx`)
- **Missing:** assertion that internal cost/margin are not shown in the view chrome

#### RP-10: AI draft generation (P1) — PARTIAL

- **Tests:** `generateResourcePlan.test.ts` (18); `generatePlanRequestSchema`; `server/llm/*`; `rateCard.test.ts`
- **Missing:** `POST /api/projects/generate-plan` integration; `GeneratePlanSheet` component test (preview in real grid, accept/discard)

#### RM-11: Item editor (P1) — PARTIAL

- **Tests:** `RoadmapEditorPanel.test.tsx` (4) — read-only demand block
- **Missing:** blur-save, failed-save revert, scope picker ownership display

#### NFR-4: Three aligned definitions (P1) — PARTIAL

- **Tests:** `readme.test.ts` (route list vs README)
- **Missing:** Prisma ↔ Zod ↔ `api.ts` field alignment is convention-only

#### RM-6: Bars carry effort (P2) — PARTIAL

- **Tests:** `roadmap.test.ts` `itemEffort`; bar labels implied in Roadmap tests
- **Missing:** explicit “no progress affordance” assertion

#### NFR-2: no `fetch` from components (P2) — NONE

- No lint or test forbids component-level `fetch`

#### NFR-5: two grids never mixed (P2) — NONE

- No test that ResourcePlan/ClientView stay on Glide and RateCard/ResourceList on AG Grid

#### RM-13: Draft plan from roadmap — OUT OF SCOPE (frozen)

- **Tests exist** asserting the button stays disabled (`Roadmap.test.tsx` CAP-13). Counted as waived, not a gap.

---

## Step 4 — Gap analysis

**Execution mode:** sequential (evidence already collected in-process; fan-out would re-read the same files).

### Critical gaps (P0 NONE) — 0

No P0 criterion is uncovered. Do not block on missing P0 *tests*.

### High-priority gaps (P1 NONE) — 0

P1 holes are PARTIAL / UNIT-ONLY, not empty.

### P1 incomplete (treat as gate pressure)

1. **RP-7 conversion** — UNIT-ONLY. Highest real risk: money-adjacent period rewrite with no API test.
2. **RP-10 generate-plan** — planner unit tests are strong; the HTTP seam and UI sheet are untested.
3. **RP-1 copy** — copy is in the CAP success line; endpoint untested.
4. **RP-8 client view chrome** — PNG ≠ “client does not see margin”.
5. **RM-11 editor** — demand block only.
6. **NFR-4** — route-list drift test only.

### P2 / optional

- NFR-2, NFR-5: convention, no automated guard
- RM-6: label/progress affordance

### Heuristic findings

- Endpoints without direct API tests: **7+** (copy, convert-planning-mode, generate-plan, allocation CRUD, resource-list CRUD, plan reorder, GET project by id)
- Auth negative-path gaps: **0** (not applicable)
- Happy-path-only criteria: RP-1, RP-7, RP-8, RP-10, RM-11
- UI journeys without E2E: entire app (accepted for this stack)
- Live-only requirements: **0**

### Duplicate coverage (acceptable)

Defense in depth on RM-5/RM-8/RM-10 (unit engine + component cross-check + API persistence) is intended, not waste.

### Recommendations

| Priority | Action | IDs |
| --- | --- | --- |
| HIGH | Add API tests for `copy`, `convert-planning-mode`, `generate-plan` | RP-1, RP-7, RP-10 |
| HIGH | Add `modeConversion.ts` unit tests (weeksPerMonth, allocation remap) | RP-7, NFR-6 |
| MEDIUM | Component-test `GeneratePlanSheet` draft preview + accept/discard | RP-10 |
| MEDIUM | ClientView: assert internal cost/margin absent | RP-8 |
| MEDIUM | Expand `RoadmapEditorPanel` (blur-save, revert, scope picker) | RM-11 |
| MEDIUM | Amend product SPEC (`schemaVersion` 4, AI shipped, CAP-13 frozen) | spec drift |
| LOW | `bmad-testarch-test-review` on `api.integration.test.ts` flake noted in deferred-work | NFR-7 |
| LOW | Optional: eslint ban on `fetch(` in `src/components` | NFR-2 |

---

## Phase 1 statistics

- Total in-scope criteria: **34**
- Fully covered: **25** (74%)
- Partially covered: **6**
- Unit-only: **1** (RP-7)
- Uncovered: **2** (NFR-2, NFR-5 — both P2)
- P0: 10/10 FULL (100%)
- P1: 15/21 FULL (71%)
- P2: 0/3 FULL (0%)
- Test files: 41 · cases: 805 · skipped/fixme/pending: 0
- Live evidence: not present

---

## PHASE 2: QUALITY GATE DECISION

**Gate Type:** release
**Decision Mode:** deterministic
**Collection:** COLLECTED → gate eligible

### Evidence summary

- Static suite: 805 cases, 0 skipped
- Test results source: **not executed in this run** (trace is contract-static mapping, not a CI pass-rate)
- NFR audit skill: not run (`NOT_ASSESSED` as a TEA NFR workflow)
- Burn-in / flakiness: not measured; deferred-work records intermittent `api.integration.test.ts` failures in full-suite runs

### Decision criteria

| Criterion | Threshold | Actual | Status |
| --- | --- | --- | --- |
| P0 FULL coverage | 100% | 100% | PASS |
| Overall FULL coverage | ≥ 80% | 74% | FAIL |
| P1 FULL coverage | ≥ 80% min / 90% target | 71% | FAIL |

### GATE DECISION: FAIL

**Rationale:** P0 money, reconciliation, demand, and isolation criteria are fully evidenced. Overall FULL coverage is 74% (minimum 80%) and P1 FULL coverage is 71% (minimum 80%). The misses are concentrated: weekly/monthly conversion has no API or `modeConversion` unit tests; project copy and `generate-plan` HTTP/UI are untested; client-view and roadmap editor success lines are only partly proven.

This FAIL is a **test-evidence gate**, not a finding that WBS or Roadmap A/B are unimplemented. Shipped implementation specs are `done`. It does **not** mean “the app does not match the SPEC.” It means “we cannot *prove* every in-scope success line from the suite.”

**Do not confuse with product gaps:** CAP-13 frozen, Goal 3, notes, Slice C are out of scope and were not scored.

### Critical issues (coverage)

| Priority | Issue | Description | Status |
| --- | --- | --- | --- |
| P1 | RP-7 conversion untested at API | `POST /convert-planning-mode` and `modeConversion.ts` have no tests | OPEN |
| P1 | RP-10 HTTP/UI seam | Planner unit tests exist; endpoint + `GeneratePlanSheet` do not | OPEN |
| P1 | RP-1 copy untested | CAP success names copy; no API test | OPEN |

**Blocking Issues Count:** 0 P0 blockers, 3 P1 coverage issues driving FAIL

### Residual risks (if you ship anyway)

1. **Mode conversion corrupts allocations/roadmap windows** — P1, probability 2 × impact 3 = 6 MITIGATE. Workaround: avoid converting live projects until tests exist.
2. **generate-plan endpoint regresses while unit planner stays green** — P1, 2 × 2 = 4 MONITOR.
3. **Copy drops WBS/roadmap** — P1, 2 × 2 = 4 MONITOR (change proposal already flagged copy-WBS as ask-first).

**Overall residual risk:** MEDIUM if you treat this as a coverage FAIL and keep conversion/copy off the demo path; HIGH if you rely on those paths in production.

### Next steps

**Immediate (coverage, 24–48h):**

1. Unit-test `modeConversion.ts` and add `POST /convert-planning-mode` integration (RP-7).
2. Add `POST /api/projects/:id/copy` and `POST /generate-plan` guard tests (RP-1, RP-10).
3. Re-run `bmad-testarch-trace` — those three likely lift P1 FULL over 80% (CONCERNS) or 90% (PASS).

**Follow-up:**

1. `GeneratePlanSheet` + ClientView chrome tests
2. Correct Course: amend product SPEC (AI shipped, `schemaVersion` 4, CAP-13 frozen)
3. Optional NFR skill for Constraints beyond this mapping

**Stakeholder line:** P0 costing/recon/demand are proven. Release gate FAILs on P1 evidence holes (conversion, copy, generate-plan HTTP/UI), not on missing WBS/roadmap features.

---

## Related artifacts

- Product SPEC: `_bmad-output/specs/spec-resource-planner/SPEC.md`
- Roadmap SPEC: `_bmad-output/specs/spec-roadmap/SPEC.md`
- WBS change: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-12.md`
- Deferred: `_bmad-output/implementation-artifacts/deferred-work.md`
- TEA design (stale for roadmap): `_bmad-output/test-artifacts/test-design-qa.md`
- Machine summary: `_bmad-output/test-artifacts/e2e-trace-summary.json`
- Gate signal: `_bmad-output/test-artifacts/gate-decision.json`

## Sign-off

**Phase 1:** Overall 74% FULL · P0 100% · P1 71% · Critical (P0 NONE) gaps: 0 · High (P1 NONE) gaps: 0

**Phase 2:** **FAIL** · P0 evaluation ALL PASS · P1 evaluation FAILED (71% < 80%)

**Generated:** 2026-08-27
**Workflow:** testarch-trace (gate: P0 100%, overall ≥80%, P1 ≥80/90)

---

<!-- Powered by BMAD-CORE™ -->

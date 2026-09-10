---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - 'docs/bmad-archive/test-artifacts/test-design-architecture.md'
  - 'docs/bmad-archive/test-artifacts/test-design-qa.md'
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-08-14'
projectName: 'Resource planner'
---

# TEA → BMAD Integration Handoff

## Purpose

Bridges TEA system-level test design with BMAD epic/story work (`create-epics-and-stories`). This project uses SPEC + Quick Dev specs rather than a PRD/epics track; still use these quality requirements when slicing new work.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
| -------- | ---- | ---------------------- |
| Architecture test design | `docs/bmad-archive/test-artifacts/test-design-architecture.md` | ASRs, high-risk mitigations, NFR unknowns |
| QA test design | `docs/bmad-archive/test-artifacts/test-design-qa.md` | Story AC, test IDs, execution |
| Progress log | `docs/bmad-archive/test-artifacts/test-design-progress.md` | Workflow audit trail |
| Risk Assessment | embedded in architecture + QA docs | Epic risk, story priority |
| Coverage Strategy | QA doc Test Coverage Plan | Story test requirements |
| SPEC (FR/NFR) | `docs/bmad-archive/specs/spec-resource-planner/SPEC.md` | Capabilities CAP-1–CAP-10 |
| WBS change | `docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md` | CAP-11 |

## Epic-Level Integration Guidance

### Risk References

Treat as epic quality gates (score ≥6):

- **R-001 BUS** — Money math single source (`calculations.ts`)
- **R-002 DATA** — Tests never touch `prisma/dev.db`
- **R-003 DATA** — Cascade delete / rate-card replace / WBS subtree
- **R-004 DATA** — JSON v3 + WBS round-trip; legacy import
- **R-005 BUS** — WBS reconciliation uses `estimatedEffortHours`
- **R-006 BUS** — `daysInFTE` dual semantics (costing vs conversion)
- **R-007 BUS** — AI generate-plan is non-persisting and rate-card-bound
- **R-008 SEC** — Open API: waive or auth epic before non-localhost
- **R-009 TECH** — No Glide cell-edit E2E

### Quality Gates (per epic)

- P0 related to that epic: 100% passing
- No new `import './server'` test without `isolateTestDb`
- No second implementation of money/effort formulas
- `readme.test.ts` still matches new routes
- NFR PASS/CONCERNS/FAIL deferred to `nfr-assess`

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

Any story that touches costing, export, WBS, or AI should include the matching IDs as AC:

| Story theme | Must-have AC (test IDs) |
| ----------- | ----------------------- |
| Rates / allocations / totals | CAP4-UNIT-001, CAP4-UNIT-002 |
| Weekly ↔ monthly | CAP7-UNIT-001, CAP7-UNIT-002, CAP7-API-001 |
| Project delete / copy | CAP1-API-001, CAP1-API-002 |
| Rate card import/replace | CAP5-API-001, CAP5-API-002 |
| JSON/Excel export-import | CAP9-API-001, CAP9-API-002, CAP9-API-003 |
| WBS API / estimates | CAP11-API-001–003, CAP11-UNIT-001 |
| AI generate-plan | CAP10-API-001, CAP10-API-002 |
| Client view | CAP8-CMP-001 |
| Validation / README | VAL-API-001, DOC-UNIT-001 |

### Data-TestId Requirements

Do **not** require testids on Glide/AG Grid cells. Prefer:

- Tab triggers: `projects`, `resource-plan`, `resource-list`, `rate-card`, `wbs`, `client-view`
- Project picker / create / delete confirm
- Export actions: Excel, JSON, PNG
- AI assistant launcher / Accept / Discard
- WBS row menu (already component-tested)

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
| ------- | -------- | --- | ---------------------- | ---------- |
| R-001 | BUS | 6 | CAP-4 costing (always-on AC) | Unit |
| R-002 | DATA | 6 | Test isolation invariant (chore) | API |
| R-003 | DATA | 6 | Project delete; WBS delete; rate-card replace | API |
| R-004 | DATA | 6 | CAP-9 export/import (incl. WBS-4) | API |
| R-005 | BUS | 6 | WBS-3 reconciliation | Unit |
| R-006 | BUS | 6 | WBS-0 / CAP-7 conversion | Unit |
| R-007 | BUS | 6 | CAP-10 generate-plan | API |
| R-008 | SEC | 6 | New auth epic **or** documented waiver | — |
| R-009 | TECH | 6 | Do not file a “grid E2E” story | Optional smoke E2E |
| R-010 | DATA | 4 | Rate-card Excel import | API |
| R-011 | TECH | 4 | Any new field/endpoint | API + unit drift |
| R-012 | PERF | 4 | Only if Andrey sets an SLO | Perf |
| R-015 | BUS | 4 | Client view | Component |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) — this handoff (done)
2. **BMAD Create Epics & Stories** — optional here; project already uses Quick Dev specs
3. **TEA ATDD** (`AT`) — generate failing tests for **gaps** (CAP9-API-001/002, cascade confirm) — run explicitly, do not auto-start
4. **Implementation** — keep tests colocated (Vitest)
5. **TEA Automate** (`TA`) — only if expanding beyond current Vitest
6. **TEA Trace** (`TR`) — map CAP/test IDs after gap closure
7. **TEA NFR assess** — after evidence exists; not now

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
| ---------- | -------- | ------------- |
| Test Design | Epic/Story Creation | All P0 risks have mitigation or waiver path |
| Epic/Story Creation | ATDD | Stories cite test IDs from QA doc |
| ATDD | Implementation | Failing tests exist for **gaps only** (do not rewrite green P0) |
| Implementation | Test Automation | P0 100%; P1 ≥ 95% |
| Test Automation | Release | P0/P1 IDs green; R-008 waived or auth shipped; no `dev.db` in tests |

---
title: 'Sprint Change Proposal — Umbrella SPEC map (WBS + Roadmap as-built)'
date: '2026-08-27'
author: 'Andrey'
trigger: 'Documentation drift — umbrella SPEC is a stale product map, not a new product requirement'
scope_classification: 'Minor'
status: 'approved'
approved_at: '2026-08-27'
context:
  - '{project-root}/docs/bmad-archive/specs/spec-resource-planner/SPEC.md'
  - '{project-root}/docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md'
  - '{project-root}/docs/bmad-archive/specs/spec-roadmap/SPEC.md'
  - '{project-root}/docs/bmad-archive/implementation-artifacts/spec-wbs-*.md'
  - '{project-root}/docs/bmad-archive/implementation-artifacts/deferred-work.md'
  - '{project-root}/docs/bmad-archive/test-artifacts/traceability-matrix.md'
out_of_scope:
  - Goal 3 (transactional apply + undo)
  - WbsItem.notes
  - Roadmap Slice C
  - Unfreezing Roadmap CAP-13
---

# Sprint Change Proposal — Umbrella SPEC map (WBS + Roadmap as-built)

## 1. Issue Summary

**Problem.** The umbrella product contract (`docs/bmad-archive/specs/spec-resource-planner/SPEC.md`) still describes a 10-capability staffing-plan + planned-AI product. The as-built app is a three-layer planner — **WHAT** (WBS), **WHEN** (Roadmap), **WHO** (Resource Plan) — with AI draft generation shipped and JSON export at `schemaVersion: 4`. Agents that treat the umbrella SPEC as the map will miss two shipped capabilities, treat AI as unbuilt, and treat export v3 as current.

**This is documentation drift, not a new product requirement.** No features are added. No implementation specs are rewritten. No test-gap work is in scope.

**Discovery.** Traceability 2026-08-27 (`docs/bmad-archive/test-artifacts/traceability-matrix.md`) recorded this as **known spec drift**, not a missing feature, and pointed here. The 2026-08-12 WBS proposal already asked to add CAP-11 to the umbrella SPEC; that amend never landed even though WBS shipped.

**Evidence.**

| Finding | Evidence |
|---|---|
| Canonical contract is SPEC + companions | Umbrella SPEC banner; locked from prior chat. `docs/` from 2026-06-30 is not the system of record. |
| CAP-1–10 and Constraints still match code | Umbrella SPEC Capabilities / Constraints vs current `server.ts` / `calculations.ts` / `api.ts` |
| WBS is shipped, umbrella has no CAP-11 | `sprint-change-proposal-2026-08-12.md` §4.6; `implementation-artifacts/spec-wbs-*.md` all `status: done` |
| Roadmap contract exists; umbrella has no CAP-12 | `docs/bmad-archive/specs/spec-roadmap/SPEC.md`; `spec-wbs-schedule` already SUPERSEDED 2026-08-21 |
| AI is shipped, Assumptions still say unbuilt | `POST /api/projects/generate-plan` in `server.ts`; Assumptions: “planned/unbuilt — no AI endpoint exists among the current 28 routes” |
| Export is `schemaVersion: 4`, CAP-9 still says 3 | `server.ts` export payload `schemaVersion: 4` (roadmap arm); CAP-9 success still `{ schemaVersion: 3, … }` |
| Roadmap CAP-13 is frozen on purpose | `spec-roadmap/SPEC.md` CAP-13; `deferred-work.md` “CAP-13 — Draft plan from roadmap (frozen 2026-08-22)” |
| Traceability FAIL is test evidence, not missing features | Out of scope: Goal 3, `WbsItem.notes`, Roadmap Slice C, unfreezing CAP-13 |

---

## 2. Impact Analysis

### 2.1 Epic / capability impact

This project has **no PRD and no epics**. It runs the lean Core flow (umbrella SPEC + per-feature SPECs / Quick Dev delivery logs), same as 2026-08-12. Epic-level items are N/A.

| Capability | Impact |
|---|---|
| CAP-1–8, CAP-10 intent | **Unchanged.** Constraints still match code. |
| CAP-9 success | **Amend** `schemaVersion` 3 → 4; round-trip now includes WBS **and** roadmap; still accept legacy v2 (no WBS) and v3 (WBS, no roadmap). |
| CAP-10 | **Intent unchanged.** Assumption “unbuilt” is wrong — Goals 1a/1b/2 shipped; Goal 3 stays deferred (out of scope). |
| **New map entry: CAP-11 — WBS (WHAT)** | Pointer only. Contract already exists (2026-08-12 proposal + shipped `spec-wbs-*`). Overdue from 2026-08-12. |
| **New map entry: CAP-12 — Roadmap (WHEN)** | Pointer only. Contract is `spec-roadmap/SPEC.md`. Note Roadmap **CAP-13 frozen**. Do not revive `spec-wbs-schedule`. |
| Roadmap CAP-13 (feature SPEC, not umbrella) | **Record as frozen.** Do not unfreeze. Do not add an umbrella CAP-13. |

No remaining planned epic is invalidated. No new epic is needed. Priority/order of delivery is unchanged — this is a map update after the work already shipped.

### 2.2 Artifact conflicts

| Artifact | Impact | Action |
|---|---|---|
| `docs/bmad-archive/specs/spec-resource-planner/SPEC.md` | Stale as a **map**: missing CAP-11/12, wrong AI status, wrong schemaVersion, Why/Success still WHO-only | **Amend** (selected path) |
| `docs/bmad-archive/specs/spec-resource-planner/.memlog.md` | Last updated 2026-08-12; still records AI as unbuilt | **Amend** (log the map update) |
| `docs/bmad-archive/specs/spec-roadmap/SPEC.md` | Already the Roadmap contract; CAP-13 already frozen | **No rewrite.** Umbrella points at it. |
| `docs/bmad-archive/specs/spec-wbs-schedule/` | Already SUPERSEDED 2026-08-21 | **Archive in place** — one-line archive banner; do not move (breaks `spec-roadmap` `supersedes:`); do not revive |
| `docs/bmad-archive/implementation-artifacts/spec-wbs-*.md` | Delivery log of shipped WBS | **Do not rewrite** |
| `docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md` | Historical WBS contract + the CAP-11 amend that never landed | **Do not rewrite.** CAP-11 points at it. |
| `docs/*` (architecture, data-models “6 tables”, api-contracts “28 endpoints”, …) | Listed as umbrella **companions**, so they currently claim to be the contract. They are a 2026-06-30 brownfield scan. | **Demote** from `companions:` to `sources:`. Do not regenerate `docs/` in this change. |
| `docs/ai-resource-plan-generation-spec.md` | Still the CAP-10 design-of-record; code has shipped against it | **Keep** as companion; Assumptions stop calling it unbuilt |
| `docs/bmad-archive/project-context.md` | Binding 50-rule catalog | **Keep** as companion. No change. |
| UX `ux-resource-planner-2026-06-30` | AI-generation UX only | **No change** |
| PRD / Epics / `sprint-status.yaml` | Do not exist | **N/A** |
| Traceability 2026-08-27 | Test-evidence FAIL | **Out of scope** |

### 2.3 Technical impact

**None.** No code, schema, endpoint, UI, or test changes. `readme.test.ts` is not affected. Export stays `schemaVersion: 4` in `server.ts`.

---

## 3. Recommended Approach

**Selected path: Direct Adjustment** — amend the umbrella SPEC in place. Do not rewrite it from scratch.

| Option | Verdict | Rationale |
|---|---|---|
| 1. Direct Adjustment | ✅ **Selected** | Drift is in one map document. Effort **Low**. Risk **Low**. |
| 2. Rollback | ❌ Not viable | Nothing in code is wrong; reverting shipped WBS/Roadmap would destroy product, not fix the map. |
| 3. PRD MVP Review | ❌ Not viable | No PRD. No scope cut. Features already shipped. |

**Rationale.** The 2026-08-12 proposal already chose Direct Adjustment to *add* CAP-11; code followed, the map did not. Repeating that amend, plus pointing CAP-12 at the existing Roadmap SPEC, plus correcting three factual lines (AI shipped, schemaVersion 4, CAP-13 frozen) and retargeting Why/Success at WHAT/WHEN/WHO, is the whole job. Rewriting the umbrella would discard CAP-1–10 and Constraints that still match code. Regenerating `docs/` or rewriting implementation specs would invent a second system of record.

**Effort:** Low (SPEC amend + memlog + archive banner).
**Risk:** Low (docs only; no runtime).
**Timeline:** No sprint slip. Apply after explicit approval of this proposal.

### Locked decisions (from prior chat — not reopened)

1. Canonical contract is SPEC + companions, not `docs/` from 2026-06-30.
2. Amend, do not rewrite, the umbrella SPEC.
3. CAP-11 and CAP-12 are **pointers** to existing contracts, not restated feature SPECs inside the umbrella.
4. Implementation specs are a delivery log — do not rewrite them.
5. `spec-wbs-schedule` is SUPERSEDED — archive, do not revive.
6. Roadmap CAP-13 stays frozen. Do not unfreeze. Do not add umbrella CAP-13.
7. Out of scope: Goal 3, `WbsItem.notes`, Roadmap Slice C, traceability remediations.

---

## 4. Detailed Change Proposals

### 4.1 Umbrella SPEC frontmatter — demote stale `docs/` companions

**File:** `docs/bmad-archive/specs/spec-resource-planner/SPEC.md`  
**Section:** YAML `companions` / `sources`

**OLD:**

```yaml
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
```

**NEW:**

```yaml
companions:
  - ../../project-context.md                          # binding convention catalog (50 rules) — read first when implementing
  - ../../../docs/ai-resource-plan-generation-spec.md # AI plan-generation — design of record (Goals 1a/1b/2 shipped; Goal 3 deferred)
sources:
  - ../../../README.md          # feature list absorbed into Capabilities (partially stale; trust code)
  - ../../../issues-tasks.md    # tech-debt tracker absorbed into Open Questions / Assumptions
  - ../../../docs/architecture.md                     # 2026-06-30 brownfield scan — stale companion, not system of record
  - ../../../docs/data-models.md                      # 2026-06-30; still says 6 tables
  - ../../../docs/api-contracts.md                    # 2026-06-30; still says 28 endpoints
  - ../../../docs/integration-architecture.md         # 2026-06-30 brownfield scan — stale
  - ../../../docs/component-inventory.md              # 2026-06-30 brownfield scan — stale
```

**Rationale.** The SPEC banner treats `companions:` as the contract. Leaving the 2026-06-30 scan there makes “6 tables / 28 endpoints” canonical. Demote, do not regenerate. Keep the AI spec as companion because CAP-10 still points at it; only the “unbuilt” assumption is wrong.

Do **not** add `spec-roadmap/SPEC.md` or `spec-wbs-*` as umbrella companions (circular: those files already companion this SPEC). They are named in CAP-11 / CAP-12.

---

### 4.2 Why — retarget to WHAT / WHEN / WHO

**Section:** `## Why`

**OLD:** one paragraph whose anchor is costed staffing plans + removing the blank-page cost via AI.

**NEW:** keep that WHO-layer paragraph, and open with the three-layer frame the as-built product actually has:

```markdown
## Why

Resource Planner exists so a delivery lead, pre-sales engineer, or PM can turn the shape of a project into a **defensible, costed, margin-aware staffing plan** in minutes rather than spreadsheets — and present a clean version of the numbers to a client.

The as-built product answers three planning questions, each with its own artifact:

```
WHAT     WBS       tree → leaves with hours × roles          CAP-11
WHEN     Roadmap   lanes → windows and milestones on periods  CAP-12
WHO      Plan      roles × periods × allocation %             CAP-1–10
```

WHAT ↔ WHO (total / discipline / phase) shipped with WBS-3. WHAT ↔ WHEN (coverage) and WHEN ↔ WHO (demand vs supply per period) shipped with the Roadmap. Internally, a planner still builds rows of roles with per-period allocations; the app computes internal cost, client price, margin, and effort in real time, grounded in a shared, org-wide rate card. The blank-page cost is also removed: a planner can describe a project in plain language and get an editable draft plan, with roles and rates constrained to the real rate card so nothing is hallucinated, and a human always accepting before anything is saved. Deterministic money math remains the non-negotiable core of WHO. WBS and Roadmap detailed contracts live in the files CAP-11 and CAP-12 point at — they are not restated here.
```

**Rationale.** Amend, don’t replace: the original “why this product exists” is still true; it was incomplete as a map.

---

### 4.3 CAP-9 — `schemaVersion` 4

**Section:** CAP-9 success

**OLD:**

```
JSON export wraps `{ schemaVersion: 3, exportedAt, data }` and round-trips lists, plans, allocations, and the WBS tree on import (accepting legacy `weeklyAllocations`/`weekNumber` and v2 payloads with no WBS)
```

**NEW:**

```
JSON export wraps `{ schemaVersion: 4, exportedAt, data }` and round-trips lists, plans, allocations, the WBS tree, and the roadmap (`roadmapLanes`, plus `Project.startDate`) on import, accepting legacy `weeklyAllocations`/`weekNumber`, v2 payloads with no WBS, and v3 payloads with WBS but no roadmap; the global rate card is excluded
```

**Rationale.** Matches `server.ts` export (`schemaVersion: 4`, `roadmapLanes`) and existing import compatibility. Does not change code.

---

### 4.4 CAP-11 and CAP-12 — pointers only

**Section:** end of `## Capabilities`, after CAP-10. CAP-1–10 bodies stay as they are except CAP-9 success (4.3).

**ADD:**

```markdown
- **CAP-11 — WBS & estimate reconciliation (WHAT)**
  - **intent:** A planner decomposes the project into an independent work-breakdown tree and estimates hours per discipline (role optional), then sees where that bottom-up estimate disagrees with the resource plan — without either side automatically syncing the other.
  - **success:** Shipped. The contract is `docs/bmad-archive/planning-artifacts/sprint-change-proposal-2026-08-12.md` (locked D1–D6) plus the delivery log `docs/bmad-archive/implementation-artifacts/spec-wbs-*.md`. This umbrella does not restate that contract. Independent estimates + variance report (total / discipline / phase), with Unassigned and Unmapped buckets visible; hours live on WBS leaves; parents are computed.
  - **note:** The 2026-08-12 proposal already asked to add this capability here. The code landed; this line is the overdue map entry.

- **CAP-12 — Project roadmap (WHEN)**
  - **intent:** A planner places WBS effort in time as a separate, flat roadmap of lanes, windows, and milestones (not a Gantt on WBS items), then sees coverage (WHAT ↔ WHEN) and per-period demand vs Resource Plan supply (WHEN ↔ WHO).
  - **success:** Shipped (slices A/B). The contract is `docs/bmad-archive/specs/spec-roadmap/SPEC.md` (that file’s CAP-1–CAP-12). This umbrella does not restate that contract.
  - **frozen:** Roadmap **CAP-13** (draft a Resource Plan from the roadmap) is frozen 2026-08-22 on purpose — implementation exists (`buildDraftFromRoadmapLoad`), toolbar entry is disabled. Do not unfreeze from this amend. See `deferred-work.md`.
  - **archived:** `docs/bmad-archive/specs/spec-wbs-schedule/` (“schedule on WBS items”) is SUPERSEDED. Do not implement from it.
```

**Rationale.** Pointers, not a third copy of WBS/Roadmap law. Umbrella CAP-12 ≠ Roadmap CAP-12 (bootstrap). Numbering stays local to each SPEC.

---

### 4.5 Success signal

**OLD:** planner → description → costed staffing plan (hand or AI) → export. No WBS, no roadmap.

**NEW:**

```markdown
## Success signal

A planner starts from a project description and ends with three aligned artifacts — a WBS (WHAT), a roadmap (WHEN), and a reviewed, costed, margin-aware staffing plan (WHO), the last built by hand in the grid **or** accepted from an AI-generated draft grounded in the global rate card — then exports the project (Excel/JSON/PNG) or hands the client view to a client.

Concretely demonstrable end-to-end: create a project, import the rate card from Excel, generate or build a plan with per-period allocations, decompose scope into a WBS and see WHAT ↔ WHO variance, place that WBS on a roadmap and see coverage plus WHEN ↔ WHO demand vs supply, reload and get the identical project back, and export JSON at `schemaVersion: 4` — with every cost/price/margin/effort number produced by the shared calculation module. Roadmap CAP-13 (draft plan from roadmap) is not part of this signal while frozen.
```

---

### 4.6 Assumptions

**OLD:**

```
- The AI feature reflects `docs/ai-resource-plan-generation-spec.md` as its design of record and is **planned/unbuilt** — no AI endpoint exists among the current 28 routes.
- The rate card is **global** …
- The tool is single-user / internal …
```

**NEW:**

```
- The AI feature reflects `docs/ai-resource-plan-generation-spec.md` as its design of record. **Goals 1a / 1b / 2 are shipped** (`POST /api/projects/generate-plan`). Goal 3 (transactional apply + undo) remains deferred — see `deferred-work.md`. Do not treat “AI unbuilt” as an app defect.
- JSON project export is **`schemaVersion: 4`** (WBS + roadmap). v2 (no WBS) and v3 (WBS, no roadmap) still import. Do not treat CAP-9’s old “3” as an app defect.
- Roadmap **CAP-13** is frozen on purpose (2026-08-22). Unfreezing is out of scope for this amend.
- `docs/bmad-archive/specs/spec-wbs-schedule/` is archived (SUPERSEDED 2026-08-21 by `spec-roadmap`). Do not implement from it.
- `docs/` brownfield files dated 2026-06-30 (architecture, data-models, api-contracts, …) are **stale sources**, not the system of record. Trust this SPEC, the files CAP-11/CAP-12 point at, and the code.
- The rate card is **global** per `prisma/schema.prisma`; the older `issues-tasks.md` “project-scoped rate card” fix (C3) is superseded and does not reflect current code.
- The tool is single-user / internal, inferred from the absence of an auth layer, open CORS, and a single SQLite file.
```

Open Questions (auth; AI provider/guardrails) stay. They were not closed by this drift.

Constraints, Non-goals, CAP-1–8, CAP-10 intent: **no edits.** They still match code. Do not copy WBS/Roadmap constraints into the umbrella.

---

### 4.7 Memlog

**File:** `docs/bmad-archive/specs/spec-resource-planner/.memlog.md`

Append events for: CAP-11/CAP-12 map pointers; AI shipped; schemaVersion 4; CAP-13 frozen; `docs/` demoted to sources; Why/Success retargeted to WHAT/WHEN/WHO; `spec-wbs-schedule` archived. Correct the 2026-08-12 assumption line that AI is unbuilt. Do not rewrite the historical log.

---

### 4.8 Archive `spec-wbs-schedule` in place

**File:** `docs/bmad-archive/specs/spec-wbs-schedule/SPEC.md`  
**Section:** existing SUPERSEDED banner

**OLD:**

```
> **SUPERSEDED (2026-08-21)** by [`../spec-roadmap/SPEC.md`](../spec-roadmap/SPEC.md). …
```

**NEW:** same paragraph, prefixed:

```
> **ARCHIVED.** Do not implement from this folder. Retained for rationale only.
```

Do not move the folder (would break `spec-roadmap` `supersedes:` and relative companions). Do not rewrite capabilities, constraints, or companions.

---

### 4.9 Explicit non-edits

| Artifact | Why not |
|---|---|
| `spec-roadmap/SPEC.md` and its companions | Already the Roadmap contract; CAP-13 already frozen |
| `implementation-artifacts/spec-wbs-*.md` | Delivery log |
| `implementation-artifacts/deferred-work.md` | Goal 3 / CAP-13 already recorded |
| `docs/*` bodies | Stale; demote, don’t regenerate in this change |
| `sprint-change-proposal-2026-08-12.md` | Historical contract CAP-11 points at |
| Traceability / tests / `server.ts` | Out of scope |

---

## 5. Implementation Handoff

**Scope classification: Minor** — documentation only. Direct implementation by Developer after approval.

**Handoff:** Developer applies §4.1–4.8 to the three files named. No PO backlog reorganization. No PM/Architect replan.

**Success criteria**

- Umbrella SPEC lists CAP-11 (WBS) and CAP-12 (Roadmap) as pointers to existing contracts.
- CAP-9 says `schemaVersion: 4` with v2/v3 import compatibility.
- Assumptions say AI Goals 1a/1b/2 shipped; Goal 3 deferred; Roadmap CAP-13 frozen; `spec-wbs-schedule` archived; `docs/` not SoR.
- Why / Success signal describe WHAT / WHEN / WHO.
- CAP-1–10 intent and Constraints otherwise unchanged.
- No code change. No rewrite of implementation specs. No unfreeze of CAP-13.
- `spec-wbs-schedule/SPEC.md` carries an ARCHIVED banner and still points at `spec-roadmap`.

**Sequencing:** this proposal → explicit yes → apply amend → stop. Traceability remediations are a later TEA pass, not this change.

---

## 6. Checklist Status

| Section | Status |
|---|---|
| 1. Trigger & context | ✅ Done — documentation drift; evidence table above |
| 2. Epic impact | ✅ N/A — no PRD/epics; capability map only |
| 3. Artifact conflicts | ✅ Done — table in §2.2 |
| 4. Path forward | ✅ Done — Option 1 Direct Adjustment (locked) |
| 5. Proposal components | ✅ Done — this document |
| 6. Final review & handoff | ✅ Done — approved by Andrey 2026-08-27; amend applied. `sprint-status.yaml` N/A (no epics) |

**Mode:** Batch (path and locked decisions supplied with the change signal).

---
title: 'Sprint Change Proposal — WBS & Estimate Reconciliation'
date: '2026-08-12'
author: 'Andrey'
trigger: 'New requirement — second estimation viewpoint (WBS) reconciled against the resource plan'
scope_classification: 'Major'
status: 'approved'
approved_at: '2026-08-12'
context:
  - '{project-root}/_bmad-output/specs/spec-resource-planner/SPEC.md'
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

# Sprint Change Proposal — WBS & Estimate Reconciliation

## 1. Issue Summary

**Problem.** Project estimation currently has exactly one viewpoint: the resource plan
(roles × per-period allocations → hours → cost). There is no independent bottom-up view
derived from *what work actually has to be done*. Without it, nothing can tell a planner
whether a plan is genuinely staffed for the scope, or merely shaped to fit a deadline or
a budget number.

**Requested change.** Add a Work Breakdown Structure (WBS) as a second, independent
estimation viewpoint, plus a reconciliation view that surfaces where the two disagree.

**Discovery context.** Raised directly by the user on 2026-08-12, outside the current work
cycle. The last completed slice was phase reordering/splitting (`b1be4bc`); the AI plan
generation arc has Goals 1a/1b/2 done and Goal 3 (transactional apply + undo) on hold.

**Evidence.**

| Finding | Evidence |
|---|---|
| WBS is entirely greenfield | `grep -rniE "\bwbs\b\|work breakdown"` across code + docs + `_bmad-output` returns **zero** matches |
| A reconciliation denominator already exists | `estimatedEffortHours()` in `src/utils/calculations.ts:83` already yields hours per plan row per period, aggregable to phase |
| The discipline vocabulary already exists, built and tested | `buildDisciplineEnum()` / `normalizeTaxonomy()` in `server/planner/rateCard.ts`, covered by `rateCard.test.ts` |
| The rate card is **empty** in the live DB | `SELECT COUNT(*) FROM GlobalRateCard` → **0**, against 86 `ResourcePlan` rows / 38 distinct roles |
| Plan roles are free text | `ResourcePlan.tsx:974` seeds `role: 'New role'`; `ResourcePlan.tsx:609` — *"free-text fallback; primary path is the role picker dialog"*; `server-validation.ts:76` accepts any `z.string().min(1).max(500)` |
| An unresolved SPEC question becomes load-bearing | SPEC Open Question "`daysInFTE` semantics" — `hoursPerPeriod()` (`calculations.ts:71`) uses `daysInFTE × 8` for monthly but **hardcodes 40** for weekly |
| A README drift test gates new endpoints | `readme.test.ts` parses routes from `server.ts` and `README.md` and fails on mismatch |

---

## 2. Impact Analysis

### 2.1 Capability impact

This project runs the lean Core flow (`SPEC.md` + per-feature Quick Dev specs), not a
PRD/Epics track. Capability-level impact:

- **New: CAP-11 — WBS & estimate reconciliation.** Purely additive.
- **No existing capability is invalidated or redefined.** CAP-2/3/4 (plan authoring,
  allocation, costing) keep their contracts unchanged.
- **CAP-9 (export & import) extends** — WBS must travel with a project export or the
  second estimate cannot leave the app.
- **Deferred Goal 3 (transactional apply + undo) is affected.** Its `PlanRevision`
  snapshot covers `resourcePlans + phases`. Once WBS exists, a snapshot that omits it
  makes Undo *partially* restore a project — worse than not having Undo. Cheap to amend
  now while Goal 3 is still on paper; expensive after WBS ships.

### 2.2 Artifact conflicts

| Artifact | Impact | Action |
|---|---|---|
| `SPEC.md` | Add CAP-11; add v1 boundary to Non-goals; extend Success signal; **close** the `daysInFTE` Open Question (it becomes a Constraint) | Amend |
| `docs/data-models.md` | "6 tables" → 8 (`WbsItem`, `WbsEstimate`) | Amend |
| `docs/api-contracts.md` | New WBS endpoints; also **already drifted** — doc says 28 endpoints, `server.ts` has 31 | Amend + fix drift |
| `docs/architecture.md`, `docs/integration-architecture.md` | New page, new module, new seam | Amend |
| `docs/component-inventory.md` | New WBS components | Amend |
| `README.md` | **Test-gated** by `readme.test.ts` — new routes must be listed or `npm test` fails | Mandatory |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Goal 3 snapshot scope must include WBS | Amend |
| UX artifacts | `ux-resource-planner-2026-06-30` covers AI generation only — **no WBS design exists** | New (optional for v1) |

### 2.3 Technical impact

- **Grid library constraint.** WBS is hierarchical, but AG Grid **Community** (`^34.1.2`)
  ships neither Tree Data nor Row Grouping — both are Enterprise. Glide has no tree either.
  SPEC constraint *"Two grids, never mixed"* forbids adding a third library. → Render a
  flat table with a computed indent column; build the tree in memory client-side.
- **Rate card empty ⇒ reconciliation is untestable end-to-end** until an Excel import is
  done. This is a **prerequisite**, not setup noise.
- **Server-side role enforcement must be conditional.** Validating `role ∈ GlobalRateCard`
  unconditionally would reject *every* plan write while the card is empty, bricking the app.
- **Legacy rows cannot be retroactively cleaned.** Of 38 distinct roles across 86 rows, most
  follow the §7.4 taxonomy and will map after import, but some (`Resource 3`, `Resource 5`)
  never will.
- **Export versioning.** `schemaVersion: 2` (`server.ts:260`) → `3`; the import branch
  reconstructs relations by hand and needs a matching WBS arm.

---

## 3. Recommended Approach

**Selected path: Hybrid — Direct Adjustment + scoped MVP.**

| Option | Verdict | Rationale |
|---|---|---|
| 1. Direct Adjustment | ✅ **Viable** | Work is additive and fits the existing structure. Effort **High**, Risk **Medium** |
| 2. Rollback | ❌ Not viable | Nothing is broken; there is nothing to revert |
| 3. MVP Review | ⚠️ Partially applied | Already used to cut AI WBS generation out of v1 |

**Rationale.** No existing capability breaks, so a rollback buys nothing. The risk is not
in the WBS page itself — it is in the *reconciliation seam*, which silently depends on two
unresolved things (`daysInFTE` semantics, an empty rate card). Sequencing those ahead of the
maths is what makes the difference between a trustworthy variance report and a number nobody
believes. Scope is deliberately cut (no AI WBS generation in v1) to keep the first slice
provable end-to-end.

**Non-negotiable sequencing:** `daysInFTE` decision **and** a rate-card import must land
*before* reconciliation maths, or the reported delta is an artifact of the formula rather
than a real disagreement between estimates.

### Locked design decisions

| # | Decision | Chosen |
|---|---|---|
| D1 | WBS structure | Self-referencing tree, arbitrary depth (`WbsItem.parentId`) |
| D2 | Estimate unit | **Hours**, keyed by **discipline (required) + role (optional)** |
| D3 | Phase link | Optional `phaseName` (nullable), matched **by name**; rename cascades; `Unassigned` bucket |
| D4 | Direction of truth | **Independent estimates + variance report.** No automatic sync in either direction |
| D5 | v1 scope | WBS page + CRUD + reconciliation + Excel/JSON export + close `daysInFTE`. **No AI WBS generation** |
| D6 | Plan-side roles | Constrain to rate card (picker-only); forbid free text |

**Amendment to D6 (raised by evidence, needs sign-off).** The input-side ban is right and
stops new junk at the source, but it cannot be applied retroactively to the 86 existing rows
and cannot be enforced at all while the rate card is empty. The `Unmapped` bucket must
therefore **also** be kept as a safety net. The two solve different problems: the ban stops
new bad data, the bucket keeps the report honest about data already accumulated.

---

## 4. Detailed Change Proposals

### 4.1 Data model — `prisma/schema.prisma`

```prisma
model WbsItem {
  id           Int       @id @default(autoincrement())
  name         String
  parentId     Int?
  parent       WbsItem?  @relation("WbsTree", fields: [parentId], references: [id], onDelete: Cascade)
  children     WbsItem[] @relation("WbsTree")
  phaseName    String?              // NULL = Unassigned; matched to Project.phases by name
  displayOrder Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  projectId    Int
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  estimates    WbsEstimate[]
}

model WbsEstimate {
  id         Int      @id @default(autoincrement())
  discipline String              // required — from GlobalRateCard.discipline
  role       String?             // optional refinement — from GlobalRateCard.role
  hours      Float    @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  wbsItemId  Int
  wbsItem    WbsItem  @relation(fields: [wbsItemId], references: [id], onDelete: Cascade)

  @@unique([wbsItemId, discipline, role])
}
```

**Rationale.** `WbsEstimate` is a 1:N collection, so one work item carries a *vector* of
disciplines — this is what makes an item multi-disciplinary (`API: 40h Backend + 16h QA +
8h Analysis`). The shape deliberately mirrors `Allocation`'s `@@unique([resourcePlanId,
periodNumber])`: there, `(plan row × period) → %`; here, `(work item × discipline) → hours`.
Same structural idiom, so the codebase stays legible.

Consequences to honour in implementation:
- Rollup to a parent is a **`Map<discipline, hours>` merge**, not a scalar sum.
- Hours live on leaves; parents are computed, never stored.
- Prisma cannot fetch recursively — load the project's rows flat (tens to low hundreds) and
  assemble the tree in memory. This also gives the flat-table-with-indent rendering needed
  to stay inside AG Grid Community.
- `onDelete: Cascade` on the self-relation deletes whole subtrees — requires explicit UI
  confirmation per the project's destructive-operation rule.

### 4.2 Reconciliation engine — `src/utils/wbs.ts` (new, pure)

Per the project rule that pure logic in `src/utils/` must carry unit tests.

| Level | Needs phases? | Availability |
|---|---|---|
| Project total (hours) | no | always |
| Per discipline | no | always |
| Per phase × discipline | yes | only for assigned rows |

Two explicit gap buckets, both rendered rather than silently dropped:
- **`Unassigned`** — WBS items with no `phaseName`.
- **`Unmapped`** — plan rows whose `role` does not resolve to a rate-card discipline.

### 4.3 API — `server.ts` + `server-validation.ts` + `src/services/api.ts`

New routes (inline, **above** the SPA catch-all; mirrored in `api.ts`; `.strict()` Zod
schemas; **and listed in `README.md` or `readme.test.ts` fails**):

```
GET    /api/projects/:id/wbs
POST   /api/projects/:id/wbs-items
PUT    /api/wbs-items/:id
DELETE /api/wbs-items/:id
PUT    /api/wbs-items/:id/estimates
GET    /api/projects/:id/reconciliation
```

### 4.4 UI

- Fifth tab in `src/App.tsx:1087` (`Tabs`), state centralized in `App.tsx` per the
  existing pattern; all I/O through `src/services/api.ts`.
- Flat table + computed indent (no Enterprise tree), disciplines as columns, hours as cells.
- Reconciliation panel showing per-phase × discipline variance plus both gap buckets.

### 4.5 Plan-side role constraint (D6)

- `ResourcePlan.tsx` — role cell becomes picker-only; drop the `'New role'` placeholder seed.
- `server-validation.ts` — rate-card membership check **conditional on a non-empty card**.
- Legacy rows are left untouched and surface via `Unmapped`.

### 4.6 Amendments to existing artifacts

- `SPEC.md` — add CAP-11; close the `daysInFTE` Open Question as a Constraint; add v1
  boundary to Non-goals.
- `deferred-work.md` — Goal 3's `PlanRevision` snapshot must include WBS.
- `server.ts` — `schemaVersion` 2 → 3, plus a WBS arm in the import branch.
- `docs/*` — data models, API contracts (also fix the 28→31 drift), architecture, components.

---

## 5. Implementation Handoff

**Scope classification: Major** — new capability, new data model, a breaking change to an
existing screen, and a SPEC amendment.

Suggested slices, each its own Quick Dev spec:

| # | Slice | Depends on | Notes |
|---|---|---|---|
| **WBS-0** | Close `daysInFTE`; import the rate card | — | **Prerequisite.** Without both, reconciliation is untestable and its numbers untrustworthy |
| **WBS-1** | Data model + API + `api.ts` wrapper | WBS-0 | Includes README route list (test-gated) |
| **WBS-2** | WBS page — tree table + estimate matrix | WBS-1 | Flat table + indent; no new grid library |
| **WBS-3** | Reconciliation engine + panel | WBS-1, WBS-2 | Pure logic in `src/utils/wbs.ts` with unit tests |
| **WBS-4** | Export/import (`schemaVersion` 3) + role constraint (D6) | WBS-1 | Role constraint is independently shippable |

**Deferred out of v1:** AI generation of WBS from a description (would reuse the existing
`generateStructured()` seam); bidirectional WBS ↔ plan sync; a dedicated UX design artifact.

**Success criteria.** A planner can decompose a project into a WBS, estimate it in hours per
discipline, and see a phase × discipline variance report against the resource plan — with
both gap buckets visible, every hour figure produced by shared pure functions, and the plan
side's contracts unchanged.

---

## 6. Checklist Status

| Section | Status |
|---|---|
| 1. Trigger & context | ✅ Done |
| 2. Capability impact (epics N/A) | ✅ Done — CAP-11 added; Goal 3 flagged |
| 3. Artifact conflicts | ✅ Done — 9 artifacts identified |
| 4. Path forward | ✅ Done — Hybrid (Direct Adjustment + scoped MVP) |
| 5. Proposal components | ✅ Done — this document |
| 6. Final review & handoff | ✅ Done — approved by Andrey on 2026-08-12, including the D6 amendment (conditional rate-card enforcement + retained `Unmapped` bucket) |

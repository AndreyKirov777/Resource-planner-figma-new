# Data model, link inheritance, API and formulas

Companion to `SPEC.md`. Load-bearing detail for CAP-2, CAP-5, CAP-7, CAP-8, CAP-10, CAP-12 and CAP-13.

## Schema delta

Four additions. Nothing existing changes except one nullable column on `Project`.

```prisma
model Project {
  // ...existing fields
  startDate       DateTime?     // anchors period 1; null = work in ordinals only
  roadmapLanes    RoadmapLane[]
  roadmapItems    RoadmapItem[]
}

// A workstream row on the roadmap. Order is explicit, like ResourcePlan.displayOrder.
model RoadmapLane {
  id              Int           @id @default(autoincrement())
  name            String
  displayOrder    Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  projectId       Int
  project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  items           RoadmapItem[]
}

// A window or milestone inside a lane. Flat: no parent, ever.
model RoadmapItem {
  id              Int           @id @default(autoincrement())
  name            String
  kind            String        @default("bar")  // "bar" | "milestone"
  startPeriod     Int                            // 1-based, in the project's planningMode unit
  periodCount     Int           @default(1)      // >= 1 for bars; 0 for milestones
  displayOrder    Int           @default(0)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  laneId          Int
  lane            RoadmapLane   @relation(fields: [laneId], references: [id], onDelete: Cascade)
  projectId       Int                            // denormalised so the link check is one query
  project         Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  links           RoadmapLink[]
}

// "This WBS node, with its subtree, is delivered by that roadmap item."
// Lives in its own table so WbsItem does not change. Absent row = not linked directly.
model RoadmapLink {
  id              Int           @id @default(autoincrement())
  createdAt       DateTime      @default(now())

  wbsItemId       Int           @unique
  wbsItem         WbsItem       @relation(fields: [wbsItemId], references: [id], onDelete: Cascade)
  roadmapItemId   Int
  roadmapItem     RoadmapItem   @relation(fields: [roadmapItemId], references: [id], onDelete: Cascade)
}
```

`WbsItem` gains only the Prisma back-relation `roadmapLink RoadmapLink?` — a relation field, not a column; the table is untouched. Cascades: deleting a WBS node drops its link; deleting a roadmap item drops its links and its scope becomes unplaced; deleting a lane deletes its items (the UI confirms with the count first).

**Invariant checked at the API boundary:** `wbsItem.projectId === roadmapItem.projectId`, and `roadmapItem.kind !== "milestone"` — milestones carry no scope. Both return 400.

### Why periods and not dates

`Allocation.periodNumber`, `Phase.periodCount`, `modeConversion.ts` and `getPhaseForPeriod` all speak in ordinal periods. Storing ISO dates would force a translation on every reconciliation read and would make `Project.startDate` edits rewrite every row. With periods, setting or moving the start date shifts only the rendered scale.

### Why a link table and not a column on WbsItem

The SPEC constraint is that `WbsItem` does not change: WBS-4's export/import shape, the `.strict()` schemas and the reconciliation contract all hang off it. A `@unique wbsItemId` in a separate table gives the same N:1 semantics as a nullable FK column would, at the price of one join — the same trade the rejected `WbsSchedule` design made.

## Link inheritance — `src/utils/roadmap.ts`

The one rule that makes linking cheap for the user and exact for the engine, modelled on `effectivePhases` in `wbsTree.ts`:

> A node's **effective roadmap item** is its own link if it has one, otherwise its nearest linked ancestor's, otherwise none.

```
effectiveRoadmapItems(tree, links) → Map<wbsItemId, { roadmapItemId: number | null, inherited: boolean }>
```

Walk the forest top-down carrying the inherited id, exactly as `effectivePhases` carries the inherited phase name. Consequences that follow from the rule and must be tested:

- Linking a depth-1 node places its whole subtree with one action.
- Linking a grandchild to a *different* item carves it — and only it and its descendants — out of the ancestor's scope.
- Indent/outdent in the WBS tab recomputes attribution automatically: the link is on the node, and the node's ancestors changed.
- Deleting a roadmap item cascades its links; the affected subtrees fall back to the next linked ancestor, or become unplaced.

**Scope and effort of an item.** `scopeLeaves(itemId)` is the set of leaves whose effective item is `itemId`. `itemEffort(itemId) → Map<role, hours>` sums `WbsEstimate` over those leaves. Do **not** use `rollupHours` on the linked node directly — it would include descendants carved out by a deeper link. Parents contribute nothing of their own, matching `rollupHours` semantics.

## Coverage — `src/utils/roadmap.ts`

```
coverage(items, links, roadmapItems, phases) → {
  unplaced:       { wbsItemId, hours }[]     // effective item = none, listed at the highest unplaced node
  unplacedHours:  number
  unplacedShare:  number                      // unplacedHours / WBS total
  unplaceable:    { wbsItemId, hours }[]     // effective item = none AND effective phase = null
  empty:          roadmapItemId[]             // bars with no scope leaves
  phaseMismatch:  { roadmapItemId, wbsItemId, phaseName }[]
}
```

*Unplaced* lists the highest node in each unplaced subtree, not every leaf — a planner fixes it with one link, and the list should say so. *Phase mismatch* is a leaf whose effective phase's period range shares no period with the owning item's window; `phaseStartOffset` and `Phase.periodCount` give the range.

## Bootstrap — `src/utils/roadmap.ts`

```
bootstrapRoadmap(items, phases) → { lanes: { name, items: { name, startPeriod, periodCount, wbsItemIds }[] }[] }
```

Pure and previewable. Depth-0 nodes become lanes in `displayOrder`; each depth-1 node becomes an item linked to itself (the subtree follows by inheritance), windowed to the period range of its effective phase; a depth-1 node whose effective phase is null is created as an item spanning the whole project and flagged in the preview. A forest with no depth-1 nodes yields one lane named after the project and depth-0 items. The preview table shows lane · item · hours · window · phase before anything is written; apply is one transactional bulk write.

## Calendar adapters — `src/utils/roadmap.ts`

- `periodToDate(period, planningMode, startDate)` / `dateToPeriod(date, …)` — the only place calendar arithmetic lives. Round-trip must be exact at period boundaries. With `startDate` null the timeline uses a synthetic epoch and shows ordinals only.
- `snapToPeriod(start, end, planningMode, startDate)` → `{ startPeriod, periodCount }` — applied to every drag/resize result before persisting.
- `toRoadmapRows(lanes, items, effort, collapsed)` → the flat render list the chart draws: one row per lane, then its items unless the lane is collapsed. Each row carries what the renderer needs and nothing more — kind (`lane` | `bar` | `milestone`), name, window, hours, FTE, the empty-scope flag, and the periods that carry over-demand. Pure and unit-tested; the component maps it to DOM without further derivation.

Pixel geometry is not here — it lives in `roadmapGeometry.ts` and is specified in `timeline-component.md`. This file stops at periods; that one turns periods into coordinates. The seam matters: everything above it survives a change of renderer.

## API surface

Follow the existing WBS endpoint shape in `server.ts`, and add the matching `.strict()` schemas in `server-validation.ts` — an unlisted field returns 400.

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/api/projects/:id/roadmap` | — | `{ lanes: [{ …lane, items: [{ …item, wbsItemIds }] }] }` in one round trip |
| `POST` | `/api/projects/:id/roadmap/lanes` | `{ name }` | appended at the end |
| `PATCH` | `/api/roadmap-lanes/:id` | `{ name?, displayOrder? }` | |
| `DELETE` | `/api/roadmap-lanes/:id` | — | cascades to items and links |
| `POST` | `/api/projects/:id/roadmap/items` | `{ laneId, name, kind?, startPeriod, periodCount }` | |
| `PATCH` | `/api/roadmap-items/:id` | `{ name?, laneId?, kind?, startPeriod?, periodCount?, displayOrder? }` | `periodCount` must be `>= 1` for bars, `0` for milestones |
| `DELETE` | `/api/roadmap-items/:id` | — | cascades links; scope becomes unplaced |
| `PUT` | `/api/roadmap-items/:id/links` | `{ wbsItemIds: number[] }` | replace the item's direct links; a listed node currently linked elsewhere moves; mirrors `replaceWbsEstimates` |
| `PUT` | `/api/wbs-items/:id/roadmap-link` | `{ roadmapItemId: number \| null }` | the WBS-side edit; `null` unlinks |
| `POST` | `/api/projects/:id/roadmap/bulk` | the `bootstrapRoadmap` output | transactional; refused with 409 unless the roadmap is empty |
| `PATCH` | `/api/projects/:id` | `{ startDate }` | extend the existing project-settings schema; ISO date or `null` |
| `PATCH` | `/api/projects/:id/roadmap/reorder` | `{ lanes?: [{id, displayOrder}], items?: [{id, laneId, displayOrder, startPeriod?, periodCount?}] }` | vertical drag (`spec-roadmap-vertical-drag.md`): one `prisma.$transaction`; every id verified to belong to the project first; responds with the full roadmap payload |

### Vertical drag reorder — the one exception to "single-item PATCH only"

`PATCH /api/projects/:id/roadmap/reorder` is the sole batch-write endpoint on the roadmap surface, added for reorder-within-a-lane, cross-lane move (optionally combined with a window move in the same gesture), and lane reorder. Every lane and item id it touches gets `displayOrder` renumbered **contiguously `0…n-1`** within its lane — no fractional ranks, no gaps — because a cross-lane drop can renumber two lanes and move a window in one user gesture, and the product decision is that this commits atomically or not at all (partial writes are unacceptable). `startPeriod`/`periodCount` are optional per item and are sent ONLY for a bar whose window the same gesture moved; the same `kind`/`periodCount` refinement the single-item `PATCH` enforces applies here too (a spread item's window write is still refused). This is a scoped exception to the WBS reorder precedent (`spec-wbs-drag-drop.md`), which forbade a batch endpoint because WBS placement only ever rewrites one row plus independently-failable sibling bumps — the roadmap case is different, and the exception does not generalize elsewhere.

Every link write runs the project and milestone invariants above. `GET /api/projects/:projectId/wbs` is unchanged; the WBS tab learns its `Roadmap` column from the roadmap payload, not from a new field on `WbsItem`.

## Demand engine — `src/utils/roadmapLoad.ts`

Pure, unit-tested, no React. Reuses `hoursPerPeriod` and `resolveDiscipline` rather than re-deriving them.

**Contract.** The engine consumes *demand distributions*, not items: a distribution is `Map<period, Map<role, hours>>`. Two producers exist today; a profile editor would be a third and would change nothing downstream.

**Producer 1 — placed effort.** For a bar *R* with effort `E(R, r)` (from `itemEffort`) and window `[s, s + n)`:

```
demandHours(R, r, p) = E(R, r) / n          for each period p in the window
```

**Producer 2 — phase baseline.** For an unplaced leaf *i* with effective phase φ covering periods `[a, a + m)`:

```
demandHours(i, r, p) = hours(i, r) / m       for each period p in φ
```

A leaf with no effective item and no effective phase is *unplaceable*: it produces no distribution and is reported by `coverage`.

**Totals.**

```
demandHours(r, p) = Σ over all distributions covering p
demandFte(r, p)   = demandHours(r, p) / hoursPerPeriod(planningMode, daysInFTE)
```

**Invariant (tested):** `Σ_p Σ_r demandHours(r, p) + unplaceableHours == projectTotal.wbsHours` from `buildReconciliationReport`. The by-period view is a redistribution of the WBS-3 total, never a different number.

**Supply.** From the Resource Plan, for each plan row of role *r* with allocation `a%` in period *p*:

```
supplyHours(r, p) = Σ (a / 100) × hoursPerPeriod(planningMode, daysInFTE)
```

Role matching is exact on `role`; unmatched rows fall back to discipline via `resolveDiscipline`, and what still fails to match lands in the existing Unmapped bucket rather than being silently dropped.

**Variance and feasibility.**

```
variance(r, p)      = demandHours(r, p) − supplyHours(r, p)   // > 0 under-staffed, < 0 idle
feasiblePeriods(R)  = max over roles r of ceil( E(R, r) / avgSupplyHours(r, window) )
```

`feasiblePeriods` answers "at this staffing, this window cannot be shorter than N periods". It uses the average supply over the item's current window; the editor states that.

**Sign convention.** Positive variance (demand above supply) is styled amber and negative (idle capacity) red, matching `varianceClass` in `ReconciliationPanel.tsx`. Do not introduce a second colour language.

**Rounding.** Round only at render, never in the engine. Per-cell rounding to one decimal means a column of displayed cells can differ from the exact total by a few hours; that is expected and must not be "fixed" by rounding the engine's output.

## Consumers

One engine, five readers — none of them re-implements the math:

- the bar's hours/FTE label and its out-of-capacity stripe (CAP-6, CAP-9)
- the tooltip's per-role demand-versus-supply lines (CAP-6)
- the load strip (CAP-9)
- the by-period matrix in `ReconciliationPanel` (CAP-10)
- the roadmap → draft plan generator (CAP-13)

and `coverage` feeds the three new reconciliation categories (CAP-7) and the empty-scope bar style (CAP-6).

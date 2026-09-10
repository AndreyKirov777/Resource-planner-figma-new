# Data model, adapters and formulas

Companion to `SPEC.md`. Load-bearing detail for CAP-2, CAP-6, CAP-7, CAP-8, CAP-10, CAP-12 and CAP-13.

## Schema delta

Three additions. Nothing existing changes.

```prisma
model Project {
  // ...existing fields
  startDate       DateTime?     // anchors period 1; null = not yet set
}

// Optional scheduling layer over a WbsItem. Absent row = unscheduled item.
model WbsSchedule {
  id              Int       @id @default(autoincrement())
  startPeriod     Int                       // 1-based, in the project's planningMode unit
  periodCount     Int       @default(1)     // >= 1
  kind            String    @default("task") // "task" | "milestone"
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  wbsItemId       Int       @unique
  wbsItem         WbsItem   @relation(fields: [wbsItemId], references: [id], onDelete: Cascade)
}
```

`WbsItem` gains the back-relation `schedule WbsSchedule?` plus the two dependency relations below. `onDelete: Cascade` means deleting a WBS item removes its schedule with it, matching how `WbsEstimate` already behaves.

```prisma
// Typed, lagged dependency between two WBS items. Mirrors SVAR's ILink so the
// adapter stays a rename, not a translation.
model WbsDependency {
  id              Int       @id @default(autoincrement())
  type            String    @default("FS")   // "FS" | "SS" | "FF" | "SF"
  lagPeriods      Int       @default(0)      // may be negative (lead)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  fromWbsItemId   Int
  toWbsItemId     Int
  from            WbsItem   @relation("WbsDepFrom", fields: [fromWbsItemId], references: [id], onDelete: Cascade)
  to              WbsItem   @relation("WbsDepTo",   fields: [toWbsItemId],   references: [id], onDelete: Cascade)

  @@unique([fromWbsItemId, toWbsItemId])
}
```

`lagPeriods` is in the project's planning unit, like everything else here. Both sides cascade, so deleting an item drops the links that touched it.

### Why periods and not dates

`Allocation.periodNumber`, `Phase.periodCount`, `modeConversion.ts` and `getPhaseForPeriod` all speak in ordinal periods. Storing ISO dates would force a translation on every reconciliation read and would make `Project.startDate` edits rewrite every row. With periods, moving the start date shifts only the rendered scale.

## API surface

Follow the existing WBS endpoint shape in `server.ts`, and add the matching `.strict()` schemas in `server-validation.ts` — an unlisted field returns 400.

| Method | Path | Body | Notes |
|---|---|---|---|
| `PUT` | `/api/wbs-items/:id/schedule` | `{ startPeriod, periodCount, kind? }` | upsert; creates the row on first schedule |
| `DELETE` | `/api/wbs-items/:id/schedule` | — | unschedules; the item reverts to a derived range |
| `PATCH` | `/api/projects/:id` | `{ startDate }` | extend the existing project-settings schema |
| `POST` | `/api/wbs-dependencies` | `{ fromWbsItemId, toWbsItemId, type?, lagPeriods? }` | 400 on cycle or self-link |
| `PATCH` | `/api/wbs-dependencies/:id` | `{ type?, lagPeriods? }` | re-runs the cycle check |
| `DELETE` | `/api/wbs-dependencies/:id` | — | |

`GET /api/projects/:id/wbs-items` includes `schedule` on each item, and the project fetch carries the dependency list, so `App.tsx` keeps loading the WBS in one round trip.

### Cycle rejection

A dependency graph cycle is not the same thing as the parent-tree cycle `wouldCreateCycle` guards in `wbsTree.ts` — that helper does not apply. Add a DAG check (depth-first from `toWbsItemId`, fail if `fromWbsItemId` is reachable) and run it at the API boundary on create and on any edit, so a bad link cannot be persisted even by a direct call.

## Adapters — `src/utils/wbsGantt.ts`

Pure, unit-tested, no React.

- `toGanttTasks(items, phases, planningMode, startDate)` → SVAR tasks. `parentId → parent`; depth-0 and any item with children → `type: "summary"`; `kind === "milestone"` → `type: "milestone"`; `startPeriod`/`periodCount` → `start`/`end` via `periodToDate`; unscheduled items get the phase-derived range and a flag the bar renderer uses for the ghost style.
- `periodToDate(period, planningMode, startDate)` / `dateToPeriod(date, …)` — the only place calendar arithmetic lives. Round-trip must be exact for period boundaries.
- `snapToPeriod(start, end, planningMode, startDate)` → `{ startPeriod, periodCount }` — applied to every drag/resize result before persisting, so no item can start mid-period.
- `phaseClassFor(date, phases, planningMode, startDate)` → the CSS class fed to SVAR's `highlightTime`, which is what paints the phase bands.
- `derivedRange(item, phases)` → the phase-spanning range for an unscheduled item.
- `phaseForSchedule(startPeriod, phases)` → the phase a bar now sits in, for the drag-across-bands reassignment in CAP-4.
- `isOutOfPhase(schedule, phaseName, phases)` → true when the scheduled periods fall outside the assigned phase; feeds CAP-8's out-of-phase category.
- `toGanttLinks(dependencies)` / `fromGanttLink(link)` — a rename, not a translation: `fromWbsItemId → source`, `toWbsItemId → target`, `type`, `lagPeriods → lag`.

## Demand engine — `src/utils/scheduleLoad.ts`

Pure, unit-tested, no React. Reuses `hoursPerPeriod` and `resolveDiscipline` rather than re-deriving them.

**Demand.** For a scheduled leaf item *i* with estimate `hours(i, r)` for role *r*, and duration `periodCount(i)`:

```
demandHours(i, r, p) = hours(i, r) / periodCount(i)     for each period p the item covers
demandHours(r, p)    = Σ over all items i covering p
demandFte(r, p)      = demandHours(r, p) / hoursPerPeriod(planningMode, daysInFTE)
```

Even spread is a deliberate simplification (see SPEC Assumptions). Parents contribute nothing of their own — only leaves carry estimates that count, matching `rollupHours` semantics in `wbsTree.ts`.

**Supply.** From the Resource Plan, for each plan row of role *r* with allocation `a%` in period *p*:

```
supplyHours(r, p) = Σ (a / 100) × hoursPerPeriod(planningMode, daysInFTE)
```

Role matching is exact on `role`; unmatched rows fall back to discipline via `resolveDiscipline`, and what still fails to match lands in the existing Unmapped bucket rather than being silently dropped.

**Variance and feasibility.**

```
variance(r, p)      = demandHours(r, p) − supplyHours(r, p)   // > 0 under-staffed, < 0 idle
feasiblePeriods(i)  = max over roles r of ceil( hours(i, r) / supplyHours(r, ·) )
```

`feasiblePeriods` uses the supply available across the item's current window; it answers "at this staffing, this cannot take fewer than N periods".

**Sign convention.** Positive variance (demand above supply) is styled amber and negative (idle capacity) red, matching `varianceClass` in `ReconciliationPanel.tsx`, where WBS above plan is already amber. Do not introduce a second colour language.

**Rounding.** Round only at render, never in the engine. Per-cell rounding to one decimal means a column of displayed cells can differ from the exact total by a few hours; that is expected and must not be "fixed" by rounding the engine's output.

## Dependency rules — `src/utils/scheduleLinks.ts`

Pure, unit-tested, no React. Two stages, shipped in two slices.

**Stage 1 — validation only (CAP-12).** For each link, the earliest period the successor may start:

```
FS: from.startPeriod + from.periodCount + lag        (finish → start)
SS: from.startPeriod + lag                           (start → start)
FF: from.startPeriod + from.periodCount + lag − to.periodCount
SF: from.startPeriod + lag − to.periodCount
```

`violations(items, schedules, deps)` returns every link whose successor starts earlier than that, with the shortfall in periods. Nothing is moved and nothing in the UI suggests it will be — a flagged violation is an honest statement, a silently ignored link is not.

**Stage 2 — forward pass (CAP-13).** `reschedule(changedId, items, schedules, deps)`:

1. Topologically order the successors reachable from `changedId`; a cycle here is a bug, since the API refuses to persist one.
2. For each in order, set `startPeriod = max(current, earliest allowed by every incoming link)`. Successors only ever move later — this is a forward pass, never a solver.
3. Snap to period boundaries and clamp at 1.
4. Return the full set of changed schedules so the caller persists them in one batch and one undo covers the whole cascade.

Items with no schedule row are skipped, not scheduled implicitly. What happens when a shift pushes work out of its phase or past the last phase is an open question in `SPEC.md` — settle it before this stage is built.

**Derived from the same graph:** the project end date (max finish over all scheduled items) and the critical path (the longest chain by duration plus lag). Both are read-only outputs; neither is stored.

## Consumers

One engine, five readers — none of them re-implements the math:

- the bar's hours/FTE label and its out-of-capacity stripe (CAP-5)
- the tooltip's demand-versus-supply lines (CAP-5)
- the load strip (CAP-7)
- the by-period section of `ReconciliationPanel` (CAP-8)
- the schedule → draft plan generator (CAP-10)

and the link rules feed three more: violation flags on bars (CAP-12), the reconciliation list of violated links (CAP-12), and the cascade plus critical path (CAP-13).

# Data model, adapters and formulas

Companion to `SPEC.md`. Load-bearing detail for CAP-2, CAP-6, CAP-7, CAP-8 and CAP-10.

## Schema delta

Two additions. Nothing existing changes.

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

`WbsItem` gains only the back-relation `schedule WbsSchedule?`. `onDelete: Cascade` means deleting a WBS item removes its schedule with it, matching how `WbsEstimate` already behaves.

### Why periods and not dates

`Allocation.periodNumber`, `Phase.periodCount`, `modeConversion.ts` and `getPhaseForPeriod` all speak in ordinal periods. Storing ISO dates would force a translation on every reconciliation read and would make `Project.startDate` edits rewrite every row. With periods, moving the start date shifts only the rendered scale.

## API surface

Follow the existing WBS endpoint shape in `server.ts`, and add the matching `.strict()` schemas in `server-validation.ts` — an unlisted field returns 400.

| Method | Path | Body | Notes |
|---|---|---|---|
| `PUT` | `/api/wbs-items/:id/schedule` | `{ startPeriod, periodCount, kind? }` | upsert; creates the row on first schedule |
| `DELETE` | `/api/wbs-items/:id/schedule` | — | unschedules; the item reverts to a derived range |
| `PATCH` | `/api/projects/:id` | `{ startDate }` | extend the existing project-settings schema |

`GET /api/projects/:id/wbs-items` includes `schedule` on each item, so `App.tsx` keeps loading the WBS in one request.

## Adapters — `src/utils/wbsGantt.ts`

Pure, unit-tested, no React.

- `toGanttTasks(items, phases, planningMode, startDate)` → SVAR tasks. `parentId → parent`; depth-0 and any item with children → `type: "summary"`; `kind === "milestone"` → `type: "milestone"`; `startPeriod`/`periodCount` → `start`/`end` via `periodToDate`; unscheduled items get the phase-derived range and a flag the bar renderer uses for the ghost style.
- `periodToDate(period, planningMode, startDate)` / `dateToPeriod(date, …)` — the only place calendar arithmetic lives. Round-trip must be exact for period boundaries.
- `snapToPeriod(start, end, planningMode, startDate)` → `{ startPeriod, periodCount }` — applied to every drag/resize result before persisting, so no item can start mid-period.
- `phaseClassFor(date, phases, planningMode, startDate)` → the CSS class fed to SVAR's `highlightTime`, which is what paints the phase bands.
- `derivedRange(item, phases)` → the phase-spanning range for an unscheduled item.
- `phaseForSchedule(startPeriod, phases)` → the phase a bar now sits in, for the drag-across-bands reassignment in CAP-4.
- `isOutOfPhase(schedule, phaseName, phases)` → true when the scheduled periods fall outside the assigned phase; feeds CAP-8's out-of-phase category.

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

## Consumers

One engine, five readers — none of them re-implements the math:

- the bar's hours/FTE label and its out-of-capacity stripe (CAP-5)
- the tooltip's demand-versus-supply lines (CAP-5)
- the load strip (CAP-7)
- the by-period section of `ReconciliationPanel` (CAP-8)
- the schedule → draft plan generator (CAP-10)

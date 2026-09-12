## Why

The Resource List roster stores only internal Hourly cost. After Rate Card gained a computed Price (client hourly rate), adding a role to the roster still drops that figure, so the planner cannot keep or edit a client rate on the list, cannot see roster-level margin, and Resource Plan still recomputes client rate from Default Margin instead of using the list value.

## What Changes

- Resource List table gains an editable **Hourly rate** column and a computed **Margin** column immediately after **Hourly cost**.
- Hourly rate is persisted on each resource-list row. Margin is display-only: `(hourlyRate − intRate × exchangeRate) / hourlyRate × 100` via the existing `marginPct` helper.
- Adding a rate-card role to the roster copies the visible Price into Hourly rate (same number the Price column shows for the active region).
- Applying a resource-list entry to a Resource Plan row copies that stored Hourly rate into the plan's `clientHourlyRate` (alongside the existing role, name, client role, and Hourly cost copy).
- Create/update, project copy, and JSON export/import carry the new field. Missing `hourlyRate` on import or on pre-existing rows is `0`.

### Never

- Persist Margin, or persist Price on the global rate card
- Reimplement money math outside `src/utils/calculations.ts`
- Change the Rate Card Price formula, Default Margin UI, or Excel import sheet
- Add an Hourly rate input to the "Add custom resource" form (table remains the editor; custom-add rows start at `hourlyRate: 0`)
- Backfill existing roster rows from Price or Default Margin
- Live-sync later Resource List Hourly rate edits into plan rows that were already created
- Bump JSON `schemaVersion` (additive field; omitted values import as `0`)
- Change WBS role pickers, Client View, or Excel/PNG column sets

### Ask First

- None. Fallback when a list row's Hourly rate is `0` (recompute plan client rate from Default Margin, as today) and "Add role" still seeding only the role (rates stay 0 until a list entry is applied) were assumed from current Resource Plan behavior.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `resource-list`: roster rows store an editable Hourly rate; the table shows Hourly rate and computed Margin after Hourly cost; seeding from the rate card copies Price into Hourly rate.
- `resource-plan`: applying a resource-list entry to a plan row copies that entry's Hourly rate into the plan's client hourly rate.

## Impact

- `prisma/schema.prisma` and a new migration — `ResourceList.hourlyRate`
- `server-validation.ts` / `server.ts` — create, update, copy, JSON import/export
- `src/services/api.ts` — `ResourceList` type and update payload whitelist
- `src/components/ResourceList.tsx` — columns; needs project `exchangeRate` and `clientCurrency` for Margin and formatting
- `src/components/RateCard.tsx` — seed `hourlyRate` from the same Price value already shown
- `src/components/ResourcePlan.tsx` — copy stored Hourly rate on role picker and typed-role match
- `server/planner/generateResourcePlan.ts` — seed generated list rows with the same Price figure
- Tests: ResourceList, RateCard (add-to-list), ResourcePlan (role apply), validation, generate-plan, a focused integration path

## Why

The Rate Card page shows only regional internal hourly rates. A planner cannot see the client hourly rate those internals produce at the open project's Default Margin, so they must leave the page or do the math themselves before adding a role.

## What Changes

- After the Discipline filter, the Rate Card page shows the open project's **Default Margin** (percentage, display-only).
- The grid gains a computed, non-editable **Price** column: Client Hourly Rate for the role at the **active region** tab, using that region's internal rate and the project's Default Margin and exchange rate.
- Price is derived live via the existing `clientHourlyRate` helper. It is not stored on the global rate card.

### Never

- Persist a client hourly rate (or Price) on `GlobalRateCard` / Excel import / export
- Edit Default Margin, currency, or exchange rate from the Rate Card page (those stay on Resource Plan)
- Add daily-rate or multi-region Price columns
- Change import sheet shape (`RMNG RATES`) or any REST contract
- Reimplement money math outside `src/utils/calculations.ts`

### Ask First

- None. Display-only Default Margin, Price header, and project-scoped FX were assumed from the request and the existing Resource Plan formula.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `rate-card`: the Rate Card page shows the open project's Default Margin after Discipline, and a computed Price (Client Hourly Rate) column for the active region.

## Impact

- `src/components/RateCard.tsx` — Default Margin field after Discipline; Price column after the visible regional rate; new props from the open project.
- `src/App.tsx` — pass `defaultMargin`, `exchangeRate`, and `clientCurrency` into `RateCard`.
- `src/utils/calculations.ts` — read-only (`clientHourlyRate`).
- `src/config/defaults.ts` — read-only fallback when `defaultMargin` is null.
- Tests: `src/components/RateCard.test.tsx`.

## Context

See proposal.md (Why) and `specs/rate-card/spec.md` for the behavior contract.

`RateCard` already receives `defaultLocation` from `currentProject` and shows one regional internal-rate column at a time. App only mounts that tab when a project is open. Money math already lives in `clientHourlyRate(internalRate, marginDecimal, exchangeRate)` (`src/utils/calculations.ts`): `(internalRate / (1 - margin)) * exchangeRate`, with margin as 0..1. Projects persist `defaultMargin` as 0–100 (nullable); Resource Plan and plan generation convert with `/ 100` and fall back to `APP_DEFAULTS.defaultMargin` (45). Regional internals are formatted as `$`; client amounts elsewhere use `€` / `£` / `$` from `clientCurrency`.

AG Grid is fully mocked in `RateCard.test.tsx`, so cell values are not queryable from the DOM today.

## Goals / Non-Goals

**Goals:**

- Thread the open project's `defaultMargin`, `exchangeRate`, and `clientCurrency` into `RateCard` the same way `defaultLocation` is already passed.
- Render Default Margin as read-only text in the existing filter row, immediately after Discipline.
- Add one always-visible, non-editable Price column after the regional rate columns, computed with `clientHourlyRate` from the active region's field.
- Cover Default Margin display and the null fallback in `RateCard.test.tsx`; keep Price math in the existing `calculations` unit tests.

**Non-Goals:**

- New helpers, endpoints, Prisma fields, or import/export changes.
- Extracting a shared `currencySymbol` utility (the EUR/GBP/`$` ternary is already duplicated; do not expand that in this change).
- Un-mocking AG Grid to assert cell text.
- Editing project settings from this page.

## Decisions

### 1. Pass project scalars as props, do not store Price

`App.tsx` passes `defaultMargin={currentProject.defaultMargin}`, `exchangeRate={currentProject.exchangeRate}`, and `clientCurrency={currentProject.clientCurrency}` into `RateCard`. Price is an AG Grid `valueGetter` over the active `REGION_FIELDS` entry — never a persisted column.

**Why:** Rate card rows are org-wide; client rate is project-scoped. Same threading pattern as `defaultLocation`.

**Alternative considered:** Persist `clientHourlyRate` on `GlobalRateCard`. Rejected — that would make one client price for every project and break the proposal Never list.

### 2. Convert margin at the boundary; call `clientHourlyRate` only

```ts
const marginPct = defaultMargin ?? APP_DEFAULTS.defaultMargin;
clientHourlyRate(Number(row[regionField]) || 0, marginPct / 100, exchangeRate);
```

Format Price like Resource Plan client hourly: `${symbol}${Math.round(value)}` with `clientCurrency === 'EUR' ? '€' : clientCurrency === 'GBP' ? '£' : '$'`. Internal regional columns stay `$`.

**Why:** Passing a raw percentage (45) into `clientHourlyRate` hits the `margin >= 1` guard and yields 0. The `/ 100` + null fallback is the existing Resource Plan / generate-plan contract.

**Alternative considered:** A new `rateCardClientPrice` wrapper. Rejected — one call site, and `calculations.ts` is already the single source of truth.

### 3. Default Margin is a label + text, not a disabled input

Place it in the filter flex row after Discipline: `Default Margin:` and `{marginPct.toFixed(0)}%`. No `onChange`.

**Why:** Spec is display-only. A disabled input would look like a broken editor.

**Alternative considered:** Reuse Resource Plan's editable Default Margin input and persist via `onProjectSettingsChange`. Rejected — out of scope (proposal Never).

### 4. Component tests cover the filter-row field; Price formula stays unit-tested

Extend `RateCard.test.tsx` for: field after Discipline, `45%` from props, null/`undefined` → application default 45%. Do not add a new calculation file or un-mock the grid.

**Why:** The mock makes Price cells invisible. The formula is already golden-tested in `calculations.test.ts`.

**Alternative considered:** Drop the AG Grid mock for one test. Rejected as disproportionate for a `valueGetter`.

## Risks / Trade-offs

- [Price not asserted in the grid] → Mitigation: `valueGetter` is a direct `clientHourlyRate` call; keep `calculations.test.ts` as the formula contract; visual check on apply.
- [Stale Price if settings change on another tab] → Mitigation: props come from `currentProject` in `App`; switching back remounts/re-renders with the latest settings.
- [FX surprise vs `$` internals] → Mitigation: internals stay USD `$`; Price uses the project's currency symbol and `exchangeRate`, matching how a role would be priced on Resource Plan.

## Migration Plan

No schema, API, or data migration. Deploy is a UI-only change. Rollback is revert of `RateCard.tsx`, `App.tsx`, and `RateCard.test.tsx`.

## Open Questions

None.

## Files

| File | Role |
| --- | --- |
| `src/components/RateCard.tsx` | Write: props, Default Margin field, Price column |
| `src/App.tsx` | Write: pass `defaultMargin`, `exchangeRate`, `clientCurrency` |
| `src/components/RateCard.test.tsx` | Write: Default Margin display + fallback |
| `src/utils/calculations.ts` | Read-only: `clientHourlyRate` |
| `src/config/defaults.ts` | Read-only: `APP_DEFAULTS.defaultMargin` |
| `src/utils/calculations.test.ts` | Read-only: existing Price formula coverage |

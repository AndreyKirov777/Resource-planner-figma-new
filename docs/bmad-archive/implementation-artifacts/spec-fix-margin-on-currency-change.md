p---
title: 'Recalculate margin when client currency changes'
type: 'bugfix'
created: '2026-09-04'
status: 'done'
baseline_commit: '81b53a558bcc41c87d59eb45ea0725817d112195'
review_loop_iteration: 0
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Resource Plan, changing Client currency only swaps the €/£/$ symbol. Stored client hourly rates and `exchangeRate` stay put, so row Margin, Calculated Project Margin, and phase margins do not change.

**Approach:** When the Client currency select changes, persist the new currency together with that currency's default `exchangeRate`. Leave every `clientHourlyRate` unchanged. Existing `buildPlanFinancials` then recomputes margins from the new FX.

## Boundaries & Constraints

**Always:**
- Pair currency → FX in one `onProjectSettingsChange` call: `{ clientCurrency, exchangeRate }`.
- Default FX is client-currency-per-USD (same unit as today): EUR `0.89`, USD `1`, GBP `0.79`.
- Unknown / empty currency → `APP_DEFAULTS.exchangeRate` (`0.89`).
- Keep stored `clientHourlyRate` and `intHourlyRate` on every plan row.
- Manual Exchange rate edits after a currency change still win; do not lock the field.
- Money math stays in `src/utils/calculations.ts` — do not reimplement margin.

**Ask First:**
- Changing these default FX numbers after approval.
- Also pairing FX when creating a project on Project List.

**Never:**
- Rewrite existing plan `clientHourlyRate` values (rejected option A).
- Add currencies to the Resource Plan dropdown.
- Edit `src/App.tsx`, `server.ts`, `server-validation.ts`, `src/utils/calculations.ts`, or `prisma/schema.prisma`.
- Change `ProjectList` create-project FX behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| USD → EUR | Select EUR | Settings `{ clientCurrency: 'EUR', exchangeRate: 0.89 }`; client rates unchanged; margins recompute with 0.89 | N/A |
| EUR → USD | Select USD | Settings `{ clientCurrency: 'USD', exchangeRate: 1 }`; margins recompute with 1 | N/A |
| USD → GBP | Select GBP | Settings `{ clientCurrency: 'GBP', exchangeRate: 0.79 }`; margins recompute with 0.79 | N/A |
| Same value | Reselect current currency | No settings write (Radix does not fire) | N/A |
| Unknown code | `exchangeRateForCurrency('CHF')` | `0.89` (`APP_DEFAULTS.exchangeRate`) | N/A |
| Empty plans | Currency change, `resourcePlans = []` | Settings still persist currency + FX; summary margin stays `0` | N/A |
| Manual FX after | User then edits Exchange rate to `0.95` | Persist `{ exchangeRate: 0.95 }` only; currency unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/config/defaults.ts` — **extend.** Today: `APP_DEFAULTS.exchangeRate = 0.89` (L16), `SUPPORTED_CURRENCIES` (L43). Add `exchangeRateForCurrency(code: string): number` (or a map + helper) as the single FX table. EUR must equal `APP_DEFAULTS.exchangeRate`.
- `src/components/ResourcePlan.tsx` — **edit one handler.** Client currency `onValueChange` at L1186 currently `{ clientCurrency: value }` only. Also pass `exchangeRate: exchangeRateForCurrency(value)`. Summary L1258–1259 and grid margin L490–493 already read `buildPlanFinancials(..., project.exchangeRate)` (L242–244); no formula change.
- `src/App.tsx` — **read-only.** `handleProjectSettingsChange` L694–710 already `api.updateProject` + `setCurrentProject` for `Partial<Project>`.
- `src/utils/calculations.ts` — **read-only.** `marginPct` / `grossMarginPct` already apply `internal * exchangeRate`.
- `src/config/defaults.test.ts` — **create.** Cover the helper rows in the I/O matrix (EUR/USD/GBP/unknown).
- `src/components/ResourcePlan.test.tsx` — **extend.** Grid is mocked (`data-testid="glide-grid"`). Assert the select callback payload; with a one-period allocated plan, `rerender` new `exchangeRate` and assert Calculated Project Margin changes while `onResourcePlansChange` is not used to rewrite rates.

## Tasks & Acceptance

**Execution:**
- [x] `src/config/defaults.ts` — add `exchangeRateForCurrency` (EUR 0.89, USD 1, GBP 0.79, else `APP_DEFAULTS.exchangeRate`) — single FX table
- [x] `src/components/ResourcePlan.tsx` — currency `onValueChange` sends `{ clientCurrency, exchangeRate }` — trigger margin recompute without touching plan rates
- [x] `src/config/defaults.test.ts` — unit-test helper I/O rows — lock the FX table
- [x] `src/components/ResourcePlan.test.tsx` — select change sends paired settings; allocated-plan rerender shows new Calculated Project Margin — prove B behavior in the UI

**Acceptance Criteria:**
- Given a plan with stored client rates, when Client currency changes, then those rates are not rewritten and Calculated Project Margin uses the new default FX.
- Given the user then types a new Exchange rate, when they blur/change that input, then only `exchangeRate` is persisted.

## Design Notes

`exchangeRate` is client-units per USD. Switching USD→EUR with unchanged client rates raises displayed margin because internal USD cost is converted with a smaller FX (0.89 vs 1). That is the intended B outcome.

```ts
// USD, rate 1: marginPct(100, 50, 1) === 50
// EUR, rate 0.89: marginPct(100, 50, 0.89) === 55.5
```

GBP `0.79` is a static default, not a live market feed. Switching EUR→GBP→EUR resets a custom FX back to the table value.

## Verification

**Commands:**
- `npx vitest run src/config/defaults.test.ts src/components/ResourcePlan.test.tsx src/utils/calculations.test.ts` — expected: all pass
- `npm run typecheck` — expected: clean

## Suggested Review Order

**Currency → FX pairing**

- Entry point: currency select now writes currency and default FX together
  [`ResourcePlan.tsx:1186`](../../../src/components/ResourcePlan.tsx#L1186)

- Single FX table; unknown codes fall back to `APP_DEFAULTS.exchangeRate`
  [`defaults.ts:55`](../../../src/config/defaults.ts#L55)

- EUR/USD/GBP defaults (EUR stays bound to `APP_DEFAULTS`)
  [`defaults.ts:48`](../../../src/config/defaults.ts#L48)

**Tests**

- Helper locks EUR 0.89, USD 1, GBP 0.79, and unknown fallback
  [`defaults.test.ts:4`](../../../src/config/defaults.test.ts#L4)

- Select payloads, empty-plan persist, manual FX, and summary margin rerender
  [`ResourcePlan.test.tsx:167`](../../../src/components/ResourcePlan.test.tsx#L167)

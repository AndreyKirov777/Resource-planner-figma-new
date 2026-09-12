## 1. Rate Card UI

- [x] 1.1 In `src/components/RateCard.tsx`, add optional `defaultMargin`, `exchangeRate`, and `clientCurrency` props; show read-only `Default Margin:` `{n}%` immediately after the Discipline filter (`defaultMargin ?? APP_DEFAULTS.defaultMargin`); add a non-editable Price column after the regional rates whose `valueGetter` is `clientHourlyRate(activeRegionInternal, marginPct / 100, exchangeRate)` formatted `${symbol}${Math.round(value)}` with the EUR/GBP/`$` ternary. Verify the filter row shows Default Margin after Discipline and the Price column is present in `columnDefs`.
- [x] 1.2 In `src/App.tsx`, pass `defaultMargin`, `exchangeRate`, and `clientCurrency` from `currentProject` into `RateCard`. Verify the Rate Card tab still mounts and TypeScript accepts the new props.

## 2. Tests

- [x] 2.1 Extend `src/components/RateCard.test.tsx` so Default Margin appears after Discipline, displays `45%` from props, and falls back to `45%` when `defaultMargin` is null or omitted. Verify with `npx vitest run src/components/RateCard.test.tsx`.
- [x] 2.2 Run `npm run typecheck` and fix any new-prop errors in Rate Card callers or fixtures. Verify typecheck exits 0.

## 3. Docs

- [x] 3.1 Leave the delta at `openspec/changes/rate-card-client-hourly-price/specs/rate-card/spec.md` as the behavior contract; if implementation forces a spec tweak, edit that delta only. Do not edit `docs/bmad-archive/` or the main `openspec/specs/rate-card/spec.md`. Verify `openspec validate rate-card-client-hourly-price --strict` still passes.

## 4. Final verification

- [x] 4.1 Run `npm run typecheck` and `npx vitest run src/components/RateCard.test.tsx`; both pass.

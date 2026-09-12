## Context

See proposal.md (Why) and the delta specs under `specs/` for the behavior contract.

Resource List rows persist `intRate` (Hourly cost, USD) and have no client-rate field. Rate Card already computes Price with `clientHourlyRate(activeRegionInternal, defaultMargin / 100, exchangeRate)` but `handleAddRateCard` copies only role, client role, description, `intRate`, and location. Resource Plan already stores `clientHourlyRate`; applying a list entry recomputes it from `intRate` + `project.defaultMargin || 25` + `exchangeRate` at both the role-picker and typed-role sites.

`toResourceListUpdatePayload` and both Zod resource-list schemas are `.strict()` field whitelists — a new persisted key that is not added there is silently dropped or 400'd. JSON export of lists is Prisma `include`; copy and import map fields by hand. AG Grid is mocked in ResourceList and RateCard tests, so cell text is not queryable.

## Goals / Non-Goals

**Goals:**

- Persist `hourlyRate` on `ResourceList` with Prisma default `0`; thread it through create/update, copy, JSON import, generate-plan drafts, and the client type/payload whitelist.
- Add Hourly rate (editable) and Margin (valueGetter via `marginPct`) immediately after Hourly cost; format Hourly rate with the project's client-currency symbol like Rate Card Price.
- Seed `hourlyRate` from the same Price number Rate Card already shows; on plan apply, copy it to `clientHourlyRate` when non-zero.
- Cover the new field at the schema, generate-plan, and transfer-helper seams; keep formula coverage in existing `calculations` tests.

**Non-Goals:**

- New calculation helpers or a shared `currencySymbol` utility.
- Changing the `defaultMargin || 25` fallback used when list Hourly rate is 0 (leave those two call sites' fallback arithmetic as-is).
- Un-mocking AG Grid to assert cell text.
- Schema version bump or a data backfill of existing roster rows.

## Decisions

### 1. Persist `hourlyRate Float @default(0)` on ResourceList, not a computed column

Prisma field `hourlyRate` with `@default(0)`. Create/update Zod: `hourlyRate: z.number().optional()`. Server create uses `parsed.data.hourlyRate ?? 0`. Copy, JSON import, and `GeneratePlanResourceList` / `DraftResourceList` include the field; omitted import values become `0`. No `schemaVersion` bump.

**Why:** Hourly rate is user-editable after seed, so it must be stored. Default `0` matches "empty Margin" and the zero-rate fallback on plan apply without a backfill.

**Alternative considered:** Persist `clientHourlyRate` to match Resource Plan. Rejected — Resource List already uses `intRate` (not `intHourlyRate`); `hourlyRate` matches the column title. Mapping is one assignment at the plan boundary.

### 2. Margin is a valueGetter; call `marginPct` only

```ts
marginPct(hourlyRate, intRate, exchangeRate)
```

Empty string when the helper returns `null` (Hourly rate ≤ 0). Format a number as `{n.toFixed(1)}%` like the plan grid. Do not persist Margin.

ResourceList needs `exchangeRate` and `clientCurrency` props from `currentProject` (same threading as RateCard). Hourly cost stays `$` + `toFixed(2)`. Hourly rate uses the existing EUR/GBP/`$` ternary and `Math.round`, matching Price / plan Hourly rate.

**Why:** `marginPct` is already the per-rate formula and already returns `null` for a non-positive client rate.

**Alternative considered:** Invert `clientHourlyRate` (`1 - intRate / hourlyRate`). Rejected — that ignores FX and would diverge from the plan grid.

### 3. Extract two tiny transfer helpers; do not un-mock the grids

In `RateCard.tsx`, extract the object already built in `handleAddRateCard` so Price and the add-to-list path share one `clientHourlyRate(...)` call. Export that helper and assert `hourlyRate` equals Price for a known region/margin/FX.

In `ResourcePlan.tsx`, extract the apply-from-list assignment used by the picker and the typed-role path:

```ts
const clientHourlyRate = selected.hourlyRate > 0
  ? selected.hourlyRate
  : calcClientHourlyRate(selected.intRate, (project.defaultMargin || 25.0) / 100, project.exchangeRate);
```

Keep the `25.0` fallback on the zero-rate branch so existing rows without a stored rate keep today's numbers.

**Why:** Specs require Price → list Hourly rate and list Hourly rate → plan client rate. Grid mocks hide cells; a helper is the testable seam.

**Alternative considered:** Drop the AG Grid mock. Rejected as disproportionate. Also considered switching `25` to `APP_DEFAULTS.defaultMargin` (45) on the fallback — rejected because the spec says the zero-rate path stays as before.

### 4. Generate-plan and App apply write `hourlyRate` too

`generateResourcePlan` already computes `clientRate` for plan rows. Set `hourlyRate: clientRate` on each draft list entry (same figure). `App.tsx` apply must pass `hourlyRate` through `createResourceList`; the plan-derived fallback list uses `plan.clientHourlyRate`.

**Why:** Generated rosters would otherwise land at `0` and then recompute from Default Margin when applied, undoing the transfer contract for the AI path.

**Alternative considered:** Leave generate-plan unchanged. Rejected — that path is how many rosters are created.

## Risks / Trade-offs

- [Strict Zod / payload whitelist drops `hourlyRate`] → Mitigation: add the key to both schemas, `toResourceListUpdatePayload`, create data, copy, and import in the same change.
- [Existing roster rows show empty Margin] → Mitigation: accepted; `0` default, no backfill (proposal Never). Plan apply still prices them via Default Margin.
- [Hourly rate edits do not update existing plan rows] → Mitigation: accepted one-shot transfer (proposal Never). Planner re-applies the list entry if they want the new rate.
- [Currency mix: `$` cost vs client-currency rate] → Mitigation: same split Rate Card and Resource Plan already use; document in the column formatters only.

## Migration Plan

1. Add `hourlyRate Float @default(0)` via a Prisma migration; run `npx prisma generate` (never hand-edit `src/generated/prisma`).
2. Deploy API + UI together so the new whitelist key is accepted.
3. Rollback: revert the migration (column drop) and the application commits. Existing `0` values are safe to drop.

No JSON schema bump. Old exports import with `hourlyRate: 0`.

## Open Questions

None.

## Files

| File | Role |
| --- | --- |
| `prisma/schema.prisma` | Write: `ResourceList.hourlyRate` |
| `prisma/migrations/<ts>_add_resource_list_hourly_rate/migration.sql` | Write: `ALTER TABLE` default 0 |
| `server-validation.ts` | Write: optional `hourlyRate` on create/update |
| `server-validation.test.ts` | Write: accept / reject unknown keys still |
| `server.ts` | Write: create default, copy, JSON import |
| `src/services/api.ts` | Write: type, `GeneratePlanResourceList`, payload whitelist |
| `src/components/ResourceList.tsx` | Write: columns, props for FX / currency |
| `src/components/ResourceList.test.tsx` | Write: custom-add still omits / zeros hourlyRate; fixtures |
| `src/components/RateCard.tsx` | Write: seed helper + `hourlyRate` on add |
| `src/components/RateCard.test.tsx` | Write: helper — Price copies into `hourlyRate` |
| `src/components/ResourcePlan.tsx` | Write: apply-from-list copies `hourlyRate` |
| `src/components/ResourcePlan.test.tsx` | Write: apply copies non-zero rate; fixtures gain `hourlyRate` |
| `src/App.tsx` | Write: pass FX/currency into ResourceList; apply generated `hourlyRate` |
| `server/planner/generateResourcePlan.ts` | Write: draft list `hourlyRate` |
| `server/planner/generateResourcePlan.test.ts` | Write: list `hourlyRate` matches computed client rate |
| `api.integration.test.ts` | Write: create/update persists `hourlyRate` |
| `src/utils/calculations.ts` | Read-only: `clientHourlyRate`, `marginPct` |
| `src/utils/calculations.test.ts` | Read-only: existing formula coverage |
| `src/config/defaults.ts` | Read-only: currency / default margin (Rate Card seed only) |

---
title: 'Daily Frankfurter exchange rates for USD, EUR, GBP'
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: '4c5ab5599c97217fa524a3bfaedf0e01d9c24ace'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Resource Plan pairs Client currency with a static FX table (EUR `0.89`, USD `1`, GBP `0.79`). Those numbers go stale; the app has no live market feed.

**Approach:** The server fetches USD→EUR and USD→GBP from Frankfurter at most once per UTC day, caches them in memory, and exposes `GET /api/exchange-rates`. The client loads that map on boot. `exchangeRateForCurrency` prefers today's live rates and falls back to the static table. Resource Plan currency change and ProjectList create-project both persist `{ clientCurrency, exchangeRate }` from that lookup. Stored project rates are not rewritten on load.

## Boundaries & Constraints

**Always:**
- FX unit stays client-currency-per-USD (Frankfurter `USD/EUR` and `USD/GBP` are already that unit). USD is always `1` — do not call Frankfurter for it.
- Fetch only `EUR` and `GBP` against base `USD` via Frankfurter v2 (`https://api.frankfurter.dev/v2/rate/USD/{quote}` or one equivalent `/v2/rates?base=USD&quotes=EUR,GBP` call).
- At most one Frankfurter network round-trip per UTC calendar day per server process. Same-day repeats return the in-memory cache.
- Frankfurter failure or invalid payload → serve static defaults (`EUR`/`unknown` = `APP_DEFAULTS.exchangeRate`, `USD` = `1`, `GBP` = `0.79`) with `source: 'fallback'`. Do not 5xx the client.
- Reach the API only through `src/services/api.ts`. Injectable fetch on the server (same seam style as the LLM `model` param) so tests never hit the network.
- Keep pairing `{ clientCurrency, exchangeRate }` on Resource Plan currency select and on ProjectList create. Manual Exchange rate edits still persist FX only.
- ProjectList create sends `exchangeRate: exchangeRateForCurrency(createCurrency)` (live overlay if loaded, else the static default). Do not hardcode `APP_DEFAULTS.exchangeRate`.
- Money math stays in `src/utils/calculations.ts`.

**Ask First:**
- Persisting the daily cache to SQLite (or any Prisma schema change).
- Auto-updating existing projects' stored `exchangeRate` when the daily rate changes.
- Adding currencies beyond USD/EUR/GBP to the Frankfurter fetch.

**Never:**
- Call Frankfurter from a React component or on every currency click.
- Rewrite stored `clientHourlyRate` / `intHourlyRate`.
- Change `src/utils/calculations.ts` or `prisma/schema.prisma`.
- Add currencies to the Resource Plan dropdown.
- Require an API key or a new npm dependency for Frankfurter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First fetch of the UTC day | Cache empty | Frankfurter called once; response `{ rates: { USD: 1, EUR: <live>, GBP: <live> }, date, source: 'frankfurter' }` | N/A |
| Same-day repeat | Cache already filled today | No Frankfurter call; same rates with `source: 'cache'` | N/A |
| Next UTC day | Cached date ≠ today | One new Frankfurter call; cache replaced | N/A |
| Frankfurter down / non-OK | Cache empty | `{ rates: { USD: 1, EUR: 0.89, GBP: 0.79 }, source: 'fallback' }` | Log; HTTP 200 |
| Invalid / missing rate | Payload lacks EUR or GBP | Fallback table for the missing code; do not cache a partial live map | Log |
| Currency select after boot | Live EUR `0.85` loaded | Settings `{ clientCurrency: 'EUR', exchangeRate: 0.85 }` | If live not loaded yet, static `0.89` |
| Unknown code | `exchangeRateForCurrency('CHF')` | `APP_DEFAULTS.exchangeRate` (`0.89`) | N/A |
| Manual FX after live select | User types `0.95` | Persist `{ exchangeRate: 0.95 }` only | N/A |
| Existing project | App loads; project FX is `0.79` | Project `exchangeRate` unchanged until currency select | N/A |
| Create with live rates | Create dialog currency GBP; overlay GBP `0.74` | `api.createProject` body includes `{ clientCurrency: 'GBP', exchangeRate: 0.74 }` | N/A |
| Create when API down | `getExchangeRates` failed; overlay unset; currency USD | `{ clientCurrency: 'USD', exchangeRate: 1 }` (static table) | Create still succeeds |
| Create unknown code | Currency CHF (ProjectList list); no live CHF | `{ clientCurrency: 'CHF', exchangeRate: 0.89 }` | N/A |

</frozen-after-approval>

## Code Map

- `src/config/defaults.ts:47–57` — **extend.** `EXCHANGE_RATE_BY_CURRENCY` + `exchangeRateForCurrency` stay the fallback table. Add `setLiveExchangeRates(rates)` / `__resetLiveExchangeRates()` (test-only) so the lookup prefers a live overlay when set. EUR fallback must stay equal to `APP_DEFAULTS.exchangeRate`.
- `src/App.tsx:67–85` — **extend boot.** `loadGlobalRateCards` (or the same mount `useEffect`) also calls `api.getExchangeRates()` and `setLiveExchangeRates`. Do not write `currentProject.exchangeRate` from this load. `handleProjectSettingsChange` L694–710 stays read-only — it already persists whatever ResourcePlan sends.
- `src/components/ResourcePlan.tsx:1186–1189` — **read-only handler.** Already pairs `exchangeRate: exchangeRateForCurrency(value)`. Live overlay makes this pick up today's rate with no handler rewrite.
- `src/components/ProjectList.tsx:87–94` — **edit create.** Today `exchangeRate: APP_DEFAULTS.exchangeRate` ignores `createCurrency`. Send `exchangeRate: exchangeRateForCurrency(createCurrency)`. Ensure overlay is loaded before create (App boot and/or `api.getExchangeRates()` when the create dialog opens). On GET failure, leave overlay unset so the helper returns the static default — do not block Create.
- `src/services/api.ts` — **add** `ExchangeRates` type + `api.getExchangeRates()` mirroring `getRateCardMeta` (L351–354). `API_BASE_URL` is `/api` (Vite proxies to :3001).
- `server/exchangeRates.ts` — **create.** `getDailyExchangeRates(fetchImpl?)`: UTC-date memory cache, Frankfurter fetch, parse `{ date, base, quote, rate }` (pair) or the `/v2/rates` array, validate finite positive EUR/GBP, `__resetExchangeRatesCache()` for tests. Pattern: `server/llm/config.ts` memo + `__resetAIConfigCache`.
- `server.ts` — **add GET** `/api/exchange-rates` above the SPA catch-all (L1785). `try/catch` → `res.json(...)` / `500` only for unexpected throws. No Zod (GET, no query). Import the helper; do not inline Frankfurter in the route.
- `src/utils/calculations.ts` — **read-only.** `marginPct` / `buildPlanFinancials` already apply `internal * exchangeRate`.
- `src/config/defaults.test.ts` — **extend.** Overlay wins; reset restores static EUR/USD/GBP/unknown rows.
- `server/exchangeRates.test.ts` — **create.** Cover the I/O matrix fetch/cache/fallback rows with a mocked `fetchImpl`.
- `src/components/ResourcePlan.test.tsx:167–210` — **extend one case.** After `setLiveExchangeRates({ EUR: 0.85, USD: 1, GBP: 0.74 })`, EUR select payload uses `0.85`. Existing static-table cases stay valid when overlay is unset.
- `src/components/ProjectList.test.tsx` — **create.** Assert create payload pairs currency with live FX; when overlay is unset, USD→`1` and CHF→`0.89`; Create is not disabled when `getExchangeRates` rejects.
- `prisma/schema.prisma` — **read-only.** No FX table. In-memory only.

## Tasks & Acceptance

**Execution:**
- [x] `server/exchangeRates.ts` — daily cache + Frankfurter fetch + reset hook — one network trip per UTC day; tests inject fetch
- [x] `server.ts` — `GET /api/exchange-rates` — thin route over the helper
- [x] `src/services/api.ts` — type + `getExchangeRates()` — only client I/O path
- [x] `src/config/defaults.ts` — live overlay on `exchangeRateForCurrency` — single FX lookup
- [x] `src/App.tsx` — load rates on boot, do not rewrite project FX — rates ready before currency select
- [x] `src/components/ProjectList.tsx` — create-project pairs `createCurrency` with `exchangeRateForCurrency` — new projects get today's rate, or the static default if the API is down
- [x] `server/exchangeRates.test.ts` + `src/config/defaults.test.ts` + `src/components/ResourcePlan.test.tsx` + `src/components/ProjectList.test.tsx` — lock I/O matrix rows

**Acceptance Criteria:**
- Given the cache is empty, when `GET /api/exchange-rates` runs twice on the same UTC day, then Frankfurter is called once and both responses share the same EUR/GBP rates.
- Given Frankfurter is unreachable, when the client changes Client currency or creates a project, then the static table is used and the UI does not error.
- Given live rates are loaded, when the user selects GBP, then settings persist `{ clientCurrency: 'GBP', exchangeRate: <live GBP> }` and plan row rates are unchanged.
- Given live rates are loaded, when the user creates a project with currency GBP, then `createProject` persists `{ clientCurrency: 'GBP', exchangeRate: <live GBP> }`.
- Given a project with a stored custom FX, when the app boots, then that project's `exchangeRate` is not overwritten.

## Design Notes

`exchangeRate` is client-units per USD. Frankfurter `USD/GBP` ≈ `0.74` replaces the static `0.79` as the default on **currency select** and **create-project**, not as a silent rewrite of every existing project.

```ts
// Cache hit: no fetch
// Miss: GET https://api.frankfurter.dev/v2/rate/USD/EUR
//       GET https://api.frankfurter.dev/v2/rate/USD/GBP
// USD is synthesized as 1
```

In-memory cache is lost on process restart — one extra Frankfurter call that day is acceptable (Ask First before persisting).

## Verification

**Commands:**
- `npx vitest run server/exchangeRates.test.ts src/config/defaults.test.ts src/components/ResourcePlan.test.tsx src/components/ProjectList.test.tsx src/App.test.tsx` — expected: all pass
- `npm run typecheck` — expected: clean

## Suggested Review Order

**Daily fetch and cache**

- One Frankfurter call per UTC day; injectable fetch; fallback on failure
  [`exchangeRates.ts:109`](../../server/exchangeRates.ts#L109)

- Thin GET above the SPA catch-all; 200 even when Frankfurter fails
  [`server.ts:1786`](../../server.ts#L1786)

**Client overlay**

- Live map overlays the static EUR/USD/GBP table without rewriting projects
  [`defaults.ts:67`](../../src/config/defaults.ts#L67)

- Boot loads rates; does not write `currentProject.exchangeRate`
  [`App.tsx:86`](../../src/App.tsx#L86)

- Resource Plan currency select already pairs via the same helper
  [`ResourcePlan.tsx:1188`](../../src/components/ResourcePlan.tsx#L1188)

**Create-project**

- New projects persist `exchangeRateForCurrency(createCurrency)`; Create stays enabled if GET fails
  [`ProjectList.tsx:109`](../../src/components/ProjectList.tsx#L109)

**API surface and tests**

- Only client I/O path for rates
  [`api.ts:362`](../../src/services/api.ts#L362)

- Cache, fallback, and non-USD-base rows
  [`exchangeRates.test.ts:24`](../../server/exchangeRates.test.ts#L24)

- Create payload uses live FX or the static table
  [`ProjectList.test.tsx:73`](../../src/components/ProjectList.test.tsx#L73)

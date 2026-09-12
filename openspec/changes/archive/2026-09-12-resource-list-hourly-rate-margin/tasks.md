## 1. Schema and API

- [x] 1.1 Add `hourlyRate Float @default(0)` to `ResourceList` in `prisma/schema.prisma` and a migration that `ALTER TABLE` adds the column with default `0`. Verify with `npx prisma generate` (do not hand-edit `src/generated/prisma`) and an existing row whose `hourlyRate` is `0`.
- [x] 1.2 Add optional `hourlyRate: z.number()` to `resourceListCreateSchema` and `resourceListUpdateSchema` in `server-validation.ts` (keep both `.strict()`). Verify a body with `hourlyRate` is accepted and an unknown key still 400s.
- [x] 1.3 In `server.ts`, persist `hourlyRate` on create (`?? 0`), project copy, and JSON import (`parseFloat` or `0` when omitted). Verify create-without-hourlyRate stores `0` and copy/import keep a provided value.
- [x] 1.4 Add `hourlyRate: number` to `ResourceList` and `GeneratePlanResourceList` in `src/services/api.ts`, and include `hourlyRate` in `toResourceListUpdatePayload`. Verify create/update payloads send the field and TypeScript callers compile.

## 2. Transfer and UI

- [x] 2.1 In `src/components/RateCard.tsx`, extract the add-to-list object so Price and the add path share one `clientHourlyRate(...)` call, and set `hourlyRate` to that Price. Verify the exported helper copies Price into `hourlyRate` for a known region/margin/FX.
- [x] 2.2 In `src/components/ResourceList.tsx`, add editable Hourly rate and non-editable Margin columns immediately after Hourly cost; Margin is `marginPct(hourlyRate, intRate, exchangeRate)` (empty when null); Hourly rate uses the project's client-currency symbol. Accept `exchangeRate` and `clientCurrency` props. Verify custom-add still only sends Hourly cost (`hourlyRate` omitted or `0`) and the new columns sit after Hourly cost in `columnDefs`.
- [x] 2.3 In `src/App.tsx`, pass `exchangeRate` and `clientCurrency` from `currentProject` into `ResourceList`, and pass `hourlyRate` through generate-plan apply (`entry.hourlyRate` or `plan.clientHourlyRate` on the fallback list). Verify TypeScript accepts the new props and apply includes `hourlyRate`.
- [x] 2.4 In `src/components/ResourcePlan.tsx`, extract apply-from-list used by the role picker and typed-role match: copy `hourlyRate` to `clientHourlyRate` when `hourlyRate > 0`, else keep `calcClientHourlyRate(intRate, (defaultMargin || 25) / 100, exchangeRate)`. Verify a non-zero list rate lands on the plan row and a `0` list rate still uses the old fallback.
- [x] 2.5 In `server/planner/generateResourcePlan.ts`, set draft list `hourlyRate` to the same `clientRate` already computed for plan rows. Verify the draft list rate matches the plan client rate for that role.

## 3. Tests

- [x] 3.1 Extend `server-validation.test.ts` so create/update accept `hourlyRate` and still reject unknown keys. Verify with `npx vitest run server-validation.test.ts`.
- [x] 3.2 Extend `src/components/RateCard.test.tsx` so the seed helper's `hourlyRate` equals Price for Ukraine / margin 45 / FX 1. Verify with `npx vitest run src/components/RateCard.test.tsx`.
- [x] 3.3 Extend `src/components/ResourceList.test.tsx` so custom-add still sends `intRate` and does not require Hourly rate, and typed fixtures include `hourlyRate`. Verify with `npx vitest run src/components/ResourceList.test.tsx`.
- [x] 3.4 Extend `src/components/ResourcePlan.test.tsx` so apply-from-list copies a non-zero `hourlyRate` onto `clientHourlyRate`; add `hourlyRate` to list fixtures. Verify with `npx vitest run src/components/ResourcePlan.test.tsx`.
- [x] 3.5 Extend `server/planner/generateResourcePlan.test.ts` so each draft list entry's `hourlyRate` equals that role's computed client rate. Verify with `npx vitest run server/planner/generateResourcePlan.test.ts`.
- [x] 3.6 Extend `api.integration.test.ts` so POST/PUT resource-list persists `hourlyRate` and omit defaults to `0`. Verify with `npx vitest run api.integration.test.ts`.
- [x] 3.7 Add `hourlyRate: 0` (or a real value) to typed `ResourceList` fixtures that `npm run typecheck` flags. Verify `npm run typecheck` exits 0.

## 4. Docs

- [x] 4.1 Leave the deltas at `openspec/changes/resource-list-hourly-rate-margin/specs/resource-list/spec.md` and `specs/resource-plan/spec.md` as the behavior contract; if implementation forces a spec tweak, edit those deltas only. Do not edit `docs/bmad-archive/` or the main specs (those merge on archive). Verify `openspec validate resource-list-hourly-rate-margin --strict` still passes.

## 5. Final verification

- [x] 5.1 Run `npm run typecheck` and `npx vitest run server-validation.test.ts src/components/RateCard.test.tsx src/components/ResourceList.test.tsx src/components/ResourcePlan.test.tsx server/planner/generateResourcePlan.test.ts api.integration.test.ts`; both pass.

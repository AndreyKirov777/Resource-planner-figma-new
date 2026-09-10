---
title: 'AI Plan Generation UI (Goal 2)'
type: 'feature'
created: '2026-06-30'
status: 'done'
baseline_commit: 'fbce00a14666f37afc9bd68fef5ea145d777ce83'
context:
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `POST /api/projects/generate-plan` endpoint (Goal 1b) is fully functional but there is no UI to invoke it — users cannot generate AI resource plans from the app.

**Approach:** Add a `GeneratePlanModal` dialog component triggered from the Resource Plan toolbar. The modal collects description, region, and applyProposedPhases inputs; calls `api.generatePlan()`; renders the returned draft resource plans and warnings; and offers an "Accept plan" stub for Goal 3.

## Boundaries & Constraints

**Always:**
- All server I/O via `src/services/api.ts` — no `fetch` directly from components.
- Dialog, Button, Select, Textarea, Label, Checkbox all from `src/components/ui/`.
- Use `cn()` from `src/components/ui/utils.ts` for conditional class composition.
- Region values sent to the API must be the 9 `REGION_COLUMNS` keys (e.g. `easternEurope`, `asiaGE`), not LOCATIONS slugs (kebab-case) — the modal defines its own label→value pairs.
- Modal open/close and form state lives inside `ResourcePlan.tsx` / `GeneratePlanModal.tsx` — no App.tsx state changes.
- TypeScript strict: no implicit `any`, fully typed API response.
- Send `applyProposedPhases` only when true (omit/undefined when false).

**Ask First:**
- Adding any npm dependency not already installed.
- Changing the 9 region display labels or their order.

**Never:**
- DB writes or App.tsx callbacks that persist data (that's Goal 3).
- Streaming responses.
- Reusing the kebab-case LOCATIONS slugs from `src/config/defaults.ts` as API region values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | description filled, region selected, project open | Loading view → result view with resourcePlans table + warnings | N/A |
| Empty description | description blank/whitespace | "Generate" button disabled | Prevent call |
| Non-OK response | server returns 4xx/5xx | `body.error` text shown in form area | User can fix and retry |
| Modal closed/cancelled | any form or result state | All state resets to defaults on next open | N/A |
| Accept stub | result displayed, user clicks "Accept plan" | `console.log('TODO Goal 3:', draft)` — no other side effects | N/A |

</frozen-after-approval>

## Post-approval amendments

> Recorded after the frozen intent was approved, per its "renegotiate" clause. Owner: Andrey, 2026-06-30. Source: UX proration in `docs/bmad-archive/planning-artifacts/ux-designs/ux-resource-planner-2026-06-30/` (`DESIGN.md` + `EXPERIENCE.md`). These supersede the matching wording in the frozen section.

1. **Surface: Dialog → right-docked Sheet.** The component is a right-docked `Sheet` (still from `src/components/ui/`, Radix-Dialog-based — dialog semantics preserved), renamed `GeneratePlanModal` → **`GeneratePlanSheet`**. The grid stays visible to its left and is never mutated. Wherever the frozen text says "modal" / "Dialog" / "GeneratePlanModal", read "Sheet" / "GeneratePlanSheet".
2. **Response type carries `rationale?`.** The live endpoint returns a per-row `rationale?: string`; `GeneratePlanResourcePlan` must include it (the result view renders it).
3. **Sheet receives the project's phases.** `GeneratePlanSheet` takes `phases` + `planningMode` props so the result view can render a per-week allocation timeline grouped by phase.

> Result-view scope note: the full result-view UX (rich result + per-week allocation timeline snapped to a 2h/day grid) is specified in the UX spines (`EXPERIENCE.md` → Component Patterns; `DESIGN.md` → `alloc-timeline`). The Tasks line for `GeneratePlanSheet` below is corrected for the three items above; expand its result-view detail to match the spines at implementation time.

## Code Map

- `src/services/api.ts` — add exported types + `api.generatePlan()` POST method
- `src/components/GeneratePlanSheet.tsx` — new right-docked Sheet component (all form/result/loading state)
- `src/components/ResourcePlan.tsx` — toolbar at line ~1440; `planningMode` const at line 193; `phases` state at line 199 — both available to pass as props
- `server-validation.ts:144` — `RATE_CARD_REGIONS` const: the 9 accepted camelCase region keys
- `docs/bmad-archive/planning-artifacts/ux-designs/ux-resource-planner-2026-06-30/EXPERIENCE.md` — behavioral spec, all state transitions, allocation timeline detail, copy
- `docs/bmad-archive/planning-artifacts/ux-designs/ux-resource-planner-2026-06-30/DESIGN.md` — visual tokens, `alloc-timeline` component

## Tasks & Acceptance

**Execution:**
- [x] `src/services/api.ts` — add exported types: `GeneratePlanRegion` (string union: `'ukraine' | 'easternEurope' | 'asiaGE' | 'asiaARMKZ' | 'latam' | 'mexico' | 'india' | 'newYork' | 'london'`); `GeneratePlanResourcePlan` (`role: string; clientRole: string | null; name: string | null; intHourlyRate: number; clientHourlyRate: number; displayOrder: number; rationale?: string; allocations: Array<{ periodNumber: number; allocation: number }>`); `GeneratePlanDraft` (`resourcePlans: GeneratePlanResourcePlan[]; phases?: Array<{ name: string; periodCount: number }>`); `GeneratePlanResponse` (`draft: GeneratePlanDraft; warnings: string[]`); `GeneratePlanRequest` (`mode: 'current' | 'new'; projectId?: number; description: string; region: GeneratePlanRegion; applyProposedPhases?: boolean`); add `generatePlan(data: GeneratePlanRequest, signal?: AbortSignal): Promise<GeneratePlanResponse>` — POSTs to `/api/projects/generate-plan` with JSON body, passes `signal` to `fetch`, on non-OK reads `body.error` and throws.
- [x] `src/components/GeneratePlanSheet.tsx` — new component (`Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetFooter` from `src/components/ui/sheet`). Props: `{ open: boolean; onOpenChange: (open: boolean) => void; projectId?: number; phases?: Phase[]; planningMode?: string }`. Local state: `description` (`''`), `region` (`GeneratePlanRegion`, `'ukraine'`), `applyProposedPhases` (`false`), `loading` (`false`), `error` (`string | null`), `result` (`GeneratePlanResponse | null`), `abortController` (`useRef<AbortController | null>(null)`). Define `REGIONS` constant: `[{value:'ukraine',label:'Ukraine'}, {value:'easternEurope',label:'Eastern Europe'}, {value:'asiaGE',label:'Asia (GE)'}, {value:'asiaARMKZ',label:'Asia (ARM, KZ)'}, {value:'latam',label:'LATAM'}, {value:'mexico',label:'Mexico'}, {value:'india',label:'India'}, {value:'newYork',label:'New York'}, {value:'london',label:'London'}]`. **Form view** (`!loading && !result`): Textarea (description, placeholder from EXPERIENCE.md), Select (region), Checkbox+Label (applyProposedPhases), error banner (red, `aria-live="assertive"`, only when `error`), footer: Cancel (→ close+reset) + Generate (primary, disabled when `!description.trim()`). **Loading view** (`loading`): quoted prompt + spinner + `Drafting team…` (`aria-live="polite"`), footer: Cancel only (→ `abortController.current?.abort()`). During loading ✕/overlay/Escape = abort + return to form with inputs intact, no error banner. On abort catch `AbortError` and skip error state. **Result view** (`!loading && result`): warnings callout (yellow, only when `result.warnings.length > 0`); table per `result.draft.resourcePlans`: role = `clientRole ?? role`, `intHourlyRate` and `clientHourlyRate` formatted to 2 decimals, `rationale?` (sub-line, hidden when absent); allocation timeline per EXPERIENCE.md `alloc-timeline` component pattern; footer: Back (→ `setResult(null)`, keep inputs) + Discard (→ close+reset) + Accept plan (`console.log('TODO Goal 3:', result.draft)`). On `onOpenChange(false)` from any path, reset all state to defaults.
- [x] `src/components/ResourcePlan.tsx` — import `GeneratePlanSheet`; add `const [showGeneratePlan, setShowGeneratePlan] = useState(false)` at component top; add `<Button size="sm" variant="outline" onClick={() => setShowGeneratePlan(true)}>✦ Generate AI Plan</Button>` in the `"flex items-center gap-2"` toolbar div (line ~1440); render `<GeneratePlanSheet open={showGeneratePlan} onOpenChange={setShowGeneratePlan} projectId={project.id} phases={phases} planningMode={planningMode} />` before the final closing `</div>` of the return.

**Acceptance Criteria:**
- Given the Resource Plan tab is open, when the user clicks "✦ Generate AI Plan", then the Sheet (right-docked) opens with empty description, region defaulted to Ukraine, and applyProposedPhases unchecked.
- Given the Sheet is open, when description is empty or whitespace-only, then "Generate" is disabled.
- Given the form is filled and Generate is clicked, when the API call is in flight, then loading view shows with `Drafting team…` spinner; form fields, ✕, and overlay are inert.
- Given loading is in flight, when the user clicks Cancel or presses Escape, then the request is aborted, form view returns with inputs intact and no error banner.
- Given the API responds successfully, when the result view renders, then each resourcePlan row shows `clientRole ?? role`, internal rate and client rate to 2 decimals; warnings appear in a yellow block only when `warnings.length > 0`.
- Given the API returns non-2xx, then `body.error` message appears in a red banner and inputs are preserved for retry.
- Given the result view, when "Accept plan" is clicked, then `console.log('TODO Goal 3:', result.draft)` fires and the Sheet stays open.
- Given the Sheet is closed via any path, when reopened, then all fields are at defaults and no previous result or error is shown.

## Design Notes

- **Read the spines:** `EXPERIENCE.md` "Component Patterns" and "State Patterns" govern all loading/error/cancel/result states and copy. `DESIGN.md` defines the `alloc-timeline` visual tokens and component spec. Resolve any ambiguity here by preferring the spines.
- **Abort pattern:** create `new AbortController()` on Generate, store in ref, pass `.signal` to `api.generatePlan()`. On `AbortError`: clear loading, do NOT set `error`, leave form inputs as-is.
- **Region union must match server:** `GeneratePlanRegion` must exactly mirror `RATE_CARD_REGIONS` in `server-validation.ts` — the server schema is `.strict()` and rejects unknown values.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: zero type errors
- `npm test` — expected: all existing tests pass, no regressions

**Manual checks:**
- Resource Plan tab → "✦ Generate AI Plan" button visible in toolbar
- Click → Sheet opens with empty form; region defaults to Ukraine
- Leave description blank → Generate disabled
- Fill description, click Generate → loading view with `Drafting team…` + Cancel
- Cancel during loading → aborted, form restored, no error
- Successful result → table shows formatted rates, rationale, allocation timeline
- Non-OK → red banner with `body.error`, inputs preserved
- Close and reopen → form reset to defaults

## Suggested Review Order

**State & abort design** *(entry point — understand this first)*

- `handleOpenChange` intercepts close during loading: aborts fetch, stays on form — never dismisses mid-flight
  [`GeneratePlanSheet.tsx:276`](../../../src/components/GeneratePlanSheet.tsx#L276)

- `handleGenerate` creates AbortController per call; AbortError caught silently, other errors surfaced as banner
  [`GeneratePlanSheet.tsx:290`](../../../src/components/GeneratePlanSheet.tsx#L290)

- `generatePlan` POST method: threads AbortSignal, reads `body.error` string on non-OK
  [`api.ts:368`](../../../src/services/api.ts#L368)

**Three-view composition**

- Loading view: quoted prompt + spinner + `Drafting team…` + abort Cancel; ✕ and overlay re-routed to abort
  [`GeneratePlanSheet.tsx:360`](../../../src/components/GeneratePlanSheet.tsx#L360)

- Form view: Textarea, Select, Checkbox, red `aria-live` error banner; Generate disabled when empty
  [`GeneratePlanSheet.tsx:403`](../../../src/components/GeneratePlanSheet.tsx#L403)

- Result view: warnings callout (conditional), rates table with rationale sub-lines, Back/Discard/Accept footer
  [`GeneratePlanSheet.tsx:504`](../../../src/components/GeneratePlanSheet.tsx#L504)

**Allocation timeline**

- `AllocTimeline`: phase-band header (week counts + name bands) + per-week snapped bars with a11y aria-label
  [`GeneratePlanSheet.tsx:73`](../../../src/components/GeneratePlanSheet.tsx#L73)

- `resolvePhases`: draft phases → prop phases → single fallback band; guards zero-weekCount contributions
  [`GeneratePlanSheet.tsx:323`](../../../src/components/GeneratePlanSheet.tsx#L323)

- `snapAllocation` rounds raw % to {0/25/50/75/100}; `barHeightPx` maps to pixel heights
  [`GeneratePlanSheet.tsx:53`](../../../src/components/GeneratePlanSheet.tsx#L53)

**ResourcePlan integration**

- "✦ Generate AI Plan" toolbar button wired to `showGeneratePlan` state
  [`ResourcePlan.tsx:1462`](../../../src/components/ResourcePlan.tsx#L1462)

- Sheet render at bottom of return: passes `projectId`, `phases` (state), `planningMode` (derived)
  [`ResourcePlan.tsx:1677`](../../../src/components/ResourcePlan.tsx#L1677)

**API types**

- 5 exported types: `GeneratePlanRegion` union + request/response interfaces; mirror `RATE_CARD_REGIONS` exactly
  [`api.ts:5`](../../../src/services/api.ts#L5)

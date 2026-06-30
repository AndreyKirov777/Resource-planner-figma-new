---
title: 'AI Planner & generate-plan endpoint (Goal 1b)'
type: 'feature'
created: '2026-06-30'
status: 'done'
baseline_commit: '3dcfae10e25ed545b82968b3b6ffac5f2059ad91'
context:
  - '{project-root}/docs/ai-resource-plan-generation-spec.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The LLM seam (Goal 1a) is in place but there is no planner logic, output schema, prompt, or HTTP endpoint to generate a resource plan from natural language — the feature is not usable.

**Approach:** Add a stateless `POST /api/projects/generate-plan` endpoint backed by a `server/planner/` module that builds a Zod output schema from the live rate card, renders a grouped role-menu prompt, calls `generateStructured()`, resolves rates, computes `clientHourlyRate`, expands per-phase allocations to periods, runs the existing validation gate, and returns `{draft, warnings}` — never writing to the DB.

## Boundaries & Constraints

**Always:**
- Prisma import from `./src/generated/prisma` (never `@prisma/client`).
- `margin` is persisted as 0–100; **divide by 100** before passing to `clientHourlyRate()`.
- Fallback margin when `project.defaultMargin` is null: `APP_DEFAULTS.defaultMargin`.
- Role enum built at request time from live `GlobalRateCard` rows.
- `generatePlanRequestSchema` uses `.strict()`; `projectId` required when `mode:"current"` (via `.refine()`); `region` is `z.enum` of exactly the 9 `GlobalRateCard` column names.
- Rate-limit: in-memory per-IP sliding window; thresholds from `ai.config.ts` `rateLimit.*` (via `loadAIConfig()`).
- `POST /api/projects/generate-plan` declared **above** the SPA catch-all in `server.ts`.
- Endpoint is read-only — zero DB writes.
- Tests use fixture rows in-process — **never seed or wipe `GlobalRateCard`** in tests.
- Use `MockLanguageModelV4` from `ai/test` in all unit/orchestration tests.

**Ask First:**
- Any new npm dependency not already installed.
- Changing the 9 region column names or the role taxonomy rules beyond what §7.4 specifies.

**Never:**
- DB writes in `generate-plan`.
- Streaming (`streamObject`) — v1 is non-streaming.
- UI changes (Goal 2), PlanRevision / apply-plan (Goal 3).
- Per-role region selection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy path | valid body, non-empty rate card, valid project, mock model | 200 `{draft:{resourcePlans:[...],phases?:[]},warnings:[]}` | N/A |
| Empty rate card | 0 rows in GlobalRateCard | 409 `{error:'Rate card is empty'}` — no LLM call | Check before calling generateResourcePlan |
| Rate limit exceeded | IP exceeds maxPerUser within windowSeconds | 429 `{error:'…',retryAfter:N}` — no LLM call | Sliding-window check before LLM |
| mode:current, no projectId | body `{mode:"current",description:"…",region:"ukraine"}` | 400 validation error | `.refine()` on schema |
| Unknown region | `region:"mars"` | 400 validation error | `z.enum` |
| LLM output violates schema | MockModel returns `{resources:[{role:"UNKNOWN"}]}` | 422 `{error:'…'}` | Catch `StructuredValidationError` |
| Provider/network error | `resolveModel()` throws non-validation error | 502/503 with friendly message | Generic catch |
| Client abort | request closes mid-generation | Generation cancelled | `AbortSignal` from `req.on('close')` |
| count > 1 | LLM emits `count:2` for a role | 2 identical ResourcePlan rows, separate `displayOrder` | Expand in loop |
| Zero-rate region | `resolveIntRate` returns 0 | Row included, soft warning emitted | Non-blocking |
| Discipline coherence | role's discipline ∉ selectedDisciplines | Row included, soft warning | Non-blocking |

</frozen-after-approval>

## Code Map

- `server/planner/rateCard.ts` — `normalizeTaxonomy(row)` → `{discipline,track,seniority}`; `buildRoleEnum(rows)` → string[]; `buildGroupedMenu(rows, region)` → string; `resolveIntRate(rows, role, region)` → number|undefined
- `server/planner/schema.ts` — `buildOutputSchema(roleEnum, disciplineEnum)` → Zod object (§7.1 shape)
- `server/planner/prompt.ts` — `SYSTEM_PROMPT` (§7.5 policy text) + `renderPrompt(projectCtx, menu)` → user prompt string
- `server/planner/phases.ts` — `expandPhaseAllocations(phaseAllocations, projectPhases)` → `{periodNumber,allocation}[]`
- `server/planner/generateResourcePlan.ts` — orchestration: `generateResourcePlan({rows,project,description,region,applyProposedPhases,model?})` → `{draft,warnings}`
- `server-validation.ts` — append `generatePlanRequestSchema` + `GeneratePlanRequestInput` type
- `server.ts` — add `POST /api/projects/generate-plan` above SPA catch-all; in-memory rate-limit store at module scope
- `server/planner/rateCard.test.ts` — unit tests for taxonomy + resolveIntRate + menu builder
- `server/planner/generateResourcePlan.test.ts` — orchestration unit tests with MockLanguageModelV4 + fixture rows
- `server-validation.test.ts` — extend with generatePlanRequestSchema cases + supertest 400/429 guards

Consumed (read-only):
- `server/llm/index.ts` — `generateStructured()`, `StructuredValidationError`
- `src/utils/calculations.ts` — `clientHourlyRate(intRate, marginDecimal, exchangeRate)`
- `src/config/defaults.ts` — `APP_DEFAULTS.defaultMargin`
- `server-validation.ts` — `resourcePlanCreateSchema`, `allocationSchema`
- `server/llm/config.ts` — `loadAIConfig()` for rate-limit thresholds

## Tasks & Acceptance

**Execution:**

- [ ] `server/planner/rateCard.ts` — implement `normalizeTaxonomy(row: GlobalRateCard)` per §7.4 (namingInPM→seniority map; combined bands→lower rung; empty namingInPM→classify from role name: `Team Lead|Manager`→lead, `Architect`→architect, else prefix table); `buildRoleEnum(rows)` → unique role strings; `buildGroupedMenu(rows, region)` → discipline-grouped string with rate+seniority tag per row; `resolveIntRate(rows, role, region)` → number|undefined (key-lookup into row by region column name)
- [ ] `server/planner/schema.ts` — `buildOutputSchema(roleEnum: [string,...string[]], disciplines: [string,...string[]])` returning `z.object({selectedDisciplines: z.array(z.enum(disciplines)), teamShape: z.string(), phases: z.array(...).optional(), resources: z.array(z.object({role: z.enum(roleEnum), count: z.number().int().min(1), phaseAllocations: z.array(z.object({phase:z.string(), allocation:z.number().int().min(0).max(100)})), rationale: z.string().optional()}))})` — all `.strict()` nested objects
- [ ] `server/planner/prompt.ts` — export `SYSTEM_PROMPT` string (§7.5 two-step selection policy); export `renderPrompt(ctx:{planningMode,totalPeriods,phases,clientCurrency,defaultMargin,description}, menu:string)` returning composed user prompt including context + menu + instruction to use SYSTEM_PROMPT discipline list
- [ ] `server/planner/phases.ts` — `expandPhaseAllocations(phaseAllocations:{phase:string,allocation:number}[], projectPhases:{name:string,periodCount?:number,weekCount?:number}[])` → `{periodNumber,allocation}[]`: for each phaseAllocation, find matching phase by name (case-insensitive), fill its period range; unmatched phases skipped and returned as warnings; uses `periodCount ?? weekCount ?? 0`
- [ ] `server/planner/generateResourcePlan.ts` — `generateResourcePlan(opts)` → `Promise<{draft,warnings}>`: (1) build disciplineEnum + roleEnum from rows; (2) call `buildOutputSchema` + `renderPrompt` + `generateStructured({system:SYSTEM_PROMPT, prompt, schema, model:opts.model})`; (3) for each resource×count: `resolveIntRate` (warn if undefined or 0), compute `clientHourlyRate(intRate, marginPct/100, project.exchangeRate)` with null fallback to `APP_DEFAULTS.defaultMargin`, validate with `resourcePlanCreateSchema`, expand `expandPhaseAllocations`; (4) soft warnings §8.6 (no PM, no QA with build roles, all-senior); (5) return `{draft:{resourcePlans, phases?:when applyProposedPhases && llmOutput.phases}, warnings}`
- [ ] `server-validation.ts` — append `generatePlanRequestSchema = z.object({mode:z.enum(['current','new']), projectId:z.number().int().optional(), description:z.string().min(1).max(4000), region:z.enum(['ukraine','easternEurope','asiaGE','asiaARMKZ','latam','mexico','india','newYork','london']), applyProposedPhases:z.boolean().optional()}).strict().refine(d=>d.mode!=='current'||d.projectId!=null,{message:'projectId required when mode is current',path:['projectId']})`; export `GeneratePlanRequestInput` type
- [ ] `server.ts` — add at module scope: `const rateLimitStore = new Map<string, number[]>()`; add `POST /api/projects/generate-plan` before SPA catch-all: validate body (400), fetch rate-card rows from `prisma.globalRateCard.findMany()` (409 if empty), sliding-window rate check using `loadAIConfig()` thresholds (429 with `retryAfter`), fetch project if mode=current (404), build AbortSignal (`new AbortController(); req.on('close', ()=>ac.abort())`), call `generateResourcePlan({rows,project,description,region,applyProposedPhases,model:undefined})`, catch `StructuredValidationError`→422, other AI/provider errors→502, return 200 `{draft, warnings}`
- [ ] `server/planner/rateCard.test.ts` — fixture rows (IC all 5 rungs via namingInPM, combined band `Junior/Strong Junior`, empty namingInPM with `Team Lead` suffix, empty namingInPM with `Architect` suffix, empty namingInPM IC fallback); assert `normalizeTaxonomy` track/seniority; assert `resolveIntRate` returns correct rate, undefined for unknown role, 0 for zero-rate row; assert `buildRoleEnum` unique and sorted
- [ ] `server/planner/generateResourcePlan.test.ts` — fixture rows + MockLanguageModelV4: happy path returns correct intHourlyRate and clientHourlyRate (verify margin÷100 applied); count:2 produces 2 rows with distinct displayOrder; null defaultMargin falls back to APP_DEFAULTS.defaultMargin; StructuredValidationError propagates (model returns bad JSON); soft warning emitted when no PM role present
- [ ] `server-validation.test.ts` (extend) — `generatePlanRequestSchema`: valid current-mode passes; missing projectId on mode:current fails with path=['projectId']; invalid region fails; extra field fails (.strict); valid new-mode without projectId passes

**Acceptance Criteria:**

- Given non-empty rate card + valid request body + mock model, when `POST /api/projects/generate-plan` is called, then 200 with `{draft:{resourcePlans:[…]}, warnings:[…]}`.
- Given 0 GlobalRateCard rows, when endpoint called, then 409 before any LLM call.
- Given IP exceeds `rateLimit.maxPerUser` within `windowSeconds`, when endpoint called, then 429 with `retryAfter`.
- Given `mode:"current"` without `projectId`, when schema validated, then 400 with path `projectId`.
- Given `region:"mars"`, when schema validated, then 400.
- Given mock model returning unknown role value, when `generateResourcePlan` runs, then `StructuredValidationError` thrown (endpoint returns 422).
- Given `count:2` in LLM output, when assembled, then 2 ResourcePlan rows with distinct `displayOrder` values.
- Given `project.defaultMargin = 45`, when `clientHourlyRate` computed, then margin decimal = 0.45 used (not 45).
- Given `project.defaultMargin = null`, when `clientHourlyRate` computed, then `APP_DEFAULTS.defaultMargin / 100` used as fallback.

## Design Notes

**Taxonomy normalization — critical gotcha (§7.4):**
- `namingInPM` → seniority: `junior`→`junior`, `strong junior`→`strong_junior`, `middle`→`middle`, `strong middle`→`strong_middle`, `senior`→`senior` (IC track).
- Combined bands → lower rung: `junior/strong junior` or `junior - strong junior` → `junior`; `strong middle/senior` → `strong_middle`.
- Lead/Architect labels (`team lead`, `expert/lead`, `senior lead`, `middle architect`, `senior architect`, `architect`) → `track:'lead'|'architect'`, `seniority:null`.
- **Empty namingInPM** (~26 rows): check role name: contains `Team Lead` or `Manager` → `lead`; contains `Architect` → `architect`; else IC + role-name prefix (`Associate…L1`→`junior`, `Associate…L2`→`strong_junior`, no prefix→`middle`, `Senior`→`strong_middle`, `Principal`→`senior`).
- **`Senior X` in role name = strong_middle, `Principal X` = senior.** Do NOT map "Senior" → senior from role name.

**9 region columns (z.enum source of truth):** `ukraine`, `easternEurope`, `asiaGE`, `asiaARMKZ`, `latam`, `mexico`, `india`, `newYork`, `london`.

**Rate-limit pattern:**
```ts
const now = Date.now();
const window = cfg.rateLimit.windowSeconds * 1000;
const hits = (rateLimitStore.get(ip) ?? []).filter(t => now - t < window);
if (hits.length >= cfg.rateLimit.maxPerUser) { /* 429 */ }
rateLimitStore.set(ip, [...hits, now]);
```

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no new type errors in `server/planner/` or `server-validation.ts`
- `npm test` -- expected: all 9 existing LLM seam tests pass; new planner + endpoint tests pass; no network calls

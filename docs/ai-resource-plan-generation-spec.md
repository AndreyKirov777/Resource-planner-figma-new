# AI Resource Plan Generation — Specification

> Generate a resource plan from a project description or a free-text prompt, using an LLM, grounded in the existing rate card and persisted through the existing validation path.

Status: Draft for implementation
Owner: TBD
Last updated: 2026-06-14

---

## 1. Summary

Add the ability to generate a draft resource plan from natural-language input. The user types a project description (or a short prompt), optionally picks a delivery region, and the system produces a set of editable `ResourcePlan` rows with per-period `Allocation`s. The user reviews and accepts the draft before anything is persisted.

The LLM only proposes **roles** (constrained to the rate card) and **allocations** (per phase). All money math and rate lookups are deterministic and happen server-side. The LLM integration uses the **Vercel AI SDK** (`ai`), a widely-used provider-agnostic framework, so the underlying model vendor can be swapped via a configuration file — no custom per-vendor adapters to maintain.

---

## 2. Goals & non-goals

### Goals
- Turn a text description into a reviewable draft resource plan.
- Ground role and rate choices in the existing `GlobalRateCard` (no hallucinated rates).
- Support two entry modes: generate into the **current project**, or create a **new project**.
- Keep the LLM vendor **pluggable** (no hard dependency on a single provider in core logic).
- Reuse the existing persistence and Zod validation path.
- Keep a human-in-the-loop: drafts are never auto-saved.

### Non-goals (first version)
- Token-by-token streaming UI (optional `streamObject`, added later).
- LLM setting project name, currency, margin, or `daysInFTE`.
- LLM choosing rate-card region per role (single region per generation for v1).
- Editing/optimizing an *existing* populated plan via prompt (future).

---

## 3. Key decisions (resolved)

| Decision | Choice |
|---|---|
| AI surface | **Assistant chat overlay**, not a separate tab — a collapsible panel docked over the current page that knows the open project's context (§11) |
| Draft review | **In the real `ResourcePlan` grid** behind the panel (preview state); the chat panel is the control surface (Accept / mode / Regenerate) |
| Iteration | **Multi-turn by re-generation** — follow-up messages rebuild the draft with conversation context; surgical edit of an existing *populated* plan stays a non-goal (§2) |
| Output target | **Both** — generate into current project *and* create a new project |
| LLM scope | Resources + allocations; **may** also propose phases/timeline when the prompt implies one |
| Project name / currency / margin / daysInFTE | **Defaults from the project** — LLM never sets them |
| Role/rate grounding | **Constrained to `GlobalRateCard`** (role is a schema enum) |
| Rate region | **Single "delivery region" selector** on the generate dialog |
| LLM coupling | **Vercel AI SDK** (`ai`), provider chosen in a config file; default = Anthropic (`claude-opus-4-8`) |
| LLM config source | **`ai.config.ts` loaded via `c12`** (provider/model/params); API keys stay in `.env` |
| Duplicate rows (`count > 1`) | **Same resource name allowed** — emit N rows with identical `name` (or empty); no numeric suffix |
| Rate-limit / cost guardrails | **Configurable in `ai.config.ts`** (per-user throttle); endpoint returns `429` when exceeded |
| Streaming | AI SDK `streamObject` capability; **v1 ships non-streaming** (`generateObject`) with a loading state |

---

## 4. Domain mapping

The LLM's output maps onto existing shapes (see [prisma/schema.prisma](../prisma/schema.prisma) and [src/services/api.ts](../src/services/api.ts)):

```
Project (name, planningMode, phases, period count, clientCurrency, exchangeRate, defaultMargin, daysInFTE)
 └─ ResourcePlan[]  (role, clientRole?, name?, intHourlyRate, clientHourlyRate, displayOrder)
     └─ Allocation[] (periodNumber, allocation 0–100)
```

- `role` — chosen by the LLM, constrained to `GlobalRateCard.role` values.
- `intHourlyRate` — resolved deterministically from `GlobalRateCard[role][region]`.
- `clientHourlyRate` — computed via existing [src/utils/calculations.ts](../src/utils/calculations.ts):
  `clientHourlyRate = (intRate / (1 - marginDecimal)) * exchangeRate`.
  **Margin units:** the project stores `defaultMargin` as a **percentage** (0–100, e.g. `45`), but `calculations.clientHourlyRate()` expects a **decimal 0..1** and returns `0` when `margin >= 1`. The percentage **must** be divided by 100 before the call — see §8.3. This mirrors the existing manual path ([src/components/ResourcePlan.tsx](../src/components/ResourcePlan.tsx): `marginDecimal = defaultMargin / 100`).
- `Allocation[]` — expanded server-side from the LLM's **per-phase** allocations using each phase's `periodCount`.

---

## 5. Architecture overview

```
Assistant chat overlay (prompt + region; project taken from context)
        │  POST /api/projects/generate-plan
        ▼
Express endpoint (server.ts)
        │
        ├─ build role enum + rate lookup from GlobalRateCard
        ├─ build prompt + Zod output schema
        ▼
generateStructured() (server/llm) ── Vercel AI SDK generateObject({ model, schema }) ──► [Anthropic | OpenAI | Ollama]
        │  model resolved from ai.config.ts (c12); returns object validated against the Zod schema
        ▼
Planner service (server/planner)
        ├─ (Zod shape already enforced by generateObject — re-check business rules)
        ├─ resolve intHourlyRate by region
        ├─ compute clientHourlyRate (calculations.ts)
        ├─ expand phaseAllocations → Allocation[] per period
        └─ run assembled ResourcePlan[] through server-validation.ts
        ▼
Return DRAFT (not persisted) ──► previewed in ResourcePlan grid behind the panel
                                  ──► chat panel = control surface (mode / Accept / Regenerate)
                                  ──► user accepts ──► transactional apply path (§16) ──► Undo toast
```

Core principle: **the planner service depends only on the `generateStructured()` seam**, never on a vendor SDK directly. The AI SDK validates output against the Zod schema at generation time; business-rule checks (§8) run afterward, independent of which provider ran.

---

## 6. LLM integration — Vercel AI SDK + config file

We don't hand-roll a provider abstraction. The **Vercel AI SDK** (`ai`) is a widely-used, provider-agnostic framework; its `generateObject` returns output already validated against a Zod schema, which is exactly the planner's contract (§8). Swapping vendors is a config-file edit, not new code. **Which concrete LLM to use is set in `ai.config.ts`**, loaded by `c12` (already a project dependency); API keys stay in `.env`.

### 6.1 Dependencies

Only the **core** `ai` package is provider-agnostic. Each provider is a separate adapter package, so exactly one provider package is required (the default); the rest are optional and loaded on demand — we don't ship SDKs we aren't using.

```jsonc
// package.json
"dependencies": {
  "ai": "...",                 // core: generateObject / streamObject (provider-agnostic)
  "@ai-sdk/anthropic": "..."   // default provider — the only hard provider dep
  // zod, c12 — already in the project
},
"optionalDependencies": {
  "@ai-sdk/openai": "...",     // installed only if you switch provider in ai.config.ts
  "ollama-ai-provider": "..."  // installed only for local models
}
```

To use a non-default provider: install its package, then set `provider` in `ai.config.ts`. Nothing else changes. If the configured provider's package isn't installed, `resolveModel()` throws a clear "run `npm i <pkg>`" error (§6.3).

### 6.2 The single seam: `generateStructured()`

The planner depends on **one function**, not on any vendor SDK. It resolves the configured model and delegates to the AI SDK:

```ts
// server/llm/index.ts
import { generateObject } from "ai";
import type { z } from "zod";
import { resolveModel } from "./registry";   // see §6.4

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;     // Zod schema — validated by the SDK at generation time
  schemaName?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export async function generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
  const { model, defaults } = await resolveModel();   // from ai.config.ts via c12 (§6.3)
  const { object } = await generateObject({
    model,
    schema: req.schema,
    schemaName: req.schemaName,
    system: req.system,
    prompt: req.prompt,
    maxOutputTokens: req.maxOutputTokens ?? defaults.maxOutputTokens,
    abortSignal: req.signal,
  });
  return object;            // typed + Zod-validated; business rules still run in §8
}
```

`streamObject` (the streaming twin of `generateObject`) is available for the optional streaming UI in §13 — same `generateStructured` seam, different SDK call.

### 6.3 Resolving the model (lazy, install-only-what-you-use)

The configured provider is loaded with a **dynamic import**, so only that one adapter package needs to be installed and only it is loaded at runtime. A missing optional provider fails with an actionable message rather than a bundler error:

```ts
// server/llm/registry.ts
import type { LanguageModel } from "ai";
import { loadAIConfig } from "./config";   // §6.4

// Map provider key → dynamic import of its factory. Adding a provider = one line here.
const PROVIDERS: Record<string, () => Promise<(id: string) => LanguageModel>> = {
  anthropic: async () => (await import("@ai-sdk/anthropic")).anthropic,
  openai:    async () => (await import("@ai-sdk/openai")).openai,
  ollama:    async () => (await import("ollama-ai-provider")).ollama,
};

const PACKAGE_FOR: Record<string, string> = {
  anthropic: "@ai-sdk/anthropic",
  openai:    "@ai-sdk/openai",
  ollama:    "ollama-ai-provider",
};

export async function resolveModel() {
  const cfg = loadAIConfig();                       // { provider, model, maxOutputTokens, ... }
  const load = PROVIDERS[cfg.provider];
  if (!load) throw new Error(`Unknown LLM provider: ${cfg.provider}`);

  let factory;
  try {
    factory = await load();
  } catch {
    throw new Error(
      `Provider "${cfg.provider}" is not installed. Run: npm i ${PACKAGE_FOR[cfg.provider]}`,
    );
  }
  return {
    model: factory(cfg.model),
    defaults: { maxOutputTokens: cfg.maxOutputTokens },
  };
}
```

(`resolveModel()` becomes async; `generateStructured()` in §6.2 awaits it.) Resolve once at startup and cache the model if you prefer to keep the hot path sync. Provider SDKs read their API keys from the standard env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`) automatically — keys never go in the config file or near the client.

### 6.4 Configuration file (`ai.config.ts` via `c12`)

The concrete LLM choice lives in a typed config file at the project root, loaded with `c12` (consistent with the project already depending on it). `c12` merges `ai.config.{ts,js,json}`, `.config/ai.*`, and `AI_*` env overrides.

```ts
// ai.config.ts
import { defineAIConfig } from "./server/llm/config";

export default defineAIConfig({
  provider: "anthropic",        // anthropic | openai | ollama
  model: "claude-opus-4-8",     // model id for that provider
  maxOutputTokens: 4096,
  // region default for generation (§9)
  defaultDeliveryRegion: "easternEurope",
  // rate-limit / cost guardrails (§10) — per-user throttle on generation
  rateLimit: {
    maxPerUser: 10,             // max generations per user per window
    windowSeconds: 3600,        // sliding window length
  },
});
```

```ts
// server/llm/config.ts
import { loadConfig } from "c12";

export interface AIConfig {
  provider: "anthropic" | "openai" | "ollama";
  model: string;
  maxOutputTokens: number;
  defaultDeliveryRegion: string;
  rateLimit: {
    maxPerUser: number;         // generations allowed per user per window
    windowSeconds: number;      // sliding-window length in seconds
  };
}

const DEFAULTS: AIConfig = {
  provider: "anthropic",
  model: "claude-opus-4-8",
  maxOutputTokens: 4096,
  defaultDeliveryRegion: "easternEurope",
  rateLimit: { maxPerUser: 10, windowSeconds: 3600 },
};

export const defineAIConfig = (c: Partial<AIConfig>): Partial<AIConfig> => c;

let cached: AIConfig | undefined;
export function loadAIConfig(): AIConfig {
  if (!cached) {
    const { config } = loadConfigSync();          // c12 also exposes loadConfig (async)
    cached = { ...DEFAULTS, ...config };
  }
  return cached;
}
```

> Note: `c12`'s primary API is async (`await loadConfig({ name: "ai" })`). Load it once at server startup and cache it (as above) so `resolveModel()` stays synchronous, or make `generateStructured` resolve the config lazily on first use. API keys are **not** in this file — only the non-secret model selection. The React client never calls a provider directly.

---

## 7. LLM output contract

### 7.1 Output schema (conceptual)

Authored as a **Zod schema** in `server/planner/schema.ts` and passed straight to `generateObject` (the AI SDK enforces it during generation and converts to JSON Schema for providers that need it). The conceptual JSON-Schema shape:

```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "selectedDisciplines": {             // STEP 1 — emitted before resources (reasoning-first)
      "type": "array",                   // which disciplines this project needs at all
      "items": { "type": "string", "enum": ["<distinct GlobalRateCard.discipline values>"] }
    },
    "teamShape": {                       // STEP 1 — brief plan justifying the composition
      "type": "string"                   // e.g. "Build-heavy: 1 PM, 1 architect, 4 devs (pyramid), 1 QA, ramps QA in stabilization"
    },
    "phases": {                          // OPTIONAL — only when the prompt implies a timeline
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string" },
          "periodCount": { "type": "integer" }
        },
        "required": ["name", "periodCount"]
      }
    },
    "resources": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "role":  { "type": "string", "enum": ["<built from GlobalRateCard.role>"] },
          "count": { "type": "integer" },           // expands to N ResourcePlan rows
          "phaseAllocations": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "phase":      { "type": "string" }, // must match a phase name
                "allocation": { "type": "integer" } // 0–100
              },
              "required": ["phase", "allocation"]
            }
          },
          "rationale": { "type": "string" }          // short, shown in review UI
        },
        "required": ["role", "count", "phaseAllocations"]
      }
    }
  },
  "required": ["selectedDisciplines", "teamShape", "resources"]
}
```

Notes:
- `role` enum is built **at request time** as a Zod `z.enum([...])` from the live rate card — the model cannot emit an unknown role, and the SDK rejects one if it tries.
- `selectedDisciplines` / `teamShape` are emitted **first** so the model commits to a team *shape* before naming concrete roles (see §7.3). The full role enum is still supplied; the discipline list is the reasoning axis, not a hard prune of the enum.
- Allocations are **per phase**, not per period. This is cheaper and more accurate; expansion to periods is deterministic server-side.
- `phases` is only honored when the project does not already define phases, or when the user explicitly opts to apply LLM-proposed phases.

### 7.2 Prompt inputs

The system/user prompt includes:
- The user's description / free-text prompt.
- Project context: `planningMode` (weekly/monthly), total period count, existing phases, `clientCurrency`, `defaultMargin`.
- The **distinct discipline list** (derived from `GlobalRateCard.discipline` — typically ~8–12 values). This is the reasoning axis for STEP 1.
- The **rate-card menu**, grouped by discipline. Each role row carries: role name (the enum value), a normalized seniority tag, the **rate for the chosen region**, and the 1-line `description`. Grouping + rate let the model reason about composition and cost rather than scanning a flat list of 130 near-duplicates.
- The **team-composition heuristics** and **phase archetypes** from §7.3.
- Instruction that the model must pick roles only from the menu, only within `selectedDisciplines`, and produce realistic allocations across phases.

### 7.3 Resource selection strategy (how the model decides)

The model does **not** pick from a flat 130-role enum in one shot. It mirrors how a delivery lead actually scopes a team — coarse-to-fine, but in a **single reasoning-first call** (per §3, v1 is one non-streaming generation):

**Step 1 — disciplines.** From the small distinct-discipline list, the model decides *which disciplines the project needs at all* (`selectedDisciplines`) and writes a one-line `teamShape` justifying it. Disciplines are few and stable, so this is the cheap, robust cut. Specialized stacks (Salesforce, AEM, Blockchain, …) are selected **only** when the description names them.

**Step 2 — roles within disciplines.** For each selected discipline the model picks concrete roles, then resolves three things per role:
- **Seniority mix** — follow a *pyramid*: more mid/junior than Lead/Architect; never an all-Senior team.
- **Headcount** (`count`) — anchored to budget / team-size / duration if the description gives any; otherwise inferred from phases and scope.
- **Phase allocations** — realistic ramps, not a flat 100% everywhere (see archetypes below).

**Team-composition heuristics** (system prompt, applied in Step 2):
- ~1 PM / Delivery per workstream; ~1 Architect / tech lead per significant workstream.
- QA in proportion to development (≈ 1:3–1:4), not zero when there is build work.
- Don't propose a team of only Architects/Leads.

**Phase archetypes** (guide `phaseAllocations`):
- *Discovery / Inception* — BA, Architect, Design high; development low/0.
- *Build* — development peaks; QA ramps up; BA/Design taper.
- *Stabilization / Launch* — QA + DevOps peak; development tapers; PM steady across all phases.

**Why single-call works here:** the expensive decision (disciplines) is small and emitted first, so the model self-prunes its own role choices to the disciplines it committed to — no second round-trip, no request-time enum rebuild. The full enum remains as the anti-hallucination contract; discipline coherence is enforced server-side (see §8).

### 7.4 Role taxonomy & seniority normalization (deterministic, server-side)

Before any prompt is built, every `GlobalRateCard` row is normalized into a canonical taxonomy. This is a **deterministic lookup, not an LLM step** — it must resolve identically every time. It feeds both the discipline list (Step 1) and the seniority tag shown in the grouped menu.

Per row it produces `{ discipline, track, seniority }`:

- **`discipline`** — the live `GlobalRateCard.discipline` (populated from the rate-card import, column C). Used verbatim for `selectedDisciplines`.
- **`track`** — `ic` | `lead` | `architect`. Derived from role-name keywords (`Team Lead`, `Architect`, `Manager`) with `namingInPM` as a secondary signal.
- **`seniority`** — for the **IC track**, one of the five canonical rungs; `null` for lead/architect (they carry their own sub-levels).

**IC ladder — canonical rungs** (source of truth is `namingInPM`, *not* the role-name prefix):

| `Role` name prefix | `namingInPM` (raw) | Canonical rung |
|---|---|---|
| `Associate … L1` | `Junior` | `junior` |
| `Associate … L2` | `Strong Junior` | `strong_junior` |
| *(no prefix)* | `Middle` | `middle` |
| `Senior …` | `Strong Middle` | `strong_middle` |
| `Principal …` | `Senior` | `senior` |

> **Critical gotcha:** in the role *name*, `Senior X` = **strong middle**, and the top IC rung is `Principal X` = **senior**. A regex over the role name ("contains 'Senior' → senior") is systematically wrong. Normalize from `namingInPM`.

**Normalization rules for `namingInPM`:**
- Trim whitespace; lowercase; collapse internal double spaces.
- Map fork/combined bands to the lower rung for team-shaping: `Junior/Strong Junior`, `Junior - Strong Junior` → `junior`; `Strong Middle/Senior` → `strong_middle`.
- **Empty `namingInPM`** (~26 rows): classify from the role name — `… Team Lead`/`… Manager` (QA) → `track: lead`; `… Architect` → `track: architect`; otherwise fall back to the role-name prefix table above.
- Non-rung labels that are really role identity, not seniority (`Tech Writer`, `Solution consultant`) → `track: ic`, `seniority` from the role-name prefix (default `middle`).
- Lead/architect labels (`Team lead`, `Expert/Lead`, `Senior lead`, `Middle Architect`, `Senior Architect`, `Architect`) → `track` accordingly, `seniority: null`.

The ~30 deviation rows are curated explicitly in `server/planner/rateCard.ts`; the regular ~145 fall out of the table above. A unit test asserts every live rate-card row resolves to a known `{track, seniority}` so new imports can't silently produce an unclassified role.

### 7.5 Selection-policy system prompt (how a role is chosen)

This is a **system prompt** embedded in `server/planner` (not a Claude Code skill). It operates entirely in canonical terms from §7.4. Draft content:

> You are scoping a delivery team. Work in two steps and emit them in order.
>
> **Step 1 — disciplines.** From the supplied discipline list, choose only the disciplines this project actually needs. Pick a specialized discipline (Salesforce, AEM, Blockchain, ML/Data Science, Data & Analytics, Security) **only** when the description explicitly implies it. State a one-line `teamShape` justifying the set.
>
> **Step 2 — roles & seniority within each chosen discipline.** For each discipline, pick concrete roles from the menu and decide seniority and headcount:
> - **Seniority is a pyramid.** Lead with `middle` as the backbone; add `strong_middle`/`senior` for complexity, risk, or client-facing depth; add `junior`/`strong_junior` to scale volume cheaply. Do **not** staff an all-senior team, and do not put a `junior` alone on a discipline with no `middle`+ above them.
> - **Seniority follows project signals:** greenfield/ambiguous scope or regulated domains → weight `senior`/`strong_middle` and add an `architect`; well-defined, high-volume build → more `middle`/`strong_junior`.
> - **One leadership anchor per significant workstream:** ~1 `architect` (or `lead`) where there is real technical risk or >~4 ICs in a discipline; do not add architects to tiny teams.
> - **Cross-cutting roles:** ~1 PM/Delivery for the engagement; QA roughly 1 per 3–4 development ICs; a BA/Discovery role when requirements are unclear.
> - **Headcount** scales with scope and phase length; prefer fewer, appropriately-senior people over many juniors when the timeline is short.
>
> Then assign per-phase allocations following the phase archetypes (Discovery / Build / Stabilization). Every role you emit must belong to one of your Step-1 disciplines.

The menu given alongside this prompt lists each role as `role name — [seniority tag] — rate(region) — description`, grouped by discipline, so the model chooses against real cost and meaning rather than a flat list.

---

## 8. Validation & assembly (provider-independent)

Run on every generation, regardless of provider:

1. **Output-shape validation** — the AI SDK's `generateObject` already validates the response against the Zod schema (roles ∈ rate card via `z.enum`, `allocation` 0–100, `count` ≥ 1, phase names, `selectedDisciplines` ∈ distinct disciplines) and throws on mismatch. Catch `generateObject`'s validation error and surface a `422` (§10). Because the SDK is the gate, this check is **provider-independent** — a malformed response from any vendor fails identically here.
2. **Resolve rates** — `intHourlyRate = GlobalRateCard[role][region]`; reject if missing.
   - **Discipline coherence (soft):** if `discipline(role) ∉ selectedDisciplines`, keep the row but emit a warning — the model contradicted its own Step-1 plan.
   - **Zero-rate guard:** if the resolved region rate is `0` (role not priced in that region), emit a warning so the row surfaces in review rather than costing nothing silently.
3. **Compute** `clientHourlyRate` via [src/utils/calculations.ts](../src/utils/calculations.ts) using the project's margin and exchange rate. **Convert margin from percentage to decimal first**, and fall back to the default when the project margin is null:

   ```ts
   const marginPct = project.defaultMargin ?? APP_DEFAULTS.defaultMargin; // 0..100 (nullable in schema)
   const marginDecimal = marginPct / 100;                                 // 0..1 — required by calculations.ts
   const clientRate = clientHourlyRate(intRate, marginDecimal, project.exchangeRate);
   ```

   Passing the raw percentage (e.g. `45`) directly would trip the `margin >= 1` guard in `calculations.ts` and silently yield `clientHourlyRate = 0` for every row — which the validation gate in §8.5 would **not** catch, since `clientHourlyRate` is an optional, unbounded number in `resourcePlanCreateSchema`.
4. **Expand** `phaseAllocations` → `Allocation[]`: for each phase, fill `periodNumber`s covered by that phase with its allocation %. Roles with `count > 1` produce **N identical `ResourcePlan` rows** — the grid allows multiple rows with the same resource `name`, so duplicates share one name (or leave `name` empty); **no numeric suffix or seniority split**. Each row gets its own `displayOrder` and its own `Allocation[]` (so the reviewer can edit them independently).
5. **Existing gate** — pass the assembled `ResourcePlan[]` through [server-validation.ts](../server-validation.ts) (`resourcePlanCreateSchema` / `allocationSchema`) — the same validation manual edits go through.
6. **Composition sanity (soft warnings, non-blocking)** — surface in the `warnings` array of the response (§10) for the reviewer, never auto-reject:
   - No PM / Delivery role while the team has any build/QA roles.
   - No QA while development roles are present.
   - All-senior / all-Architect team (pyramid violated).
   - Total FTE well above/below the stated budget or team-size anchor, when one was given.

These are advisory: correctness (rates, schema, ranges) hard-fails; *plausibility* of the team only warns, keeping the human-in-the-loop in control.

This makes correctness independent of the model: a bad response from any provider is caught identically.

---

## 9. Region handling

- The generate dialog includes a **Delivery region** dropdown.
- Options correspond to `GlobalRateCard` regional columns:
  `ukraine, easternEurope, asiaGE, asiaARMKZ, latam, mexico, india, newYork, london`.
- The chosen region determines which column `resolveIntRate(role, region)` reads for the whole generation.
- Default region: `defaultDeliveryRegion` in `ai.config.ts` (§6.4), falling back to a sensible value.
- Future: allow per-role regions (LLM-proposed, constrained enum) without changing the rest of the pipeline.

---

## 10. API endpoint

### `POST /api/projects/generate-plan`

Request:
```jsonc
{
  "mode": "current" | "new",
  "projectId": 123,            // required when mode = "current"
  "description": "….",         // user prompt / project description
  "region": "easternEurope",
  "applyProposedPhases": false // whether to accept LLM phase proposal
}
```

Response (draft, not persisted):
```jsonc
{
  "draft": {
    "phases": [ /* optional, when proposed/applied */ ],
    "resourcePlans": [
      {
        "role": "Senior UX Designer",
        "clientRole": null,
        "intHourlyRate": 45,
        "clientHourlyRate": 72.7,
        "displayOrder": 0,
        "rationale": "…",
        "allocations": [ { "periodNumber": 1, "allocation": 80 }, … ]
      }
    ]
  },
  "warnings": [ /* e.g. roles requested that were repaired */ ]
}
```

- For `mode: "new"`, project-level settings (currency, margin, daysInFTE, name) come from [src/config/defaults.ts](../src/config/defaults.ts); the user renames after.
- The endpoint **does not write to the DB**. Persisting happens through the existing create/update path once the user accepts.

### Rate limiting / guardrails
- Before calling the LLM, the endpoint checks a **per-user sliding-window counter** against `rateLimit` in `ai.config.ts` (§6.4). Over the limit → **`429`** with a `retry-after` hint; no provider call is made (protects cost).
- Keyed by authenticated user (e.g. `userEmail`); counter store is in-memory for v1, swappable for Redis later. Limits are config-driven, so tightening them needs no code change.

### Error handling
- Standard HTTP error codes; provider/auth/upstream rate-limit errors surfaced as `502/503` with a friendly message.
- Per-user throttle exceeded → `429` (see above).
- Validation failures (LLM output fails the Zod schema, §8) return `422` with details.
- Respect an `AbortSignal` for client-cancelled generations.

---

## 11. UI / UX

### 11.0 AI assistant overlay (not a tab)

The feature is **not** a separate tab. It's an **assistant chat panel that overlays the current page** — the user stays on Resource Plan (or any tab) and talks to the assistant about the project they're already looking at. This is a better fit than a dedicated mode because the work the AI does — proposing a team for *this* project — is the same work the user reviews in *this* project's grid; making them switch tabs would break that continuity.

**Form factor — right-docked, collapsible drawer.**
- A floating **launcher** (FAB, bottom-right, e.g. "✦ AI") is present app-wide via a single mount at the `App` root, so it survives tab switches and isn't tied to any one `TabsContent`.
- Clicking it slides in a **right-docked panel** (resizable width, ~380–460px) that overlays the page **without navigating away**. The grid stays visible to its left, so a generated draft can be previewed in the real grid while the panel holds the controls. Collapsing returns to the launcher; conversation state is preserved within the session.
- Chosen over a modal dialog (blocks the grid the user needs to see) and a free-floating window (drag/z-index complexity for no benefit).

**Context-aware by default.** The panel reads the **currently open project** (`currentProject`) and its rate-card context, so the user doesn't fill out a form — they just describe what they want. The panel header shows what the assistant is grounded on (project name, planning mode, period count, currency, margin), so it's clear *which* project an instruction will affect.

- **Mode is inferred, not asked.** Talking while a project is open ⇒ `mode: "current"`. "Create a new project for…" ⇒ `mode: "new"` (assistant confirms, then the new project opens and the draft targets it).
- **No open project** ⇒ the panel shows an empty state ("Open or create a project, then I can draft a plan for it") with a quick create action.
- Region defaults from `ai.config.ts` (§9) and is adjustable via a small control in the composer; it does not need to be set every time.

### 11.1 Flow within the assistant

1. **Launch** — user clicks the FAB; the panel opens with the context header and an empty composer (multiline input + region selector + send).
2. **Describe** — user types a free-text request ("3-month e-commerce redesign, ~6 people, build-heavy"). No mode/dialog fields; the assistant uses project context.
3. **Generate** — send calls `POST /api/projects/generate-plan` (§10). The composer shows a **non-streaming loading state with Cancel** (v1; `abortSignal`). `streamObject` can later stream `teamShape`/rows into the panel.
4. **Review — draft projected into the real grid.** The returned draft populates the `ResourcePlan` grid ([src/components/ResourcePlan.tsx](../src/components/ResourcePlan.tsx)) behind the panel in a **non-destructive preview state** — proposed rows are visually marked (e.g. a "proposed" tint/badge) and the project's existing persisted rows are **not** mutated until Accept. The grid rows are editable in place; per-row `rationale` shows on the row (tooltip/expander). The chat panel summarizes the result and is the **control surface**:
   - `teamShape` one-liner + `selectedDisciplines` as chips.
   - `warnings` (§8.6) as a soft, dismissible callout — never blocks Accept.
   - **Apply-mode selector (`append` / `replace`)** (§16.2) — lives in the panel, since it's chosen while looking at the previewed result.
   - Actions: **Accept**, **Regenerate**, **Discard**.
5. **Iterate (multi-turn).** Follow-up messages ("make it more senior", "drop the BA", "shorten to 2 months") **re-generate** the draft with the conversation as added prompt context (§7.2) and re-project it into the grid. Each turn replaces the current preview; nothing is persisted. (Surgical edit of an *already-applied* plan stays a non-goal, §2 — iteration operates on the unsaved draft.)
6. **Accept** — routes through the transactional apply path (§16.3) with the selected mode, clears the preview state, and shows the **"Plan applied — Undo"** toast (§16.6). For `mode: "new"`, Accept creates and opens the project instead (§16.3 note).

### 11.2 Panel states (mockups)

```
Collapsed (app-wide launcher)        No project open
                              ┌─ AI assistant ───────────── ✕ ┐
                              │ No project open.              │
                       ╭────╮ │ Open or create one and I'll   │
                       │ ✦  │ │ draft a resource plan for it. │
                       ╰────╯ │           [ + New project ]   │
                              └───────────────────────────────┘

Composer (project in context)          Loading
┌─ AI assistant ───────────── ✕ ┐    ┌─ AI assistant ───────── ✕ ┐
│ ▸ Acme redesign · weekly ·    │    │ "3-month e-commerce…"      │
│   12w · EUR · 45% margin      │    │ ⟳ Drafting team…  [Cancel] │
│                               │    └────────────────────────────┘
│ ┌───────────────────────────┐ │
│ │ Describe the project…     │ │   Review (grid behind shows preview)
│ │                           │ │   ┌─ AI assistant ───────── ✕ ┐
│ └───────────────────────────┘ │   │ ▸ Team shape: build-heavy, │
│ Region [Eastern EU ▾]   [Send]│   │   1 PM · 4 dev · 1 QA       │
└───────────────────────────────┘   │ [Eng][QA][Design][PM]      │
                                     │ ⚠ No QA vs build — review  │
   ← grid shows proposed rows →      │ Apply: (•)append ( )replace│
   tinted/badged, editable in place  │ [Accept][Regenerate][Discard]│
                                     │ ── you ───────────────────  │
                                     │ make it more senior         │
                                     └────────────────────────────┘
```

---

## 12. File / module plan

```
ai.config.ts                 # LLM selection: provider/model/params (loaded by c12) — NOT secrets
server/
  llm/
    index.ts                 # generateStructured() — the single seam over the AI SDK
    registry.ts              # createProviderRegistry + resolveModel() from config
    config.ts                # c12 loader, AIConfig type, defineAIConfig()
  planner/
    generateResourcePlan.ts  # orchestration: prompt → generateStructured → validate → assemble
    rateCard.ts              # role taxonomy (§7.4: discipline/track/seniority), role enum builder, grouped menu, resolveIntRate(role, region)
    prompt.ts                # selection-policy system prompt (§7.5) + menu rendering
    phases.ts                # phaseAllocations → Allocation[] expansion
    schema.ts                # Zod output schema (role enum built at request time)
server.ts                    # new route: POST /api/projects/generate-plan
src/
  App.tsx                    # mounts <AIAssistant> once at root (overlay, app-wide) — NO new tab
  services/api.ts            # client wrapper for generate-plan
  components/
    AIAssistant.tsx          # the overlay: launcher FAB + right-docked panel; owns chat/draft state
    AssistantComposer.tsx    # prompt input + region selector + send/cancel (lives inside the panel)
    AssistantReview.tsx      # in-panel control surface: teamShape/chips/warnings + append-replace + Accept/Regenerate/Discard
    ResourcePlan.tsx         # non-destructive draft-preview state (proposed rows tinted/badged, editable, +rationale)
docs/
  ai-resource-plan-generation-spec.md   # this file
```

(Existing [server-validation.ts](../server-validation.ts), [src/utils/calculations.ts](../src/utils/calculations.ts), and [src/config/defaults.ts](../src/config/defaults.ts) are reused, not duplicated.)

---

## 13. Build order

1. **`server/llm/`** — `ai.config.ts` + `config.ts` (c12) + `registry.ts` + `generateStructured()`. Install `ai` + `@ai-sdk/anthropic`. Testable with a trivial Zod schema and a mock model (`ai` ships `MockLanguageModel` for tests — no network).
2. **`server/planner/`** — rate/region helper, phase expansion, output Zod schema, orchestration. Depends only on `generateStructured()`.
3. **`POST /api/projects/generate-plan`** — both modes, wired end-to-end. Testable via curl.
4. **UI** — `AIAssistant` overlay (launcher + docked panel) mounted at the `App` root + draft-preview state in the `ResourcePlan` grid.
5. **(Later)** add `@ai-sdk/openai` / `ollama-ai-provider`, streaming via `streamObject`, per-role regions, prompt-based editing of existing plans.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Model invents roles/rates | `role` is a Zod `z.enum`; rates resolved server-side from card; SDK + business checks re-validate |
| Provider structured-output gaps (ignores enum/range) | AI SDK `generateObject` validates against the Zod schema regardless of provider; business checks (§8) are the second gate |
| Long generation latency | Non-streaming spinner + cancel in v1 (`abortSignal`); `streamObject` optional later |
| Allocation explosion / token cost | Per-phase allocations expanded server-side, not per-period from the model |
| Vendor lock-in | Vercel AI SDK seam; swap provider/model in `ai.config.ts` |
| API key exposure | Keys in `.env` (read by provider SDKs), never in `ai.config.ts`; client never calls providers |

---

## 15. Open questions

- Default delivery region value — configurable; pick a sensible default.
- Whether to log prompts/responses for debugging (privacy considerations).

---

## 16. Applying changes & Undo

Generated drafts are reviewed in the grid (§11) and never auto-saved. **Acceptance** is where a draft becomes persisted state — and the point that needs both *atomicity* and *reversibility*, because an LLM-shaped plan that passed review can still turn out wrong once the user sees it inside the real project.

### 16.1 Problem with the naive accept path

The existing client API ([src/services/api.ts](../src/services/api.ts)) is **per-row CRUD** (`createResourcePlan`, `createAllocation`, …). Accepting a draft "as is" would mean a loop of N + M independent HTTP calls. A failure partway (network, validation) leaves a **half-applied plan** in the project, which no Undo can cleanly reverse — there's no record of what actually landed. So atomicity comes first, Undo second.

### 16.2 Apply modes

The AI can apply a generation in two ways into an **existing** project (`mode: "current"`); the user chooses via the apply-mode selector in the assistant panel (§11.1):

- **`append`** — add the generated rows to the project's current `ResourcePlan[]`, preserving everything already there. Lower risk; may produce duplicate roles, which is acceptable (§3 allows duplicate names).
- **`replace`** — discard the project's current `ResourcePlan[]` (and, if `applyProposedPhases`, its phases) and substitute the generated set. Cleaner result, but **destructive** — this is the mode that makes Undo essential.

`mode: "new"` always creates a fresh project; "apply" there is just the initial populate.

### 16.3 Transactional apply endpoint

A single endpoint replaces the per-row accept loop. Everything runs in one `prisma.$transaction`: snapshot → mutate → return revision id. All-or-nothing.

```
POST /api/projects/:id/apply-plan
```
```jsonc
{
  "applyMode": "append" | "replace",
  "resourcePlans": [ /* the accepted draft rows, incl. allocations — shape from §10 */ ],
  "phases": [ /* optional; honored only with replace + applyProposedPhases */ ]
}
```

Transaction body:
1. Read the project's current `ResourcePlan[]` (with `allocations`) and `phases`; serialize to a snapshot (§16.4).
2. Write a `PlanRevision` row with that snapshot (`source: "ai"`, `label` from the apply mode).
3. Apply the change:
   - `append` — create the new rows after the existing `displayOrder` range.
   - `replace` — delete existing `ResourcePlan[]` (cascade removes their `Allocation[]`), then create the new rows; overwrite `phases` if provided.
4. Re-run the existing gate ([server-validation.ts](../server-validation.ts)) on the assembled rows before commit.

Response: the persisted plan + `{ "revisionId": <id> }`.

> `mode: "new"`: no `PlanRevision` needed — Undo is simply `deleteProject`. Handle as a special case in the UI, don't route it through `apply-plan`.

### 16.4 Revision storage (snapshot-based)

Undo is a **snapshot restore**, not an inverse-operation log: it handles append / replace / future modify uniformly and doesn't depend on what the model did.

```prisma
model PlanRevision {
  id         Int      @id @default(autoincrement())
  projectId  Int
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  label      String   // "AI append" | "AI replace" | (future) "manual bulk edit"
  source     String   // "ai" | "manual"
  snapshot   Json     // { resourcePlans: [{ ...fields, allocations: [...] }], phases }
  createdAt  DateTime @default(now())

  @@index([projectId, createdAt])
}
```

- **Granularity:** the whole project's resource plan (all rows + allocations + phases). Matches the user's mental model ("undo this generation") and the data is small.
- **Retention:** keep the last ~10 revisions per project; prune older ones on write. (Open question: hard cap vs. time-based.)
- **Not AI-specific:** any future bulk mutation (manual bulk edit, reorder, prompt-based optimization) can write a `PlanRevision`, so Undo is a general mechanism the AI flow just plugs into.

### 16.5 Restore (Undo / Redo)

```
POST /api/projects/:id/revisions/:revId/restore
```

In one transaction: snapshot the **current** state into a new `PlanRevision` first (so the restore itself is reversible → Redo), then replace the project's `ResourcePlan[]`/`phases` from the target snapshot. Returns the restored plan.

### 16.6 UI

- After a successful `apply-plan`, show a toast: **"Plan applied — Undo"**, wired to `restore` of the snapshot captured in that apply (one-click, one level).
- A **History** affordance on the project lists recent `PlanRevision`s (label + timestamp) for restoring beyond the last action.
- v1 ships single-level toast Undo + the History list. A full undo/redo stack is out of scope for v1.

### 16.7 File / module additions

```
prisma/schema.prisma           # + PlanRevision model
server.ts                      # + POST /api/projects/:id/apply-plan
                               # + POST /api/projects/:id/revisions/:revId/restore
server/planner/applyPlan.ts    # transactional apply (snapshot → mutate), append/replace
server/planner/revisions.ts    # snapshot serialize/restore + retention pruning
src/services/api.ts            # + applyPlan(), restoreRevision(), listRevisions()
src/components/
  AIAssistant.tsx              # apply-mode selector (append/replace) + Accept trigger the apply call
                               # + "Plan applied — Undo" toast
  ResourcePlan.tsx             # History list affordance (recent PlanRevisions) for restore beyond last action
```

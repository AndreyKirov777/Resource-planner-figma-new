---
title: 'AI LLM Seam & Config (Goal 1a)'
type: 'feature'
created: '2026-06-30'
status: 'done'
baseline_commit: '3e5c7d87052899bbd1222aee7979216f8df0c124'
context:
  - '{project-root}/docs/ai-resource-plan-generation-spec.md'
  - '{project-root}/docs/bmad-archive/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has no LLM integration. The resource-plan generator (Goal 1b) and any later AI feature need a provider-agnostic way to get **schema-validated structured output** from an LLM, with the vendor swappable by config and API keys kept out of code.

**Approach:** Add a thin, reusable seam — `generateStructured()` over the Vercel AI SDK's `generateObject` — plus a `c12`-loaded `ai.config.ts` that selects provider/model, and a registry that lazily resolves the configured provider. Generic only: any Zod schema in, a validated typed object out. No resource-planner logic.

## Boundaries & Constraints

**Always:**
- The seam is generic: `generateStructured<T>({ system, prompt, schema, ... })` works for ANY Zod schema and knows nothing about resource plans.
- Provider/model are chosen in `ai.config.ts` (loaded by `c12`, with `AI_*` env overrides); default = Anthropic `claude-opus-4-8`. API keys live **only** in `.env` (read by the provider SDK), never in the config file.
- Callers depend only on this seam, never on a vendor SDK directly.
- Provider adapters are loaded by **dynamic import**, so only the configured one must be installed; a missing one fails with an actionable `npm i <pkg>` message.
- `generateStructured` accepts an optional injected `model` so callers/tests can pass `MockLanguageModelV2` (`ai/test`) — no network, no API key.
- Catch the AI SDK's `NoObjectGeneratedError` and rethrow a typed validation error a caller can later map to `422`.

**Ask First:**
- Adding runtime deps beyond `ai` + `@ai-sdk/anthropic` (e.g. installing the openai/ollama adapters).

**Never:**
- No resource-planner code — rate card, prompt, planner, endpoint are Goal 1b.
- No HTTP route, no DB access, no UI.
- No streaming (`streamObject`) in v1.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy | `generateStructured({ schema, system, prompt, model: mock })`, mock returns schema-valid JSON | resolves to the typed, Zod-validated object | N/A |
| Off-schema output | mock model returns text that violates the schema | throws a typed validation error wrapping `NoObjectGeneratedError` | caller maps to 422 |
| No injected model | called without `model` | resolves the model from `ai.config.ts` via `resolveModel()` | N/A |
| Unknown provider | `ai.config.ts` `provider` not in the registry | `resolveModel()` throws `Unknown LLM provider: <x>` | thrown |
| Provider not installed | configured adapter package absent | throws `Provider "<x>" is not installed. Run: npm i <pkg>` | actionable |
| Config load | no overrides | `loadAIConfig()` returns merged DEFAULTS; second call served from cache | N/A |

</frozen-after-approval>

## Code Map

- `package.json` — add `ai` + `@ai-sdk/anthropic`; move `c12` to `dependencies`
- `ai.config.ts` (root) — non-secret provider/model selection via `defineAIConfig`
- `server/llm/config.ts` — `AIConfig` type, `defineAIConfig`, cached `loadAIConfig` (c12)
- `server/llm/registry.ts` — `PROVIDERS` map + `resolveModel()`
- `server/llm/index.ts` — `StructuredRequest<T>` + `generateStructured()`
- `server/llm/index.test.ts`, `server/llm/config.test.ts` — mock-model smoke + error/config paths

## Tasks & Acceptance

**Execution:** (ordered by dependency)
- [x] `package.json` -- add `ai` and `@ai-sdk/anthropic`; move `c12` from devDependencies to dependencies -- the server (tsx/Docker) loads them at runtime.
- [x] `server/llm/config.ts` -- define `AIConfig` (`provider: 'anthropic'|'openai'|'ollama'`, `model`, `maxOutputTokens`, `defaultDeliveryRegion`, `rateLimit: { maxPerUser, windowSeconds }`); `defineAIConfig(partial)` identity helper; async `loadAIConfig()` that merges `DEFAULTS` with `c12` (`loadConfig({ name: 'ai' })`, `AI_*` env overrides) and caches the result. DEFAULTS per design §6.4 (anthropic / `claude-opus-4-8` / 4096 / `easternEurope` / `{10, 3600}`).
- [x] `ai.config.ts` -- `export default defineAIConfig({ provider:'anthropic', model:'claude-opus-4-8', maxOutputTokens:4096, defaultDeliveryRegion:'easternEurope', rateLimit:{ maxPerUser:10, windowSeconds:3600 } })`.
- [x] `server/llm/registry.ts` -- `PROVIDERS` (anthropic/openai/ollama → dynamic `import()` of the factory) + `PACKAGE_FOR`; async `resolveModel()` → `{ model, defaults: { maxOutputTokens } }`; throw `Unknown LLM provider` for an unmapped key; on a failed adapter import throw the actionable `npm i <pkg>` error.
- [x] `server/llm/index.ts` -- `StructuredRequest<T>` (`system, prompt, schema, schemaName?, maxOutputTokens?, signal?, model?`) + `generateStructured<T>(req)`: use `req.model` or `resolveModel()`, call `generateObject({ model, schema, schemaName, system, prompt, maxOutputTokens, abortSignal })`, return `object`; catch `NoObjectGeneratedError` and rethrow a typed `StructuredValidationError` carrying `.cause`/`.text`.
- [x] `server/llm/index.test.ts` + `server/llm/config.test.ts` -- mock-model smoke test + the edge cases (see AC). Use `MockLanguageModelV2` from `ai/test`.

**Acceptance Criteria:**
- Given a `MockLanguageModelV2` returning schema-valid JSON, when `generateStructured({ schema, model })` is called, then it resolves to the object typed and validated by the Zod schema.
- Given a mock model returning output that violates the schema, when `generateStructured` runs, then it throws a typed validation error (not a raw provider error).
- Given `ai.config.ts` with an unknown `provider`, when `resolveModel()` runs, then it throws an "Unknown LLM provider" error; given a known but uninstalled provider, then it throws an actionable `npm i <pkg>` error.
- Given no config overrides, when `loadAIConfig()` is called twice, then both return the merged DEFAULTS and the second call is served from cache.
- Given `generateStructured` is called without an injected `model`, when it runs, then it resolves the model from `ai.config.ts` via `resolveModel()`.

## Spec Change Log

## Design Notes

- **AI SDK API:** `generateObject({ model, schema, schemaName?, system?, prompt, maxOutputTokens?, abortSignal? }) → { object }`, imported from `'ai'`; `NoObjectGeneratedError` from `'ai'`. Anthropic model = `anthropic('claude-opus-4-8')` from `@ai-sdk/anthropic`.
- **IMPLEMENTATION ACTUAL — SDK version:** `npm install` resolved `ai@7.0.8` + `@ai-sdk/anthropic@4.0.3` (latest), NOT the v5 assumed at spec time. The seam's option names are identical in v7 (`maxOutputTokens`, `abortSignal`, `schemaName`; `LanguageModel` is exported and is a union incl. V4/V3/V2). The **only** delta: the test mock is **`MockLanguageModelV4`** (v7's class), not `MockLanguageModelV2` (v5, referenced in the frozen block). The frozen intent — "inject a mock through the seam, no network/key" — is unchanged. The frozen text was left as-is (read-only); this note records the reality.
- **Mock model** (test seam, v7): `new MockLanguageModelV4({ doGenerate: async () => ({ finishReason:'stop', usage:{ inputTokens, outputTokens, totalTokens }, content:[{ type:'text', text: JSON.stringify(obj) }], warnings:[] }) as never })` from `'ai/test'`. The `as never` cast is needed because v7's constructor type demands the full provider-result shape; the simple shape above is what the SDK reads at runtime (probe-verified).
- **Incidental, additive:** `tsconfig.json` `include` extended with `server` + `ai.config.ts` so `tsc` covers the new code. `zod` auto-resolved to `3.25.76` (within the existing `^3.23.8` range — no package.json change) to satisfy the AI SDK peer. No extra deps beyond `ai` + `@ai-sdk/anthropic`.
- **Config caching:** `c12`'s primary API is async (`loadConfig`), so `loadAIConfig()` is async + memoized; `resolveModel()`/`generateStructured()` are already async, so this composes cleanly. Resolve once and reuse.
- **Full AIConfig now:** `defaultDeliveryRegion` + `rateLimit` are included in the type/DEFAULTS even though the seam only reads `provider`/`model`/`maxOutputTokens` — so Goal 1b's endpoint consumes a stable config contract without a rewrite.
- Full design rationale: `docs/ai-resource-plan-generation-spec.md` §6.

## Verification

**Commands:**
- `npm install` -- expected: succeeds with the new deps resolved.
- `npx tsc --noEmit` -- expected: **no errors in `server/llm` or `ai.config.ts`** (the project has pre-existing `src/` type errors unrelated to this change; the build itself does not type-check).
- `npm test` -- expected: the 9 `server/llm` tests pass with the mock model (no network, no API key). (Pre-existing failures in `src/App.test.tsx` and `src/utils/clientRoleMapping.test.ts` are unrelated.)

## Suggested Review Order

**The seam (start here)**

- The single provider-agnostic entry point — any Zod schema in, validated typed object out.
  [`index.ts:34`](../../../server/llm/index.ts#L34)
- The actual AI SDK call; `schema` is what makes the output validated + typed.
  [`index.ts:50`](../../../server/llm/index.ts#L50)
- Maps the SDK's `NoObjectGeneratedError` to a typed error callers map to HTTP 422.
  [`index.ts:61`](../../../server/llm/index.ts#L61)
- Injected-model branch is intentional (tests/wrappers own params); prod omits `model`.
  [`index.ts:37`](../../../server/llm/index.ts#L37)

**Provider resolution (vendor pluggability)**

- Resolves the configured model; throws clear/actionable errors. Highest-risk control flow.
  [`registry.ts:52`](../../../server/llm/registry.ts#L52)
- One line per provider; dynamic import so only the configured adapter must be installed.
  [`registry.ts:16`](../../../server/llm/registry.ts#L16)
- Discriminates "not installed" from "installed but broken" (review-hardened).
  [`registry.ts:39`](../../../server/llm/registry.ts#L39)

**Configuration (c12, no secrets)**

- Loads `ai.config.*` via c12, merges over DEFAULTS, memoizes; warns on load failure.
  [`config.ts:34`](../../../server/llm/config.ts#L34)
- The config contract — includes fields Goal 1b's endpoint will consume.
  [`config.ts:5`](../../../server/llm/config.ts#L5)
- The vendor-selection file; non-secret, edit to swap provider/model.
  [`ai.config.ts:6`](../../../ai.config.ts#L6)

**Supporting (tests, deps, build)**

- Seam tests incl. the production-path fallback (mocked registry) + schema-violation.
  [`index.test.ts:34`](../../../server/llm/index.test.ts#L34)
- Provider-resolution tests (default / unknown / uninstalled).
  [`registry.test.ts:1`](../../../server/llm/registry.test.ts#L1)
- Config tests (defaults+memoize, env overrides).
  [`config.test.ts:1`](../../../server/llm/config.test.ts#L1)
- Runtime deps added (`ai`, `@ai-sdk/anthropic`); `c12` moved to dependencies.
  [`package.json:5`](../../../package.json#L5)
- `include` extended so `tsc` covers the new server code.
  [`tsconfig.json:21`](../../../tsconfig.json#L21)

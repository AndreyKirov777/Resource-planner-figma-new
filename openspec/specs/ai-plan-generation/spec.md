# AI Plan Generation Specification

## Purpose

A user describes a project in natural language and gets back an editable draft resource plan, grounded in the real rate card and never saved without explicit acceptance. Goal 3 (transactional apply + undo of an accepted draft) is not built; see `docs/bmad-archive/implementation-artifacts/deferred-work.md`.

## Requirements

### Requirement: AI draft plan generation
The system SHALL let a user describe a project in natural language, pick a delivery region, and receive an editable draft resource plan to review before anything is saved. (was spec-resource-planner CAP-10)

#### Scenario: The draft is not persisted and previews in the real grid
- **GIVEN** a generation request
- **WHEN** the endpoint returns
- **THEN** the draft is not persisted and previews in the real plan grid

#### Scenario: Proposed roles are grounded in the rate card
- **GIVEN** a generated draft
- **WHEN** its roles are inspected
- **THEN** every proposed role is constrained to `GlobalRateCard` values, internal rates are resolved deterministically server-side, and client rates are computed via `calculations.ts`

#### Scenario: The plan is saved only on explicit acceptance
- **GIVEN** a generated draft
- **WHEN** the user has not explicitly accepted it
- **THEN** nothing is written; acceptance is the only path to persistence

#### Scenario: LLM provider is swappable without code changes
- **GIVEN** `ai.config.ts`
- **WHEN** the provider is changed
- **THEN** no application code changes are required

### Requirement: Structured LLM generation seam
The system SHALL provide a typed, provider-agnostic seam for structured LLM generation, configured via `ai.config.ts` and swappable without code changes. (was spec-ai-llm-seam)

#### Scenario: Schema-valid output resolves to a typed object
- **GIVEN** a mock model returning schema-valid JSON
- **WHEN** `generateStructured({ schema, model })` is called
- **THEN** it resolves to the object typed and validated by the Zod schema

#### Scenario: Schema-invalid output throws a typed error
- **GIVEN** a mock model returning output that violates the schema
- **WHEN** `generateStructured` runs
- **THEN** it throws a typed validation error, not a raw provider error

#### Scenario: Unknown or uninstalled providers fail actionably
- **GIVEN** `ai.config.ts` names an unknown provider
- **WHEN** `resolveModel()` runs
- **THEN** it throws an "Unknown LLM provider" error; for a known but uninstalled provider it throws an actionable `npm i <pkg>` error

#### Scenario: Config is cached across calls
- **GIVEN** no config overrides
- **WHEN** `loadAIConfig()` is called twice
- **THEN** both return the merged defaults and the second call is served from cache

### Requirement: Generate-plan endpoint
The system SHALL expose `POST /api/projects/generate-plan`, grounding every proposed role and rate in the live rate card and rejecting requests the rate card or config cannot support. (was spec-1b-planner-generate-plan-endpoint)

#### Scenario: Happy path returns a draft with warnings
- **GIVEN** a non-empty rate card, a valid request body, and a mock model
- **WHEN** `POST /api/projects/generate-plan` is called
- **THEN** it returns 200 with `{ draft: { resourcePlans: [...] }, warnings: [...] }`

#### Scenario: Empty rate card is rejected before any LLM call
- **GIVEN** zero `GlobalRateCard` rows
- **WHEN** the endpoint is called
- **THEN** it returns 409 before any LLM call

#### Scenario: Rate limiting returns 429
- **GIVEN** a caller exceeds `rateLimit.maxPerUser` within `windowSeconds`
- **WHEN** the endpoint is called
- **THEN** it returns 429 with `retryAfter`

#### Scenario: Request validation rejects bad input
- **GIVEN** `mode: "current"` with no `projectId`, or an unknown `region`
- **WHEN** the request body is validated
- **THEN** it returns 400, naming the offending field

#### Scenario: Invalid model output surfaces as 422
- **GIVEN** a mock model returning an unknown role value
- **WHEN** `generateResourcePlan` runs
- **THEN** a `StructuredValidationError` is thrown and the endpoint returns 422

#### Scenario: Margin is applied as a decimal, with a documented fallback
- **GIVEN** `project.defaultMargin = 45`
- **WHEN** `clientHourlyRate` is computed
- **THEN** the margin decimal `0.45` is used, not `45`; and when `defaultMargin` is `null`, `APP_DEFAULTS.defaultMargin / 100` is used as fallback

### Requirement: Generate-plan UI
The system SHALL let a user drive plan generation from a side sheet in the Resource Plan tab: describe the project, pick a region, watch it generate, and review the result before accepting. (was spec-2-generate-plan-ui)

#### Scenario: Sheet opens with sane defaults
- **GIVEN** the Resource Plan tab is open
- **WHEN** the user clicks "Generate AI Plan"
- **THEN** the sheet opens with empty description, region defaulted to Ukraine, and `applyProposedPhases` unchecked

#### Scenario: Generate is disabled without a description
- **GIVEN** the sheet is open
- **WHEN** the description is empty or whitespace-only
- **THEN** "Generate" is disabled

#### Scenario: Loading is cancellable and preserves input
- **GIVEN** the API call is in flight
- **WHEN** the user clicks Cancel or presses Escape
- **THEN** the request is aborted and the form view returns with inputs intact and no error banner

#### Scenario: Result view shows rates and warnings
- **GIVEN** the API responds successfully
- **WHEN** the result view renders
- **THEN** each resource-plan row shows its resolved role, internal rate and client rate to 2 decimals, and warnings appear in a yellow block only when present

#### Scenario: Errors are shown without losing input
- **GIVEN** the API returns a non-2xx response
- **WHEN** the error is shown
- **THEN** the error message appears in a red banner and inputs are preserved for retry

#### Scenario: Accepting a plan is not yet wired to persistence
- **GIVEN** the result view
- **WHEN** "Accept plan" is clicked
- **THEN** the draft is logged and the sheet stays open — this is Goal 3, deferred, not implemented

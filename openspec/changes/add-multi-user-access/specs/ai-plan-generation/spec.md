## MODIFIED Requirements

### Requirement: Generate-plan endpoint
The system SHALL expose `POST /api/projects/generate-plan` to ADMIN and MANAGER callers, grounding every proposed role and rate in the live rate card, rate-limiting per user id, refusing USER callers with 403, and rejecting requests the rate card or config cannot support. (was spec-1b-planner-generate-plan-endpoint)

#### Scenario: Happy path returns a draft with warnings
- **GIVEN** a non-empty rate card, a valid request body, a mock model, and a MANAGER caller who can see the named project
- **WHEN** `POST /api/projects/generate-plan` is called
- **THEN** it returns 200 with `{ draft: { resourcePlans: [...] }, warnings: [...] }`

#### Scenario: Empty rate card is rejected before any LLM call
- **GIVEN** zero `GlobalRateCard` rows
- **WHEN** the endpoint is called
- **THEN** it returns 409 before any LLM call

#### Scenario: Rate limiting returns 429
- **GIVEN** one user exceeds `rateLimit.maxPerUser` within `windowSeconds` while a second user has made no calls
- **WHEN** both call the endpoint
- **THEN** the first gets 429 with `retryAfter` and the second is served

#### Scenario: USER is refused
- **GIVEN** a USER caller
- **WHEN** the endpoint is called
- **THEN** it returns 403 before any rate-card or LLM work

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
The system SHALL let an ADMIN or MANAGER drive plan generation from a side sheet in the Resource Plan tab: describe the project, pick a region, watch it generate, and review the result before accepting; a USER sees no Generate entry point. (was spec-2-generate-plan-ui)

#### Scenario: Sheet opens with sane defaults
- **GIVEN** the Resource Plan tab is open for an ADMIN or MANAGER
- **WHEN** the user clicks "Generate AI Plan"
- **THEN** the sheet opens with empty description, region defaulted to Ukraine, and `applyProposedPhases` unchecked

#### Scenario: No button for USER
- **GIVEN** a USER on the Resource Plan tab
- **WHEN** the toolbar renders
- **THEN** there is no "Generate AI Plan" button

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

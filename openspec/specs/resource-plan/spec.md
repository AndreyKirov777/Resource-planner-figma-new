# Resource Plan Specification

## Purpose

A user builds a staffing plan as ordered rows of roles grouped into phases, sets each role's per-period allocation, and sees cost, price, margin, and effort computed live from one shared calculation module.

## Requirements

### Requirement: Resource plan authoring
The system SHALL let a user build a resource plan as ordered rows of roles, each with an internal and a client hourly rate, grouped into phases, and reorder them. (was spec-resource-planner CAP-2)

#### Scenario: Row edits persist and survive reload
- **GIVEN** a resource plan
- **WHEN** a row is edited or manually reordered
- **THEN** the change persists through the API and survives reload, and the grid reflects server state after each edit

### Requirement: Per-period allocation
The system SHALL let a user set each role's allocation percentage (0-100) for every planning period in the grid. (was spec-resource-planner CAP-3)

#### Scenario: Allocation is uniquely keyed and recomputes totals
- **GIVEN** a role row and a planning period
- **WHEN** the allocation for that `(plan, period)` pair is set
- **THEN** it persists uniquely keyed to that pair, and per-row and per-phase totals and estimated effort recompute from the allocations

### Requirement: Real-time costing & margin
The system SHALL compute internal cost, client price, margin, and estimated effort from rates and allocations, live, through one shared calculation module. (was spec-resource-planner CAP-4)

#### Scenario: Figures match the shared calculation module
- **GIVEN** a plan with rates and allocations
- **WHEN** cost, price, margin, or effort is displayed anywhere in the app
- **THEN** every figure matches `src/utils/calculations.ts` (margin as 0..1 internally vs 0-100 persisted; `exchangeRate` applied as `internal × exchangeRate`), the helpers guard against divide-by-zero and non-finite inputs, and no other module re-implements the math

### Requirement: Planning table column visibility
The system SHALL let a user hide and restore individual lead columns in the Planning Table, per project, without affecting other export surfaces. (was spec-planning-table-column-visibility)

#### Scenario: Hiding a column updates the toolbar
- **GIVEN** the Planning Table toolbar
- **WHEN** the user opens Columns and unchecks a lead column
- **THEN** that column disappears, the menu stays open, and the button shows a count badge

#### Scenario: Hidden columns don't shift writes to the wrong field
- **GIVEN** hidden lead columns
- **WHEN** the user edits the first week cell or a remaining hourly cost/rate cell, or right-clicks a week header to insert/delete
- **THEN** the write or action lands on the correct week/field, and Margin recomputes from plan data

#### Scenario: Column visibility persists per project
- **GIVEN** a reload or a switch to another project
- **WHEN** the Planning Table mounts
- **THEN** hidden columns follow the `planning-columns:${project.id}` storage key

#### Scenario: Export surfaces are unaffected by hidden columns
- **GIVEN** any hidden column set
- **WHEN** Excel, PNG, or the client link is used
- **THEN** those surfaces still include all of their columns

### Requirement: Currency change preserves stored rates
The system SHALL recompute margin from the new default exchange rate on a currency change without rewriting stored client rates. (was spec-fix-margin-on-currency-change)

#### Scenario: Currency change does not rewrite rates
- **GIVEN** a plan with stored client rates
- **WHEN** Client currency changes
- **THEN** those rates are not rewritten and Calculated Project Margin uses the new default FX

#### Scenario: Manual exchange rate edit persists independently
- **GIVEN** the user then types a new Exchange rate
- **WHEN** they blur or change that input
- **THEN** only `exchangeRate` is persisted

### Requirement: Daily exchange rates
The system SHALL fetch and cache live exchange rates once per UTC day, falling back to a static table when the provider is unreachable, without overwriting a project's stored custom rate. (was spec-daily-exchange-rates)

#### Scenario: Rates are cached per UTC day
- **GIVEN** the cache is empty
- **WHEN** `GET /api/exchange-rates` runs twice on the same UTC day
- **THEN** the upstream provider is called once and both responses share the same rates

#### Scenario: Provider outage falls back to the static table
- **GIVEN** the live rate provider is unreachable
- **WHEN** the client changes Client currency or creates a project
- **THEN** the static table is used and the UI does not error

#### Scenario: New projects get today's live rate
- **GIVEN** live rates are loaded
- **WHEN** the user creates a project with a given currency
- **THEN** `createProject` persists that currency paired with the live rate for it

#### Scenario: Stored custom rate is never overwritten on boot
- **GIVEN** a project with a stored custom exchange rate
- **WHEN** the app boots
- **THEN** that project's `exchangeRate` is not overwritten

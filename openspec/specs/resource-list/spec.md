# Resource List Specification

## Purpose

A user manages a project's roster of available roles, seeded from the global rate card, and that roster is the source other tabs (including WBS role assignment) read roles from.

## Requirements

### Requirement: Resource roster
The system SHALL let a user manage a project's roster of available roles/resources and seed it from the rate card. (was spec-resource-planner CAP-6)

#### Scenario: Roster persists per project
- **GIVEN** a project's resource list
- **WHEN** roster rows are added or edited
- **THEN** they persist per project

#### Scenario: A rate-card role seeds the roster in one action
- **GIVEN** the global rate card has entries and the Rate Card Price for the active region is visible
- **WHEN** the user adds a rate-card role to a project's roster
- **THEN** it is added in one action with Hourly cost from the active region's internal rate and Hourly rate equal to that row's Price

### Requirement: Hourly rate and computed Margin on the roster
The system SHALL show an editable Hourly rate and a computed, non-editable Margin immediately after Hourly cost on the Resource List table, persist Hourly rate on each roster row, and derive Margin from Hourly rate, Hourly cost, and the open project's exchange rate through the shared calculation module.

#### Scenario: Columns sit after Hourly cost
- **GIVEN** a project's Resource List table
- **WHEN** the table is shown
- **THEN** Hourly rate and Margin appear immediately after Hourly cost, Hourly rate is editable, and Margin is not editable

#### Scenario: Hourly rate persists
- **GIVEN** a roster row
- **WHEN** the user edits Hourly rate
- **THEN** the new value persists per project and survives reload

#### Scenario: Margin uses the shared per-rate formula
- **GIVEN** a roster row whose Hourly cost is 50, Hourly rate is 100, and the open project's exchange rate is 1
- **WHEN** Margin is displayed
- **THEN** it is `((100 − 50 × 1) / 100) × 100` and no other module recomputes that figure

#### Scenario: Zero Hourly rate leaves Margin empty
- **GIVEN** a roster row whose Hourly rate is 0
- **WHEN** Margin is displayed
- **THEN** Margin is empty rather than a numeric percentage

### Requirement: Resource list constrains role pickers elsewhere in the app
The system SHALL offer only a project's own resource-list roles (not the full global rate card) wherever a role is picked for that project's WBS estimates, falling back to free text only when the list is empty. (was spec-wbs-roles-from-resource-list)

#### Scenario: Role picker lists the project's distinct list roles
- **GIVEN** a project with a resource list and a matching rate card
- **WHEN** a role is picked for a WBS item
- **THEN** the offered roles are that project's distinct list roles (minus ones already on the item), not the full global rate card

#### Scenario: A list role with no rate-card match is not offered
- **GIVEN** a resource-list role with no rate-card match and a non-empty card
- **WHEN** the role picker opens
- **THEN** that role is not offered

#### Scenario: Empty resource list disables free text
- **GIVEN** an empty resource list and a populated rate card
- **WHEN** the role picker opens
- **THEN** there is no free-text role input

#### Scenario: Resource Plan and Resource List are unaffected
- **GIVEN** this capability ships
- **WHEN** the Resource Plan or Resource List tab is used
- **THEN** those screens behave exactly as before

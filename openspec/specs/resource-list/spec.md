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
- **GIVEN** the global rate card has entries
- **WHEN** the user adds a rate-card role to a project's roster
- **THEN** it is added in one action

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

# Client View Specification

## Purpose

A user presents a cleaned-up, client-facing view of a plan's pricing, with no internal cost or margin detail, and can export it as a PNG.

## Requirements

### Requirement: Client-facing view
The system SHALL let a user present a cleaned-up, client-facing view of the plan's pricing. (was spec-resource-planner CAP-8)

#### Scenario: Internal figures are never exposed
- **GIVEN** a resource plan
- **WHEN** the client view renders it
- **THEN** it shows client roles and client rates without exposing internal cost or margin detail

### Requirement: Client view PNG export
The system SHALL let a user export the client view as a PNG containing only client-safe columns and summary metrics. (was spec-client-view-png-export)

#### Scenario: Export produces a client-safe PNG
- **GIVEN** a loaded Client View with plans
- **WHEN** the user clicks Export to PNG
- **THEN** a PNG file downloads and contains only client-facing columns and summary metrics, with no internal cost, margin, or internal rate

#### Scenario: Empty plans block export
- **GIVEN** empty `resourcePlans`
- **WHEN** Export to PNG is clicked
- **THEN** the user sees the same alert as Excel export and no file downloads

#### Scenario: Currency symbol matches project currency
- **GIVEN** a EUR or GBP project currency
- **WHEN** exporting
- **THEN** the PNG uses the matching currency symbol for client money fields

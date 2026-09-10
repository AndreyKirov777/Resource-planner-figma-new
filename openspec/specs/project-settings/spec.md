# Project Settings Specification

## Purpose

A user creates, opens, and manages projects, each carrying the planning settings (currency, exchange rate, margin, FTE, planning mode, region, phases) that every other capability reads from, and can convert a project between weekly and monthly cadence.

## Requirements

### Requirement: Project lifecycle & settings
The system SHALL let a user create, open, rename, copy, and delete projects, each carrying planning settings (client currency, exchange rate, default margin, FTE days, planning mode, default region, phases). (was spec-resource-planner CAP-1)

#### Scenario: Project persists and reopens by URL
- **GIVEN** a project has been created
- **WHEN** the page is reloaded at `?project=<id>`
- **THEN** the same project reopens with its settings intact

#### Scenario: Copy duplicates project data but not the rate card
- **GIVEN** an existing project
- **WHEN** it is copied
- **THEN** all per-project data is duplicated but the global rate card is not

#### Scenario: Delete cascades
- **GIVEN** a project with resource lists, plans, and allocations
- **WHEN** the project is deleted
- **THEN** its resource lists, plans, and allocations are deleted with it

### Requirement: Weekly / monthly planning
The system SHALL let a user plan in a weekly or monthly cadence and convert a plan between the two. (was spec-resource-planner CAP-7)

#### Scenario: Conversion is consistent and transactional
- **GIVEN** a project in one planning mode
- **WHEN** the user converts it to the other mode
- **THEN** the project's phases and every plan's allocations are transformed consistently within one transaction, using `weeksPerMonth = daysInFTE / 5`, and the fully reloaded project is returned

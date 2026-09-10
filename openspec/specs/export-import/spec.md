# Export & Import Specification

## Purpose

A user exports a plan to Excel, exports/imports a whole project as JSON at the current schema version, and captures a PNG snapshot, with every prior schema version still importable.

## Requirements

### Requirement: Excel export
The system SHALL let a user export a plan to Excel, phase-grouped with per-row financials and totals. (was spec-resource-planner CAP-9)

#### Scenario: Excel export is phase-grouped with totals
- **GIVEN** a resource plan
- **WHEN** it is exported to Excel
- **THEN** the workbook is phase-grouped with per-row financials and totals

### Requirement: Project JSON export & import
The system SHALL let a user export/import a whole project as JSON at `schemaVersion: 4`, round-tripping lists, plans, allocations, the WBS tree, and the roadmap (`roadmapLanes`, plus `Project.startDate`), while the global rate card is excluded. (was spec-resource-planner CAP-9)

#### Scenario: A schemaVersion 4 round trip preserves the project
- **GIVEN** a project with resource lists, plans, allocations, a WBS tree, and a roadmap
- **WHEN** it is exported and the payload is imported
- **THEN** the new project has the same shape and hours (with new IDs), and the rate card is not included in the export

#### Scenario: Legacy payloads still import
- **GIVEN** a legacy export using `weeklyAllocations`/`weekNumber`, a v2 payload with no WBS, or a v3 payload with WBS but no roadmap
- **WHEN** it is imported
- **THEN** the project loads correctly, with WBS and/or roadmap empty where the payload predates them

#### Scenario: Import succeeds even when the rate card has drifted
- **GIVEN** an exported WBS estimate
- **WHEN** the live rate card no longer contains that estimate's `discipline`
- **THEN** import still writes that estimate

#### Scenario: Export with no WBS rows still reports the current schema version
- **GIVEN** a project with no WBS rows
- **WHEN** it is exported
- **THEN** `data.wbsItems` is `[]` and `schemaVersion` is `4`

### Requirement: PNG snapshot
The system SHALL let a user capture a PNG snapshot of the plan's table and financial summary. (was spec-resource-planner CAP-9)

#### Scenario: PNG renders table and summary
- **GIVEN** a resource plan
- **WHEN** a PNG snapshot is captured
- **THEN** it renders the table plus the financial summary

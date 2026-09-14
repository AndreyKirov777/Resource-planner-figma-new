## MODIFIED Requirements

### Requirement: Excel export
The system SHALL let a user export a plan to Excel, phase-grouped with per-row financials and totals, where a USER's workbook contains no internal cost, internal rate, margin, default margin, or exchange rate columns or rows. (was spec-resource-planner CAP-9)

#### Scenario: Excel export is phase-grouped with totals
- **GIVEN** a resource plan and an ADMIN or MANAGER
- **WHEN** it is exported to Excel
- **THEN** the workbook is phase-grouped with per-row financials and totals

#### Scenario: USER workbook has no internal columns
- **GIVEN** a USER
- **WHEN** they export the plan to Excel
- **THEN** the workbook has no "Internal Hourly Cost", "Internal Daily Cost", "Margin", "Total Internal Cost", "Internal Cost", or "Project Margin" columns or summary rows, rather than showing them as zero

### Requirement: Project JSON export & import
The system SHALL let a user export/import a whole project as JSON at `schemaVersion: 4`, round-tripping lists, plans, allocations, the WBS tree, the roadmap (`roadmapLanes`, plus `Project.startDate`), and the project's `status`, while the global rate card is excluded, the imported project is owned by the importer, a USER's export omits internal fields, and a payload missing them imports with those values as `0` or the application default; a payload that omits `status` imports as `active`. (was spec-resource-planner CAP-9)

#### Scenario: A schemaVersion 4 round trip preserves the project
- **GIVEN** a project with resource lists, plans, allocations, a WBS tree, a roadmap, and a status, exported by an ADMIN or MANAGER
- **WHEN** it is exported and the payload is imported
- **THEN** the new project has the same shape, hours, and status (with new IDs), is owned by the importer, and the rate card is not included in the export

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

#### Scenario: Missing status on import is active
- **GIVEN** a `schemaVersion` 4 payload that omits `status`
- **WHEN** it is imported
- **THEN** the new project is `active` and `schemaVersion` remains `4`

#### Scenario: Archived status round-trips without a schema bump
- **GIVEN** an archived project
- **WHEN** it is exported and the payload is imported
- **THEN** the new project is `archived` and `schemaVersion` is `4`

#### Scenario: USER export is stripped and re-imports with zeros
- **GIVEN** a USER exporting a project
- **WHEN** the file is produced and later imported by anyone
- **THEN** the file contains no `intRate`, `intHourlyRate`, `defaultMargin`, or `exchangeRate`, `schemaVersion` is still `4`, and the imported rows carry `intRate`/`intHourlyRate` of `0` with project defaults for margin and exchange rate

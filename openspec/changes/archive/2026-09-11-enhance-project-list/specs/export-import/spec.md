## MODIFIED Requirements

### Requirement: Project JSON export & import
The system SHALL let a user export/import a whole project as JSON at `schemaVersion: 4`, round-tripping lists, plans, allocations, the WBS tree, the roadmap (`roadmapLanes`, plus `Project.startDate`), and the project's `status`, while the global rate card is excluded; a payload that omits `status` imports as `active`. (was spec-resource-planner CAP-9)

#### Scenario: A schemaVersion 4 round trip preserves the project
- **GIVEN** a project with resource lists, plans, allocations, a WBS tree, a roadmap, and a status
- **WHEN** it is exported and the payload is imported
- **THEN** the new project has the same shape, hours, and status (with new IDs), and the rate card is not included in the export

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

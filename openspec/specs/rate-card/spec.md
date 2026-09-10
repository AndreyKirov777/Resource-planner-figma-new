# Rate Card Specification

## Purpose

A user maintains the single, org-wide rate card that every project's costing and role selection draws from.

## Requirements

### Requirement: Global rate card management
The system SHALL let a user import the org-wide rate card from Excel, edit and clear entries inline, and read regional internal rates per role. (was spec-resource-planner CAP-5)

#### Scenario: Bulk import atomically replaces the card
- **GIVEN** an Excel workbook containing the `"RMNG RATES"` sheet
- **WHEN** it is imported
- **THEN** the entire rate card is atomically replaced and last-import metadata is recorded

#### Scenario: Rate card is shared and excluded from project data
- **GIVEN** the global rate card
- **WHEN** any project is copied, exported, or imported
- **THEN** the rate card is shared across every project and is never included in that project copy/export/import

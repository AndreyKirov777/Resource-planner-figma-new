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

### Requirement: Client hourly Price from Default Margin
The system SHALL show the open project's Default Margin after the Discipline filter on the Rate Card page, and a computed non-editable Price column whose client hourly rate is `(internalRate / (1 - marginDecimal)) * exchangeRate` using the active region's internal rate, that Default Margin (percentage ÷ 100; application default when the project's value is null), and the project's exchange rate.

#### Scenario: Default Margin appears after Discipline
- **GIVEN** an open project whose Default Margin is 45
- **WHEN** the Rate Card page is shown
- **THEN** Default Margin is displayed as 45% immediately after the Discipline filter and is not editable

#### Scenario: Price uses Default Margin and the active region
- **GIVEN** a rate-card row whose Ukraine internal rate is 50 and an open project with Default Margin 45 and exchange rate 1
- **WHEN** the Ukraine region tab is active
- **THEN** that row's Price is the client hourly rate `50 / (1 - 0.45) × 1` and is not editable

#### Scenario: Switching region recomputes Price
- **GIVEN** a rate-card row with Ukraine internal rate 50 and London internal rate 110, Default Margin 45, and exchange rate 1
- **WHEN** the user selects the London region tab
- **THEN** that row's Price is `110 / (1 - 0.45) × 1`

#### Scenario: Null Default Margin falls back
- **GIVEN** an open project whose Default Margin is null
- **WHEN** the Rate Card page is shown
- **THEN** Default Margin displays the application default 45% and Price uses that fallback

#### Scenario: Price is not persisted on the rate card
- **GIVEN** the global rate card
- **WHEN** Price is displayed
- **THEN** no client hourly rate is stored on the rate card and Excel import remains limited to roles and regional internal rates

## MODIFIED Requirements

### Requirement: Global rate card management
The system SHALL let an ADMIN import the org-wide rate card from Excel, edit and clear entries inline, and read regional internal rates per role, while a MANAGER reads the card with rates but cannot write, and a USER reads only the catalog columns (role, namingInPM, discipline, description) with every write refused. (was spec-resource-planner CAP-5)

#### Scenario: Bulk import atomically replaces the card
- **GIVEN** an Excel workbook containing the `"RMNG RATES"` sheet and an ADMIN caller
- **WHEN** it is imported
- **THEN** the entire rate card is atomically replaced and last-import metadata is recorded

#### Scenario: Rate card is shared and excluded from project data
- **GIVEN** the global rate card
- **WHEN** any project is copied, exported, or imported
- **THEN** the rate card is shared across every project and is never included in that project copy/export/import

#### Scenario: Manager is read-only
- **GIVEN** a MANAGER
- **WHEN** they call any rate-card write endpoint
- **THEN** the response is 403, and the Rate Card page shows no add, edit, import, or clear controls

#### Scenario: User sees the catalog only
- **GIVEN** a USER
- **WHEN** they fetch the rate card
- **THEN** each row contains only id, role, namingInPM, discipline, and description; the page shows no region tabs, rate columns, Default Margin, or Price; and any write returns 403

### Requirement: Client hourly Price from Default Margin
The system SHALL compute the Rate Card Price column on the server for ADMIN and MANAGER callers as `(internalRate / (1 - marginDecimal)) * exchangeRate` per region, using the open project's Default Margin (application default when null) and exchange rate, show it non-editable for the active region after the Discipline filter alongside the displayed Default Margin, and omit it entirely for USER callers.

#### Scenario: Default Margin appears after Discipline
- **GIVEN** an open project whose Default Margin is 45 and an ADMIN or MANAGER caller
- **WHEN** the Rate Card page is shown
- **THEN** Default Margin is displayed as 45% immediately after the Discipline filter and is not editable

#### Scenario: Price uses Default Margin and the active region
- **GIVEN** a rate-card row whose Ukraine internal rate is 50 and an open project with Default Margin 45 and exchange rate 1
- **WHEN** the Ukraine region tab is active
- **THEN** that row's Price is the client hourly rate `50 / (1 - 0.45) × 1`, delivered by the API rather than computed in the browser, and is not editable

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

#### Scenario: No Price for USER
- **GIVEN** a USER
- **WHEN** they fetch the rate card for a project
- **THEN** no price figures are returned and no Price column is shown

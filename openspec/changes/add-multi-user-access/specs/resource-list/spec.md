## MODIFIED Requirements

### Requirement: Resource roster
The system SHALL let a project editor manage the project's roster of available roles/resources and seed it from the rate card through a server endpoint that copies the row and derives its client Hourly rate, so that no caller needs the internal rate in the browser to seed a role. (was spec-resource-planner CAP-6)

#### Scenario: Roster persists per project
- **GIVEN** a project's resource list and a caller with EDITOR, OWNER, or ADMIN access
- **WHEN** roster rows are added or edited
- **THEN** they persist per project

#### Scenario: A rate-card role seeds the roster in one action
- **GIVEN** the global rate card has entries and a region is active on the Rate Card page
- **WHEN** the user adds a rate-card role to a project's roster
- **THEN** one request naming the rate-card row and region creates the roster row with role, client role, description, location, Hourly cost from that region's internal rate, and Hourly rate computed on the server from the project's Default Margin (application default when null) and exchange rate

#### Scenario: USER seeds without receiving internal figures
- **GIVEN** a USER who is EDITOR on the project
- **WHEN** they seed a role from the rate card
- **THEN** the row is created with the correct Hourly cost stored, and the response and later reads omit Hourly cost

#### Scenario: Manual Hourly cost is for ADMIN and MANAGER
- **GIVEN** the "Add custom resource" form
- **WHEN** an ADMIN or MANAGER uses it
- **THEN** they may enter Hourly cost; a USER sees no Hourly cost input and any value they send is ignored

### Requirement: Hourly rate and computed Margin on the roster
The system SHALL show an editable Hourly rate and, for ADMIN and MANAGER only, a computed non-editable Margin immediately after Hourly cost on the Resource List table, persist Hourly rate on each roster row, derive Margin from Hourly rate, Hourly cost, and the open project's exchange rate through the shared calculation module, and show neither Hourly cost nor Margin to a USER.

#### Scenario: Columns sit after Hourly cost
- **GIVEN** a project's Resource List table viewed by an ADMIN or MANAGER
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

#### Scenario: USER sees no cost or margin
- **GIVEN** a USER viewing the Resource List
- **WHEN** the table is shown
- **THEN** there is no Hourly cost column, no Margin column, and no average Hourly cost summary; Hourly rate remains visible and editable when they may edit

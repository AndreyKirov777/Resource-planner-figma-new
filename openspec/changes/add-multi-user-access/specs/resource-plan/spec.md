## MODIFIED Requirements

### Requirement: Resource plan authoring
The system SHALL let a project editor build a resource plan as ordered rows of roles, each with an internal and a client hourly rate, grouped into phases, and reorder them, with every row update carrying the row's version so a stale edit is refused rather than overwriting a colleague's change. (was spec-resource-planner CAP-2)

#### Scenario: Row edits persist and survive reload
- **GIVEN** a resource plan and a caller allowed to edit
- **WHEN** a row is edited or manually reordered
- **THEN** the change persists through the API and survives reload, and the grid reflects server state after each edit

#### Scenario: Stale row edit is refused
- **GIVEN** a plan row changed by another editor since this grid loaded
- **WHEN** this user edits any cell of that row
- **THEN** the save is refused with 409, the UI says "This row was changed by <name> at <time>. Reload?", and confirming reloads the project

### Requirement: Real-time costing & margin
The system SHALL compute internal cost, client price, margin, and estimated effort from rates and allocations, live, through one shared calculation module, showing internal cost and margin figures only to ADMIN and MANAGER. (was spec-resource-planner CAP-4)

#### Scenario: Figures match the shared calculation module
- **GIVEN** a plan with rates and allocations
- **WHEN** cost, price, margin, or effort is displayed anywhere in the app
- **THEN** every figure matches `src/utils/calculations.ts` (margin as 0..1 internally vs 0-100 persisted; `exchangeRate` applied as `internal × exchangeRate`), the helpers guard against divide-by-zero and non-finite inputs, and no other module re-implements the math

#### Scenario: USER sees price and effort only
- **GIVEN** a USER viewing a plan
- **WHEN** the grid and summary render
- **THEN** the Cost total column, per-phase cost and margin, Total Internal Cost, Calculated Project Margin, and the Default Margin control are absent; Price, Discounted cost, Investment, and Efforts remain

### Requirement: Planning table column visibility
The system SHALL let a user hide and restore individual lead columns in the Planning Table, per project, without affecting other export surfaces, and SHALL never offer the Hourly cost, Daily cost, or Margin columns to a USER. (was spec-planning-table-column-visibility)

#### Scenario: Hiding a column updates the toolbar
- **GIVEN** the Planning Table toolbar
- **WHEN** the user opens Columns and unchecks a lead column
- **THEN** that column disappears, the menu stays open, and the button shows a count badge

#### Scenario: Hidden columns don't shift writes to the wrong field
- **GIVEN** hidden lead columns
- **WHEN** the user edits the first week cell or a remaining hourly cost/rate cell, or right-clicks a week header to insert/delete
- **THEN** the write or action lands on the correct week/field, and Margin recomputes from plan data

#### Scenario: Column visibility persists per project
- **GIVEN** a reload or a switch to another project
- **WHEN** the Planning Table mounts
- **THEN** hidden columns follow the `planning-columns:${project.id}` storage key

#### Scenario: Export surfaces are unaffected by hidden columns
- **GIVEN** any hidden column set
- **WHEN** Excel, PNG, or a share link is used
- **THEN** those surfaces still include all of the columns the caller's group may see

#### Scenario: Internal columns are not offered to USER
- **GIVEN** a USER
- **WHEN** they open the Columns menu
- **THEN** Hourly cost, Daily cost, and Margin are absent from the menu and the grid, and a stored preference naming them has no effect

### Requirement: Plan-side role constraint
The system SHALL constrain a resource plan row's role to an entry in the project's resource list whenever that list is non-empty, both in the grid and on write, and SHALL apply a resource-list entry to a plan row through a server endpoint that copies the entry's rates; a project with an empty resource list remains unconstrained. (was D6, sprint-change-proposal-2026-08-12)

#### Scenario: Unmatched typed role does not persist
- **GIVEN** a project whose resource list is non-empty
- **WHEN** the user types a role in the plan grid's role cell that matches no entry in the project's resource list
- **THEN** the cell reverts to its previous value and no write is sent

#### Scenario: Role picker remains the sanctioned path
- **GIVEN** a project whose resource list is non-empty and a list entry with a non-zero Hourly rate
- **WHEN** the user opens the role picker dialog on a new plan row and selects that entry
- **THEN** one request naming the list entry creates the plan row with role, client role, name, Hourly cost, and Hourly rate copied on the server, and the plan's client hourly rate is the list entry's Hourly rate rather than a value recomputed from Default Margin

#### Scenario: Typed role match copies Hourly rate
- **GIVEN** a project whose resource list is non-empty and a list entry with a non-zero Hourly rate
- **WHEN** the user types a role in the plan grid that matches that entry
- **THEN** the server sets the row's client hourly rate to that entry's Hourly rate and its internal rate to the entry's Hourly cost

#### Scenario: Zero list Hourly rate falls back to Default Margin
- **GIVEN** a resource-list entry whose Hourly rate is 0
- **WHEN** that entry is applied to a plan row
- **THEN** the server computes the plan's client hourly rate from the entry's Hourly cost, the project's Default Margin, and exchange rate, as before this change

#### Scenario: New row is seeded from the resource list
- **GIVEN** a project whose resource list is non-empty
- **WHEN** a new plan row is added
- **THEN** its role is seeded from an entry in the project's resource list, not an arbitrary placeholder

#### Scenario: Empty resource list leaves the plan unconstrained
- **GIVEN** a project whose resource list is empty
- **WHEN** a plan row's role is created or edited with arbitrary text
- **THEN** it is accepted, exactly as before this change

#### Scenario: Server rejects a non-matching role on write
- **GIVEN** a project whose resource list is non-empty
- **WHEN** `POST /api/projects/:projectId/resource-plans` or `PUT /api/resource-plans/:id` is called with a `role` that matches no entry in that project's resource list
- **THEN** the request is rejected with 400 and no row is written or changed

#### Scenario: Existing rows with a non-matching role are left alone
- **GIVEN** a resource plan row whose role does not match any current resource-list entry
- **WHEN** that row is read or any of its other fields are edited without changing `role`
- **THEN** the row is returned and updated normally, unaffected by this constraint

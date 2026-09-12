## MODIFIED Requirements

### Requirement: Plan-side role constraint
The system SHALL constrain a resource plan row's role to an entry in the project's resource list whenever that list is non-empty, both in the grid and on write; a project with an empty resource list remains unconstrained. (was D6, sprint-change-proposal-2026-08-12)

#### Scenario: Unmatched typed role does not persist
- **GIVEN** a project whose resource list is non-empty
- **WHEN** the user types a role in the plan grid's role cell that matches no entry in the project's resource list
- **THEN** the cell reverts to its previous value and no write is sent

#### Scenario: Role picker remains the sanctioned path
- **GIVEN** a project whose resource list is non-empty and a list entry with a non-zero Hourly rate
- **WHEN** the user opens the role picker dialog on a plan row and selects that entry
- **THEN** the role, Hourly cost, Hourly rate, name, and client role update from that resource list entry, and the plan's client hourly rate is the list entry's Hourly rate rather than a value recomputed from Default Margin

#### Scenario: Typed role match copies Hourly rate
- **GIVEN** a project whose resource list is non-empty and a list entry with a non-zero Hourly rate
- **WHEN** the user types a role in the plan grid that matches that entry
- **THEN** the plan row's client hourly rate is set to that entry's Hourly rate

#### Scenario: Zero list Hourly rate falls back to Default Margin
- **GIVEN** a resource-list entry whose Hourly rate is 0
- **WHEN** that entry is applied to a plan row
- **THEN** the plan's client hourly rate is computed from the entry's Hourly cost, the project's Default Margin, and exchange rate, as before this change

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

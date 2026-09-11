## MODIFIED Requirements

### Requirement: Project lifecycle & settings
The system SHALL let a user create, open, rename, copy, archive, restore, and delete projects, each carrying a status of `active` or `archived` (new creates and pre-status rows default to `active`) plus planning settings (client currency, exchange rate, default margin, FTE days, planning mode, default region, phases), with archive acting as a folder so an archived project stays fully openable and editable, copy of an archived project creating a new `active` project, `?project=<id>` opening that project regardless of status, and app boot with no id preferring an `active` project. (was spec-resource-planner CAP-1)

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

#### Scenario: Archive does not lock the project
- **GIVEN** an active project
- **WHEN** the user archives it
- **THEN** its status is `archived` and it remains fully openable and editable without restore

#### Scenario: Restore returns a project to active
- **GIVEN** an archived project
- **WHEN** the user restores it
- **THEN** its status is `active`

#### Scenario: Copy of an archived project is active
- **GIVEN** an archived project
- **WHEN** it is copied
- **THEN** the new project is `active` and all per-project data is duplicated but the global rate card is not

#### Scenario: Deep link opens an archived project
- **GIVEN** an archived project
- **WHEN** the page is opened at `?project=<id>`
- **THEN** that project opens with its settings intact and the UI shows it is archived

#### Scenario: App boot prefers an active project
- **GIVEN** both active and archived projects exist and the URL has no `project` id
- **WHEN** the app boots
- **THEN** an active project is opened rather than an archived one

#### Scenario: Existing projects are active
- **GIVEN** a project that existed before status was introduced
- **WHEN** it is loaded
- **THEN** its status is `active`

## ADDED Requirements

### Requirement: Project list sort, search, and status filter
The system SHALL present the project list sorted by last updated newest first by default, click-to-sortable on Project name, Created, and Last updated, narrowed by a single case-insensitive substring search that matches when either the name or the description contains the query, and filtered by status (`Active` / `Archived` / `All`, default `Active`), with search applying to the current status filter and only the `All` view marking archived rows with a badge on the name.

#### Scenario: Default order is last updated newest first
- **GIVEN** multiple projects with different last-updated times
- **WHEN** the project list is shown with no sort override
- **THEN** the rows appear in last-updated order, newest first

#### Scenario: Click-to-sort on a column
- **GIVEN** the project list is visible
- **WHEN** the user clicks the Project name, Created, or Last updated header
- **THEN** the visible rows are ordered by that column, and a second click reverses the direction

#### Scenario: Search matches name or description
- **GIVEN** projects whose names and descriptions differ
- **WHEN** the user types a query into the search box
- **THEN** a project is listed if either its name or its description contains the query, case-insensitively

#### Scenario: Search applies to the current status filter
- **GIVEN** matching active and archived projects and the status filter set to Active
- **WHEN** the user types a query that matches both
- **THEN** only the matching active projects are listed

#### Scenario: Default status filter hides archived projects
- **GIVEN** both active and archived projects
- **WHEN** the project list is shown with the default status filter
- **THEN** only active projects are listed

#### Scenario: Archived filter shows only archived projects
- **GIVEN** both active and archived projects
- **WHEN** the user sets the status filter to Archived
- **THEN** only archived projects are listed and no archived badge is shown on the name

#### Scenario: All view marks archived rows
- **GIVEN** both active and archived projects
- **WHEN** the user sets the status filter to All
- **THEN** every project is listed and each archived row shows a badge on the name

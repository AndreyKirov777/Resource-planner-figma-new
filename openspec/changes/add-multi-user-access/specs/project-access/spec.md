## Purpose

Decides which projects each signed-in person can see and change: ownership, explicit sharing with a role, the ADMIN bypass, the USER group's ceiling on internal figures, and detection of conflicting edits.

## ADDED Requirements

### Requirement: Project ownership
The system SHALL record the creator of every project as its owner and creator, and SHALL make the caller the owner of any project produced by copy or JSON import.

#### Scenario: Create makes the caller owner
- **GIVEN** a signed-in MANAGER
- **WHEN** they create a project
- **THEN** the project's owner and creator are that user and they hold the OWNER role on it

#### Scenario: Copy and import are owned by the caller
- **GIVEN** a project shared with a user as VIEWER
- **WHEN** that user copies it or imports an exported file
- **THEN** the new project is owned by that user, not by the source project's owner

### Requirement: Membership roles
The system SHALL grant a project's members one of OWNER, EDITOR, or VIEWER, where VIEWER may only read, EDITOR may also change all project content (plan, resource list, WBS, roadmap, settings), and OWNER may also share, change members, delete, and archive; ADMIN may do everything on every project.

#### Scenario: Viewer cannot write
- **GIVEN** a user who is VIEWER on a project
- **WHEN** they call any write endpoint under that project
- **THEN** the response is 403 and nothing changes

#### Scenario: Editor cannot share or delete
- **GIVEN** a user who is EDITOR on a project
- **WHEN** they add a member or delete the project
- **THEN** the response is 403

#### Scenario: Admin bypasses membership
- **GIVEN** an ADMIN who is not a member of a project
- **WHEN** they read, edit, share, or delete it
- **THEN** every call succeeds

### Requirement: Archived projects are read-only for non-owners
The system SHALL keep archived projects visible and shareable while rejecting content writes from anyone except OWNER or ADMIN until the project is restored.

#### Scenario: Editor on an archived project
- **GIVEN** a user who is EDITOR on an archived project
- **WHEN** they edit a plan row
- **THEN** the response is 403 and the UI shows the project as read-only

#### Scenario: Owner restores
- **GIVEN** the OWNER of an archived project
- **WHEN** they set status back to active
- **THEN** the change succeeds and editors can write again

### Requirement: Sharing dialog
The system SHALL let OWNER or ADMIN open a Share dialog on a project, search existing users by email or name, add a member with a role, change a member's role, and remove a member.

#### Scenario: Add a member
- **GIVEN** the OWNER opens Share and searches for a colleague who has signed in before
- **WHEN** they pick that user with role EDITOR
- **THEN** the colleague sees the project under "Shared with me" and can edit it

#### Scenario: Users who never signed in are not offered
- **GIVEN** a colleague who has never signed in
- **WHEN** the owner searches for them
- **THEN** no result is shown

### Requirement: Project list scopes
The system SHALL present the project list in scopes "My projects" (owned) and "Shared with me" (member but not owner), plus "All projects" for ADMIN only, and the list endpoint SHALL never return a project the caller is not owner, member, or ADMIN of.

#### Scenario: Manager sees only own and shared
- **GIVEN** a MANAGER who owns one project and is a member of another, while a third exists
- **WHEN** they list projects
- **THEN** the third project is absent from every scope offered to them

#### Scenario: All projects for admin
- **GIVEN** an ADMIN
- **WHEN** they choose "All projects"
- **THEN** every project is listed with its owner's name

### Requirement: Project resolution and existence hiding
The system SHALL resolve the project for every project-scoped route from the path parameter or from the row being read or edited, never from the request body, and SHALL answer 404 when the caller has no access to that project.

#### Scenario: Row-scoped route resolves through its row
- **GIVEN** a resource plan row belonging to a project the caller cannot see
- **WHEN** they call `PUT /api/resource-plans/:id`
- **THEN** the response is 404, identical to a non-existent id

#### Scenario: Body references are validated against the resolved project
- **GIVEN** a reorder request under project A whose `orderedIds` include a row from project B
- **WHEN** the request is processed
- **THEN** it is rejected and no row in project B changes

### Requirement: USER visibility ceiling
The system SHALL omit `intRate`, `intHourlyRate`, `defaultMargin`, `exchangeRate`, the nine rate-card regional rates, and any computed internal cost or margin from every response to a USER caller, SHALL ignore those fields in write bodies from a USER caller, and the UI SHALL hide the corresponding columns and totals for USER regardless of their project role.

#### Scenario: Editor in USER group still sees no internal figures
- **GIVEN** a USER who is EDITOR on a project
- **WHEN** they fetch the project, its resource lists, or resource plans
- **THEN** no response contains the omitted keys and the grid shows no Hourly cost, Daily cost, Margin, Cost total, Total Internal Cost, Default Margin, or Calculated Project Margin

#### Scenario: Internal fields in a USER write are dropped
- **GIVEN** a USER who is EDITOR
- **WHEN** they send `intHourlyRate: 80` on a plan row update
- **THEN** the stored internal rate is unchanged and the response omits it

#### Scenario: Manager sees everything
- **GIVEN** a MANAGER who is VIEWER on a project
- **WHEN** they fetch it
- **THEN** internal rates, margin, and exchange rate are present

### Requirement: Ownership migration for existing data
The system SHALL assign every project that has no owner to the first ADMIN who signs in after the upgrade, and SHALL not seed a default project when the database is empty.

#### Scenario: Legacy projects get an owner
- **GIVEN** a database upgraded from the single-user version with three ownerless projects
- **WHEN** the first ADMIN signs in
- **THEN** all three projects are owned by that admin and appear under their "My projects"

#### Scenario: Empty database shows an empty list
- **GIVEN** no projects
- **WHEN** a user opens the app
- **THEN** the project list shows its empty state and no project is created automatically

### Requirement: Users directory
The system SHALL list users who have signed in (id, email, display name, group, active flag) to any signed-in caller, and SHALL show a read-only Users page to ADMIN only.

#### Scenario: Users page for admin
- **GIVEN** an ADMIN
- **WHEN** they open the Users tab
- **THEN** they see every user with email, name, group, and last login, with no edit controls

#### Scenario: No Users tab for others
- **GIVEN** a MANAGER or USER
- **WHEN** the app renders
- **THEN** there is no Users tab

### Requirement: Concurrent edit conflict detection
The system SHALL carry a `version` on projects, resource-list rows, and resource-plan rows, SHALL apply an update only when the client's version matches the stored one, incrementing it on success, and on mismatch SHALL answer 409 with who last changed the row and when, which the UI reports with an offer to reload.

#### Scenario: Stale update is refused
- **GIVEN** two editors holding version 3 of a plan row
- **WHEN** the second one saves after the first
- **THEN** the second save gets 409 with the first editor's name and the change time, and the row keeps the first editor's values at version 4

#### Scenario: Reload after conflict
- **GIVEN** a 409 response
- **WHEN** the user confirms "Reload?"
- **THEN** the project is reloaded and the grid shows version 4 values

#### Scenario: WBS and roadmap are unversioned
- **GIVEN** two editors changing the same WBS item
- **WHEN** both save
- **THEN** last write wins with no 409

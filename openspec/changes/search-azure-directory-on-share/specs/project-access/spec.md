## MODIFIED Requirements

### Requirement: Sharing dialog
The system SHALL let OWNER or ADMIN open a Share dialog on a project, search the Entra directory by name or email as they type, add a member with a role (creating a local user from the directory identity when none exists), change a member's role, and remove a member.

#### Scenario: Add a member who has signed in
- **GIVEN** the OWNER opens Share and types a colleague's name who has signed in before
- **WHEN** they pick that user with role EDITOR
- **THEN** the colleague sees the project under "Shared with me" and can edit it

#### Scenario: Add a member who has never signed in
- **GIVEN** a colleague who exists in the Entra tenant, belongs to a Resource Planner group, and has never signed in
- **WHEN** the owner types their name and adds them as EDITOR
- **THEN** they appear in the member list immediately, and after they sign in they see the project under "Shared with me" and can edit it

#### Scenario: Short query does not search
- **GIVEN** the OWNER opens Share
- **WHEN** they type fewer than two characters
- **THEN** no directory results are requested or shown

#### Scenario: Dev mode searches local users
- **GIVEN** the app is running with the dev identity fixtures
- **WHEN** the owner types a fixture user's name
- **THEN** matching local users are shown and the tenant directory is not queried

#### Scenario: Editor cannot share
- **GIVEN** a user who is EDITOR on a project
- **WHEN** they open Share
- **THEN** the People search and add controls are not offered

## ADDED Requirements

### Requirement: Directory add requires Resource Planner access
The system SHALL refuse to add a directory identity that is not in `ENTRA_GROUP_ADMIN`, `ENTRA_GROUP_MANAGER`, or `ENTRA_GROUP_USER` and is not listed in `ADMIN_EMAILS`.

#### Scenario: Colleague with no planner group
- **GIVEN** a directory user who matches the typed query but is in none of the three groups and not in `ADMIN_EMAILS`
- **WHEN** the owner clicks Add
- **THEN** the add is rejected, no member row is created, and the dialog explains they do not have access to Resource Planner

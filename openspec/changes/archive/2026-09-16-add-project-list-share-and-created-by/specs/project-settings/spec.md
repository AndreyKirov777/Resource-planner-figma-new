## ADDED Requirements

### Requirement: Project list created by
The system SHALL show a Created by column immediately after Last updated on every project-list row, using the creator's display name or an em dash when none is recorded.

#### Scenario: Created by follows Last updated
- **GIVEN** the project list is visible
- **WHEN** the table headers are shown
- **THEN** Created by appears immediately after Last updated

#### Scenario: Creator display name
- **GIVEN** a project whose creator has display name "Ada Lovelace"
- **WHEN** the project list is shown
- **THEN** that row's Created by cell is "Ada Lovelace"

#### Scenario: Missing creator
- **GIVEN** a project with no recorded creator
- **WHEN** the project list is shown
- **THEN** that row's Created by cell is an em dash

#### Scenario: Created by on My projects
- **GIVEN** the scope is "My projects" (Owner column hidden)
- **WHEN** the project list is shown
- **THEN** Created by is still shown after Last updated

### Requirement: Project list share action
The system SHALL offer a Share action on every visible project-list row, placed after Edit and before Archive or Restore, that opens the Share dialog for that project.

#### Scenario: Share sits between Edit and Archive
- **GIVEN** an active project the caller owns
- **WHEN** the project list is shown
- **THEN** that row's actions include Edit, then Share, then Archive

#### Scenario: Share sits before Restore
- **GIVEN** an archived project the caller owns
- **WHEN** the project list is shown
- **THEN** that row's actions include Share immediately before Restore

#### Scenario: Viewer still sees Share
- **GIVEN** a project the caller can see as VIEWER
- **WHEN** the project list is shown
- **THEN** that row offers Share even though Edit and Archive are hidden

#### Scenario: Share opens the dialog
- **GIVEN** a visible project row
- **WHEN** the user clicks Share
- **THEN** the Share dialog for that project opens

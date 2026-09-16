## ADDED Requirements

### Requirement: Share from the project list
The system SHALL let a signed-in user who can see a project open that project's existing Share dialog from the project list, with the same People and Client links visibility as when the dialog is opened from the plan.

#### Scenario: Owner opens Share from the list
- **GIVEN** the OWNER of a project is on the project list
- **WHEN** they click Share on that row
- **THEN** the Share dialog opens with People management and Client links

#### Scenario: Editor opens Share from the list
- **GIVEN** a user who is EDITOR on a project is on the project list
- **WHEN** they click Share on that row
- **THEN** the Share dialog opens with Client links and without People search or add controls

#### Scenario: Viewer opens Share from the list
- **GIVEN** a user who is VIEWER on a project is on the project list
- **WHEN** they click Share on that row
- **THEN** the Share dialog opens without People management and without Client links

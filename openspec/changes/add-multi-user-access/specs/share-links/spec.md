## Purpose

Gives external clients a time-limited, revocable link to the client-safe view of a plan without an account.

## ADDED Requirements

### Requirement: Expiring share links
The system SHALL let OWNER, EDITOR, or ADMIN create a share link for a project with a lifetime of 7, 30, or 90 days, backed by an unguessable token of at least 32 random bytes, and SHALL let them list and revoke the project's links.

#### Scenario: Create a link
- **GIVEN** an EDITOR on the plan page
- **WHEN** they create a 30-day link
- **THEN** a URL of the form `/client/<token>` is shown for copying and the link appears in the project's link list with its expiry and creator

#### Scenario: Revoke a link
- **GIVEN** an active link
- **WHEN** its creator or the owner revokes it
- **THEN** it is marked revoked and stops resolving immediately

#### Scenario: Viewer cannot create links
- **GIVEN** a VIEWER
- **WHEN** they call the create-link endpoint
- **THEN** the response is 403

### Requirement: Public client payload
The system SHALL serve `GET /api/share/:token` without a session, returning only client-safe data (project name, currency, planning mode, phases, FTE days, investment, start date, and per row: role, client role, name, client hourly rate, display order, allocations), and SHALL answer 404 for unknown, expired, or revoked tokens.

#### Scenario: Valid token
- **GIVEN** an unexpired, unrevoked token
- **WHEN** `GET /api/share/:token` is called with no cookie
- **THEN** the response is 200 and contains no `intHourlyRate`, `intRate`, `defaultMargin`, or `exchangeRate`

#### Scenario: Expired token
- **GIVEN** a token whose expiry passed
- **WHEN** it is fetched
- **THEN** the response is 404 and the `/client/<token>` page shows "This link is no longer valid"

#### Scenario: Old project-id links no longer work
- **GIVEN** a bookmark to `/client/12`
- **WHEN** it is opened
- **THEN** the page shows "This link is no longer valid" and no project data is fetched

## MODIFIED Requirements

### Requirement: Client-facing view
The system SHALL let a user present a cleaned-up, client-facing view of the plan's pricing at `/client/<token>`, loaded from the public share-link payload so that internal cost, margin, and exchange rate never leave the server. (was spec-resource-planner CAP-8)

#### Scenario: Internal figures are never exposed
- **GIVEN** a valid share link
- **WHEN** the client view renders it
- **THEN** it shows client roles, names, client rates, allocations, efforts, and price, and the network response it was built from contains no internal cost, margin, or exchange rate

#### Scenario: Invalid link
- **GIVEN** an unknown, expired, or revoked token
- **WHEN** `/client/<token>` is opened
- **THEN** the page shows "This link is no longer valid" and nothing else about the project

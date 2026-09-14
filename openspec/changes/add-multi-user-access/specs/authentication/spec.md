## Purpose

Signs company users in through Microsoft Entra ID, keeps a server-side session, and assigns each signed-in person one application group (ADMIN, MANAGER, or USER) that every other capability enforces.

## ADDED Requirements

### Requirement: Entra ID sign-in
The system SHALL authenticate users only through OpenID Connect against a single Microsoft Entra ID tenant using the authorization-code flow with PKCE and a client secret, exchanged server-side at `/auth/callback`.

#### Scenario: Sign-in round trip
- **GIVEN** a browser with no session visiting `/auth/login`
- **WHEN** the user completes Entra sign-in and is redirected to `/auth/callback` with a valid code and state
- **THEN** a session is created, the session cookie is set, and the browser is redirected to the page it started from (or `/`)

#### Scenario: Tampered callback is rejected
- **GIVEN** a callback whose `state` does not match the one issued for this browser
- **WHEN** `/auth/callback` is called
- **THEN** no session is created and the response is 400

#### Scenario: First sign-in creates the user
- **GIVEN** an Entra account in an allowed group that has never signed in
- **WHEN** sign-in completes
- **THEN** a user record is created with the account's object id, email, display name, and group, and `lastLoginAt` is set; there is no administrative "create user" action

### Requirement: Server-side sessions
The system SHALL keep sessions in the database, referenced by an httpOnly `SameSite=Lax` cookie holding an unguessable id, expiring 12 hours after last activity and 30 days after sign-in whichever is sooner, with the activity timestamp written at most once per 5 minutes.

#### Scenario: Idle session expires
- **GIVEN** a session last seen 12 hours and 1 minute ago
- **WHEN** any `/api` request arrives with its cookie
- **THEN** the response is 401 and the session row is unusable

#### Scenario: Absolute lifetime
- **GIVEN** a session created 30 days ago that was active 1 minute ago
- **WHEN** a request arrives
- **THEN** the response is 401

#### Scenario: Activity is throttled
- **GIVEN** a session touched 2 minutes ago
- **WHEN** ten requests arrive in a row
- **THEN** the session's activity timestamp is not rewritten by any of them

#### Scenario: Secure cookie behind HTTPS
- **GIVEN** `COOKIE_SECURE=true` (the production default)
- **WHEN** a session cookie is issued
- **THEN** it carries the `Secure` attribute in addition to `HttpOnly` and `SameSite=Lax`

### Requirement: Group resolution
The system SHALL derive the user's group on every sign-in from the ID token `groups` claim mapped through `ENTRA_GROUP_ADMIN`, `ENTRA_GROUP_MANAGER`, and `ENTRA_GROUP_USER`, with precedence ADMIN over MANAGER over USER, and SHALL store the result on the user record.

#### Scenario: Highest group wins
- **GIVEN** an account whose `groups` claim contains both the manager and the user group ids
- **WHEN** it signs in
- **THEN** its group is MANAGER

#### Scenario: Group changes are applied on next sign-in
- **GIVEN** a stored user with group USER whose Entra membership now includes the admin group
- **WHEN** they sign in again
- **THEN** the stored group becomes ADMIN

#### Scenario: No matching group means no access
- **GIVEN** an account in none of the three configured groups and not in `ADMIN_EMAILS`
- **WHEN** it signs in
- **THEN** no user record or session is created and the browser lands on a "no access" page

### Requirement: Bootstrap administrators
The system SHALL treat any signed-in account whose email is listed in the comma-separated `ADMIN_EMAILS` variable as ADMIN regardless of the `groups` claim.

#### Scenario: Bootstrap admin with no groups claim
- **GIVEN** `ADMIN_EMAILS=lead@example.com` and an ID token with no `groups` claim for that email
- **WHEN** the account signs in
- **THEN** its group is ADMIN and a session is created

### Requirement: Current user and unauthenticated handling
The system SHALL expose `GET /api/me` returning `{id, email, displayName, group}` for the session owner, SHALL answer 401 on every other `/api` route without a valid session except `GET /api/health` and `GET /api/share/:token`, and the SPA SHALL redirect a 401 to `/auth/login`.

#### Scenario: No cookie
- **GIVEN** no session cookie
- **WHEN** `GET /api/projects` is called
- **THEN** the response is 401 with a JSON error body

#### Scenario: Public routes stay public
- **GIVEN** no session cookie
- **WHEN** `GET /api/health` is called
- **THEN** the response is 200

#### Scenario: SPA redirects on 401
- **GIVEN** the app is open and the session has expired
- **WHEN** any API call returns 401
- **THEN** the browser navigates to `/auth/login` carrying the current URL as the return target

### Requirement: Logout
The system SHALL let a signed-in user end the session, which deletes the session row, clears the cookie, and redirects to the Entra end-session endpoint (or back to `/auth/login` in dev mode).

#### Scenario: Sign out
- **GIVEN** a signed-in user
- **WHEN** they submit the Sign out action
- **THEN** the session row is gone, a later request with the old cookie gets 401, and the browser is redirected to Entra sign-out

### Requirement: Development auth mode
The system SHALL support `AUTH_MODE=dev`, where `/auth/login` shows a "Sign in as..." page with four fixture users (admin, manager, user, user2) that create ordinary sessions, and SHALL refuse to start in dev mode when `NODE_ENV` is `production`.

#### Scenario: Fixture sign-in
- **GIVEN** `AUTH_MODE=dev`
- **WHEN** the fixture "manager" is chosen
- **THEN** a user with group MANAGER exists, a session cookie is set, and all authentication and authorization checks behave exactly as in Entra mode

#### Scenario: Dev mode refused in production
- **GIVEN** `AUTH_MODE=dev` and `NODE_ENV=production`
- **WHEN** the server starts
- **THEN** it exits with an error naming both variables before listening

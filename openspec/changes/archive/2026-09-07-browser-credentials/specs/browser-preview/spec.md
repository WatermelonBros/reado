## MODIFIED Requirements

### Requirement: In-App Preview Pane

Reado SHALL provide an in-app browser preview that renders a user-supplied URL
(typically a local dev server) inside the desktop app, opened on an explicit user
action. The preview SHALL offer navigation controls: a URL field, reload, and
back/forward.

The URL field SHALL resolve what the user types into a destination: an entry that
already carries a scheme is used as typed; a host-shaped entry is given a scheme —
`http` where it denotes a local development server (a loopback host, a development
TLD, or an explicit port), `https` otherwise; an entry that is not an address SHALL
be searched for on the web. The pane SHALL be able to load a plain-`http://` origin
that is not loopback, so a dev server reached by name through the machine's hosts
file or a LAN address renders.

#### Scenario: Open the preview at a dev URL

- **WHEN** the user opens the preview and enters a URL (e.g. a local dev server)
- **THEN** the pane loads that URL and renders it live inside Reado

#### Scenario: Navigation controls

- **WHEN** the preview is showing a page
- **THEN** the user can reload it, navigate back/forward, and change the URL

#### Scenario: Explicit open, no surprise navigation

- **WHEN** the user has not opened a preview
- **THEN** no preview surface is shown and no URL is loaded until the user opens it

#### Scenario: A bare public host

- **WHEN** the user types a host with no scheme, such as `example.com`
- **THEN** the pane loads `https://example.com`

#### Scenario: A bare host that names a dev server

- **WHEN** the user types a host that carries an explicit port, a development TLD,
  or a loopback name — such as `local.dev.example:3000` or `localhost:5173`
- **THEN** the pane loads it over `http`, as a dev server serves it

#### Scenario: A dev server behind a hosts-file alias

- **WHEN** the user opens a plain-`http://` host that the machine's hosts file
  points at the local machine
- **THEN** the page loads, rather than being refused by the platform's transport
  security

#### Scenario: What was typed is not an address

- **WHEN** the user types something that is not a host or URL
- **THEN** the pane searches the web for it, rather than failing with no result

## ADDED Requirements

### Requirement: Agent Navigation Allowlist

Agent-driven navigation of the pane SHALL be confined to the local machine plus
origins the user has allowed. Every spelling of loopback SHALL be recognised —
`localhost` and any `*.localhost` name, `127.0.0.0/8`, `::1`, and `0.0.0.0` — and
the user navigating the pane to an origin SHALL grant the agent that origin, so a
local server reached under its own hostname is not permanently refused. Navigation
the user performs SHALL NOT be restricted.

#### Scenario: Loopback under any spelling

- **WHEN** the agent navigates to `http://api.localhost:3000`, `http://[::1]:5173`
  or `http://127.0.0.2:8080`
- **THEN** the navigation is allowed

#### Scenario: A local server behind a host alias

- **WHEN** the user has opened `http://local.app.example:3000` in the pane and the
  agent then navigates within that origin
- **THEN** the navigation is allowed, because the user's own navigation granted it

#### Scenario: An origin the user never visited

- **WHEN** the agent navigates to an origin that is neither loopback nor allowed
- **THEN** the navigation is refused and reported as not allowed

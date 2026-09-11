# browser-preview Specification

## Purpose
TBD - created by archiving change in-app-browser. Update Purpose after archive.
## Requirements
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

### Requirement: Preview Isolation

The preview SHALL render in a browsing surface isolated from Reado's own UI (its
own webview), so a previewed page cannot read or affect Reado's application state.

#### Scenario: Previewed page is sandboxed from the app

- **WHEN** a page is loaded in the preview
- **THEN** it renders in a webview separate from Reado's own document and cannot
  reach Reado's application state

### Requirement: Preview Placement and Detach

The preview SHALL open as a pane to the right of the code, occupying roughly half
the window width. The user SHALL be able to **detach** the preview into a separate
window (e.g. onto a second monitor) and **re-dock** it. Detaching SHALL move the
same preview surface rather than create a second independent browser; control and
loaded page SHALL survive the move.

#### Scenario: Open docked to the right

- **WHEN** the user opens the preview
- **THEN** it appears as a right-hand split alongside the code, about half the
  window width

#### Scenario: Detach to a separate window and re-dock

- **WHEN** the user detaches the preview
- **THEN** the same preview (its loaded page and state) moves into its own window,
  and re-docking returns it to the right-hand split without reloading from scratch

### Requirement: Custom Preview Inspector (Console + Network)

Reado SHALL provide a custom-built inspector for the preview, opened from a control
on the preview, with a **Console** panel and a **Network** panel. The inspector
SHALL be built entirely on Reado's own UI tokens and components (**not** the
webview's native devtools) so it matches the rest of the app.

The Console panel SHALL cover the essentials of Chrome's console: leveled entries
(log / info / warn / error / debug) with timestamp and source location; capture of
**uncaught errors and unhandled promise rejections** (not only explicit
`console.*`); expandable inspection of objects/arrays; filtering by level; text
search; clear; and an **evaluate** input that runs an expression in the previewed
page and shows the result.

The Network panel SHALL list requests with method, URL, status, type, size, and
timing, and SHALL show per-request detail (request/response headers, query/payload,
and response body where available), with failures visibly flagged.

#### Scenario: Open the inspector

- **WHEN** the user activates the inspector control on the preview
- **THEN** a custom Console + Network inspector opens, styled on Reado's UI

#### Scenario: Console shows an uncaught error and evaluates

- **WHEN** the previewed page throws an uncaught error (or logs via `console.*`)
- **THEN** the Console lists it with level, message, source, and stack; and the
  user can run an expression in the evaluate input and see its result

#### Scenario: Network lists a request with detail

- **WHEN** the previewed page makes a request
- **THEN** the Network panel lists it with method/URL/status/size/timing and shows
  its detail on selection, flagging failures

### Requirement: Send a Preview Error to the Agent

From the inspector, the user SHALL be able to send a captured console error (or a
failed request) to the terminal agent in **one action**, delivering the message,
level, source, and stack as context — so a failure seen in the preview can be
handed to the agent without copy-paste.

#### Scenario: One-click send to agent

- **WHEN** the user chooses "send to agent" on a console error or failed request
- **THEN** the agent receives that error's message, level, source, and stack as
  context

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


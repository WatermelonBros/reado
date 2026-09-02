## ADDED Requirements

### Requirement: In-App Preview Pane

Reado SHALL provide an in-app browser preview that renders a user-supplied URL
(typically a local dev server) inside the desktop app, opened on an explicit user
action. The preview SHALL offer navigation controls: a URL field, reload, and
back/forward.

#### Scenario: Open the preview at a dev URL

- **WHEN** the user opens the preview and enters a URL (e.g. a local dev server)
- **THEN** the pane loads that URL and renders it live inside Reado

#### Scenario: Navigation controls

- **WHEN** the preview is showing a page
- **THEN** the user can reload it, navigate back/forward, and change the URL

#### Scenario: Explicit open, no surprise navigation

- **WHEN** the user has not opened a preview
- **THEN** no preview surface is shown and no URL is loaded until the user opens it

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

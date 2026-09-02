## ADDED Requirements

### Requirement: Browser Control Tool Group

The `reado mcp` server SHALL expose an **opt-in** browser-control tool group that
operates on Reado's in-app preview pane. The tools SHALL be **off by default** and
enabled by the same explicit mechanism as the rest of the MCP server. The tool
group SHALL be **desktop-bound**: it acts only on a preview pane in a running
Reado desktop instance, reached over the app's local (loopback) control channel.

#### Scenario: Tools appear only when enabled

- **WHEN** the browser-control group has not been enabled
- **THEN** `tools/list` does not advertise the browser tools

#### Scenario: Honest unavailability with no pane

- **WHEN** a browser tool is called but no Reado desktop preview pane is running
- **THEN** the call returns a clear "no preview pane running" error, and does not
  hang or report a fabricated success

### Requirement: Preview Perception

The browser-control group SHALL let the agent perceive the current state of the
preview: capture a **frame** (image) of the rendered page, read the **DOM** and
**computed styles** and **accessibility tree** for queried elements, drain the
page's **console** output, and **inspect and scrub animations** (read an
animation's keyframes and computed timing, and capture frames at stepped times).
A frame SHALL also be auto-captured after each drive action.

#### Scenario: Capture a frame on demand

- **WHEN** the agent requests a frame of the preview
- **THEN** it receives an image of the currently rendered page

#### Scenario: Read structured state

- **WHEN** the agent queries the DOM, computed styles, accessibility tree, or
  console for the previewed page
- **THEN** it receives that data as read at the time of the request

#### Scenario: Inspect and scrub an animation

- **WHEN** the agent inspects an animated element and scrubs it to stepped times
- **THEN** it receives the animation's keyframes and computed timing, and a
  frame-accurate capture at each requested time

#### Scenario: Frame follows an action

- **WHEN** the agent performs a drive action
- **THEN** a frame of the resulting page state is returned with it, without a
  separate capture request

### Requirement: Preview Drive

The browser-control group SHALL let the agent drive the preview: **navigate** to
an allowed URL, and **click**, **scroll**, **hover**, and **type**. Input SHALL be
performed as **in-webview event synthesis only** — the agent SHALL NOT receive
OS-level mouse or keyboard control.

#### Scenario: Navigate and interact

- **WHEN** the agent navigates to an allowed URL and issues click/scroll/hover/type
- **THEN** the preview performs each action against the loaded page

#### Scenario: No OS-level input

- **WHEN** the agent drives the preview
- **THEN** all input is synthesized within the previewed page's webview, never as
  operating-system input events

### Requirement: Agent Navigation Confinement

Agent-initiated navigation SHALL be confined to an **origin allowlist**:
`localhost`/`127.0.0.1` on any port is always allowed, plus origins the user has
explicitly added to the project allowlist. A navigation request outside the
allowlist SHALL be refused, not followed.

#### Scenario: Allowed origin

- **WHEN** the agent navigates to `localhost` or a user-allowlisted origin
- **THEN** the preview loads it

#### Scenario: Disallowed origin refused

- **WHEN** the agent requests navigation to an origin not on the allowlist
- **THEN** the request is refused and the preview does not navigate to it

### Requirement: Console and Network Available to the Agent

The browser-control group SHALL expose the preview's captured **console entries**
— including uncaught errors and unhandled rejections, each with level, message,
source, and stack — and its **network activity** (requests with method, URL,
status, and timing; failures flagged) as read-only data the agent can pull.
Console **errors** and network **failures** SHALL be queryable on their own, so
the agent can fetch just what broke, and a "send to agent" action from the
inspector SHALL deliver a specific error into the agent's context.

#### Scenario: Agent reads console errors

- **WHEN** the agent requests the preview's console errors
- **THEN** it receives each captured error with level, message, source, and stack
  (including uncaught errors and unhandled rejections)

#### Scenario: Agent reads network failures

- **WHEN** the agent requests the preview's network activity or its failures
- **THEN** it receives the requests (method, URL, status, timing) with failures
  distinguished

#### Scenario: Error pushed from the inspector

- **WHEN** the user sends a preview error to the agent from the inspector
- **THEN** that error's message, level, source, and stack arrive in the agent's
  context

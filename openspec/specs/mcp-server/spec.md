# mcp-server Specification

## Purpose
TBD - created by archiving change mcp-server. Update Purpose after archive.
## Requirements
### Requirement: Local MCP Server

Reado SHALL provide a local Model Context Protocol (MCP) server, implemented in a
Rust module (`src-tauri/src/mcp.rs`) and launched by Reado, that the terminal AI
agent (Claude Code / Codex) can connect to over a local transport to read the
current project's annotation context.

#### Scenario: Agent connects and lists capabilities

- **WHEN** an MCP client connects to the running Reado MCP server
- **THEN** the server advertises its name (`reado`) and the available read-only
  resources/tools

#### Scenario: Server bound to the open project

- **WHEN** the server is running for an open project
- **THEN** every resource it serves is scoped to that project's context (its
  comments, reading progress, outline, and project root)

### Requirement: Read-Only Annotation Resources

The MCP server SHALL expose, as read-only resources/tools, the project's open
comments (each with its anchor — file path and line range — and its status),
the reading progress (per-file and per-folder read/unread state), the
file/symbol outline for an in-project file, and the current project context
(root, name, active branch). The server SHALL NOT expose any mutating operation.

#### Scenario: Read open comments

- **WHEN** the client requests the open-comments resource
- **THEN** it receives each open comment with its body, status, and anchor
  (file path + line range)

#### Scenario: Read reading progress and outline

- **WHEN** the client requests reading progress or the outline of an in-project file
- **THEN** it receives the per-file/per-folder read state, or the document
  symbols for that file, respectively

#### Scenario: No write operations

- **WHEN** the client inspects the server's tools/resources
- **THEN** no operation that creates, edits, resolves, or deletes Reado state is
  offered

### Requirement: Path-Confined, Secret-Free Access

The MCP server SHALL resolve every requested path through the same project-root
confinement used elsewhere in Reado, and SHALL refuse to read anything outside
the open project's root and SHALL NOT expose secrets, tokens, environment, or
configuration outside the project.

#### Scenario: Request escapes the project root

- **WHEN** the client requests a path outside the open project's root (including
  via traversal such as `../`)
- **THEN** the server rejects or ignores the request and returns no content for
  that path

#### Scenario: No secret exposure

- **WHEN** the client enumerates available resources
- **THEN** no credentials, tokens, environment variables, or files outside the
  project are reachable

### Requirement: Opt-In Enablement and Discoverability

The MCP server SHALL be disabled by default and SHALL run only after the user
explicitly enables it; enabling and disabling are explicit triggers, never
silent. When enabled, Reado SHALL advertise how the agent can connect by writing
a project-local connect config and surfacing the connection command, and SHALL
honestly reflect the server's state (off / starting / running).

#### Scenario: Off by default until enabled

- **WHEN** a project is opened
- **THEN** the MCP server is not running until the user explicitly enables it

#### Scenario: Enable advertises the connection

- **WHEN** the user enables the MCP server
- **THEN** Reado starts it, writes/updates a project-local connect config (e.g.
  `.reado/mcp.json`), and surfaces the connect command so Claude Code / Codex can
  attach

#### Scenario: Disable stops the server

- **WHEN** the user disables the MCP server
- **THEN** the server stops and its running state is reflected as off

### Requirement: Dual-Era Protocol Support

The MCP server SHALL serve both protocol eras from the same stdio process: the
handshake-based ("legacy") era of revision `2024-11-05`, and the stateless
("modern") era of revision `2026-07-28`. It SHALL select the era from how the
client opens the exchange, and SHALL NOT require the client to declare its era
out of band.

#### Scenario: Legacy client opens with initialize

- **WHEN** a client sends `initialize`
- **THEN** the server answers with `protocolVersion`, `capabilities`,
  `serverInfo` and `instructions` exactly as it does today, and serves the rest
  of the session under legacy semantics

#### Scenario: Modern client sends a request with per-request metadata

- **WHEN** a client sends any request carrying
  `_meta['io.modelcontextprotocol/protocolVersion']` set to a supported version
- **THEN** the server serves it statelessly, with no prior handshake required

#### Scenario: Unsupported protocol version requested

- **WHEN** a request declares a protocol version the server does not implement
- **THEN** the server responds with `UnsupportedProtocolVersionError` (code
  `-32022`) whose `data` lists the versions it does support and the version
  requested

### Requirement: Server Discovery

The MCP server SHALL implement the `server/discover` RPC, which the modern era
makes mandatory and which dual-era clients use as the stdio era probe.

#### Scenario: Client probes with server/discover

- **WHEN** a client sends `server/discover`
- **THEN** the server returns `supportedVersions`, its `capabilities`, the
  `instructions` block that orients the agent to Reado's workflow, and its
  identity under `_meta['io.modelcontextprotocol/serverInfo']`

### Requirement: Result Typing and Cache Hints

Results served under the modern era SHALL carry the fields that revision
requires, so that a conforming client neither rejects them nor re-polls
needlessly.

#### Scenario: Ordinary result

- **WHEN** the server returns any result to a modern request
- **THEN** the result carries `resultType: "complete"`

#### Scenario: Cacheable list or read result

- **WHEN** the server answers `tools/list`, `resources/list` or `resources/read`
  under the modern era
- **THEN** the result carries `ttlMs` and `cacheScope`

#### Scenario: Legacy results are unchanged

- **WHEN** the server answers a legacy client
- **THEN** results are shaped exactly as before, since clients are required to
  treat a missing `resultType` from an earlier-revision server as `"complete"`

### Requirement: Deterministic Tool Ordering

The server SHALL return tools from `tools/list` in a deterministic order, so
clients can cache the list and LLM prompt caches keep hitting.

#### Scenario: Repeated tool listings

- **WHEN** `tools/list` is called more than once against the same server version
- **THEN** the tools come back in the same order every time

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


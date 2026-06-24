## ADDED Requirements

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

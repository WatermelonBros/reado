## Why

Reado's loop is "you annotate → the agent implements". Today that handoff is a
one-shot push: "Send Review" pastes open comments into a terminal agent as a
prompt. The agent gets a frozen snapshot, can't ask follow-ups, and never sees
the richer context Reado already holds — comment anchors and status, reading
progress, the file/symbol outline, the current project.

Exposing that context as a local **Model Context Protocol (MCP)** server makes
the terminal agent (Claude Code / Codex) a first-class reader of the annotation
layer instead of a recipient of pasted text. The agent connects locally, pulls
open comments with their anchors and status, sees what's read vs. unread, and
navigates the outline — structured, queryable, always-current. This is the
durable bridge under the "comment is the unit" thesis, and the foundation for
later monetization (a hosted/remote server). It stays read-first and honest:
read-only, project-root-confined, no secrets, and explicitly opt-in.

## What Changes

- New Rust module `src-tauri/src/mcp.rs`: a local MCP server (stdio transport)
  exposing **read-only** resources/tools sourced from Reado's existing state —
  open comments (with anchors + status), reading progress (per-file/per-folder),
  file/symbol outline, and the current project context.
- Path confinement: every resource resolves paths through the same project-root
  confinement the rest of the app uses; nothing outside the open project's root
  is readable, and no secrets/config/tokens are exposed.
- Opt-in enablement: the server is **off by default**. The user explicitly
  enables it (Command Center action + a setting persisted under the project's
  `.reado/`); enabling/disabling is an explicit trigger, never silent.
- Discoverability/config: when enabled, Reado advertises how to connect — it
  writes/updates a project-local MCP config snippet (e.g. `.reado/mcp.json`) and
  surfaces the connection command so Claude Code / Codex can attach.
- Frontend wiring (`src/lib/mcp.ts`): start/stop the server via Tauri commands,
  reflect enabled/running state, and copy the connect config. i18n EN + IT.

## Capabilities

### Added Capabilities
- `mcp-server`: a local, opt-in, read-only MCP server exposing Reado's comments,
  reading progress, outline, and project context to the terminal AI agent.

## Out of Scope

- Remote / hosted MCP server, auth, and any monetization plumbing (future work).
- Write/mutating tools (creating or resolving comments via MCP) — read-only now.
- Replacing "Send Review"; the existing terminal-injection loop stays.
- Bundling or auto-installing the agent CLIs themselves.

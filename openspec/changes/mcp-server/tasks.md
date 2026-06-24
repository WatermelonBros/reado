## 1. Rust MCP server module

- [ ] 1.1 New module `src-tauri/src/mcp.rs` implementing a local MCP server over stdio (server metadata: name `reado`, version, capabilities = resources + read-only tools).
- [ ] 1.2 Resource: open comments — id, body, status, and anchor (file path + line range) for each open comment, sourced from the project's `.reado/` comment store.
- [ ] 1.3 Resource: reading progress — per-file and per-folder read/unread state for the current project.
- [ ] 1.4 Resource: file/symbol outline — document symbols for a requested in-project file (reusing the existing LSP/index outline path).
- [ ] 1.5 Resource: project context — current project root, name, and active branch.
- [ ] 1.6 Path confinement: resolve every requested path through the shared project-root confinement helper; reject/ignore anything outside the root; never expose secrets, tokens, env, or files outside the project.

## 2. Lifecycle, enablement & discoverability

- [ ] 2.1 Tauri commands to start/stop the server and report enabled/running state.
- [ ] 2.2 Opt-in: server off by default; persist the enabled flag under the project's `.reado/`; enabling and disabling are explicit user triggers.
- [ ] 2.3 On enable, write/update a project-local connect config (e.g. `.reado/mcp.json`) and expose the connect command/snippet for Claude Code / Codex.

## 3. Frontend wiring

- [ ] 3.1 `src/lib/mcp.ts` wrapping the Tauri commands (start/stop, status, copy connect config).
- [ ] 3.2 Command Center / settings affordance to enable/disable the MCP server and copy the connect config; honest status surface (off / starting / running).
- [ ] 3.3 i18n (EN + IT) for all new copy.

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green.
- [ ] 4.2 With the server enabled, a connecting MCP client can list the resources and read open comments, reading progress, outline, and project context — and cannot read anything outside the project root.

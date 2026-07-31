> Design note: implemented as a **`reado mcp` subcommand of the CLI**
> (`crates/reado-cli/src/mcp.rs`), not a module inside the desktop app. The agent
> launches `reado mcp` as its MCP server (stdio), which is exactly how MCP servers
> are run — and it reuses the CLI's `reado-core` access. The desktop side only
> writes the opt-in config.

## 1. Local MCP server (stdio)

- [x] 1.1 `reado mcp`: a newline-delimited JSON-RPC 2.0 server over stdin/stdout
      handling `initialize`, `ping`, `tools/list`, `resources/list`,
      `resources/read`; notifications (no id) get no reply; unknown methods return
      JSON-RPC -32601. Smoke-tested.

## 2. Read-only annotation resources

- [x] 2.1 Resources: `reado://tasks` (open tasks), `reado://comments` (all active),
      `reado://reading-progress` (`.reado/read.json`), `reado://bookmarks`
      (`.reado/bookmarks.json`) — all JSON, read-only.

## 3. Path-confined, secret-free

- [x] 3.1 Confined to the project root (resolved by the CLI's root walk); only
      reads `.reado/` + `reado-core` comments. No write tools, no secrets, no
      arbitrary file reads.

## 4. Opt-in enablement & discoverability

- [x] 4.1 `enableMcp` (palette: "Enable Reado MCP for the agent") writes/merges a
      project `.mcp.json` with `{ reado: { command: "reado", args: ["mcp"] } }` so
      Claude Code discovers it; never enabled silently; won't clobber invalid JSON.

## 5. Verify

- [x] 5.1 CLI builds; MCP handshake + resources verified via piped requests.
- [x] 5.2 EN + IT (`mcp.*`); frontend typecheck + build green.

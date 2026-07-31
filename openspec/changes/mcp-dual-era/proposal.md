## Why

`reado mcp` declares protocol version `2024-11-05` — the first MCP revision. The
current revision, **`2026-07-28`** (published 2026-07-28), removes the thing our
server is built around: the `initialize` handshake. MCP is now stateless — every
request carries its protocol version and client capabilities in `_meta`
(`io.modelcontextprotocol/protocolVersion`), and servers **MUST** implement a new
`server/discover` RPC.

Nothing is broken today: every agent we target still opens with `initialize`
(verified — Claude Code 2.1.220 knows no `server/discover` and no `2026-07-28`).
The spec's own compatibility matrix says legacy client + legacy server works, and
a **dual-era** server works with both. The failure case is one-sided and future:
a *modern-only* client talking to our legacy-only server fails outright, and
legacy clients have no fall-forward mechanism, so we can never flip to
modern-only either. Dual-era is the only end state that keeps all five agents we
wire up (`src/lib/mcp.ts`) working.

The lucky part: the revision's headline change is making MCP stateless, and our
stdio read-only server already is. We have no sessions, no HTTP, no
server-initiated requests, and no subscriptions to unwind. The work is the
handshake, not the architecture.

## What Changes

- `crates/reado-cli/src/mcp.rs` becomes **dual-era**: it keeps answering
  `initialize` for legacy clients and additionally serves modern requests
  statelessly, selecting behaviour from how the client opens (a request carrying
  modern `_meta` → modern; `initialize` → legacy). The spec permits both eras
  concurrently in the same process.
- New `server/discover` RPC returning `supportedVersions`, `capabilities`,
  `instructions` (our existing `INSTRUCTIONS` block keeps its home here),
  `_meta['io.modelcontextprotocol/serverInfo']`, and cache hints.
- Results gain `resultType: "complete"`; list/read results gain the
  `CacheableResult` fields `ttlMs` and `cacheScope`.
- Unsupported requested versions answer with `UnsupportedProtocolVersionError`
  (`-32022`) listing what we do support, instead of a generic error.
- The existing handlers (`tools/list`, `tools/call`, `resources/list`,
  `resources/read`) are unchanged in behaviour — they are already stateless and
  project-root confined.

## Capabilities

### Modified Capabilities
- `mcp-server`: serves both the handshake-based (`2024-11-05`) and the stateless
  (`2026-07-28`) protocol eras from the same stdio process.

## Out of Scope

- Streamable HTTP, `Mcp-Session-Id`, SSE resumability — we are stdio-only.
- `subscriptions/listen`, tasks extension, MRTR / sampling / roots / elicitation,
  OAuth & Dynamic Client Registration: unused by a read-only local server.
- Dropping legacy support. `initialize` stays until the agents we target stop
  sending it; going modern-only would break every client shipping today.
- Removing `ping`: gone from the modern era but still valid for legacy clients,
  so it stays as-is.

## Reference

Facts this change is built on, recorded so implementing it needs no re-research:

- Current revision & negotiation: <https://modelcontextprotocol.io/specification/versioning>
- Key changes vs `2025-11-25`: <https://modelcontextprotocol.io/specification/2026-07-28/changelog>
- Era detection, fallback rules, compatibility matrix:
  <https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning>
- `server/discover` request/response shape:
  <https://modelcontextprotocol.io/specification/2026-07-28/server/discover>

stdio era probe (the rule that keeps us working): a dual-era client sends
`server/discover` first; a *recognized modern* JSON-RPC error means "modern
server, retry with a supported version", **anything else** — including our
current `-32601 method not found` — means "legacy server, fall back to
`initialize`". Era is cached per server process, not per request.

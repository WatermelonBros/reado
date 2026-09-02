## ADDED Requirements

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

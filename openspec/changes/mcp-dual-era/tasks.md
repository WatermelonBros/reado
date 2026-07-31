> Scope note: all of this lives in `crates/reado-cli/src/mcp.rs` (512 lines). The
> resource/tool handlers do **not** change — they are already stateless and
> project-root confined, which is exactly what the new era assumes. What changes
> is the envelope around them.

## 1. Era detection

- [x] 1.1 Read `params._meta['io.modelcontextprotocol/protocolVersion']` off each
      request; its presence selects the modern era, its absence keeps today's
      legacy behaviour. `initialize` always means legacy.
- [x] 1.2 Replace the single `PROTOCOL_VERSION` const with the supported set
      (`["2026-07-28", "2024-11-05"]`); `initialize` keeps answering
      `2024-11-05`.
- [x] 1.3 A modern request naming an unsupported version returns
      `UnsupportedProtocolVersionError` (`-32022`) with
      `data: { supported, requested }`.

## 2. server/discover

- [x] 2.1 New method returning `{ resultType, supportedVersions, capabilities,
      instructions, ttlMs, cacheScope, _meta['io.modelcontextprotocol/serverInfo'] }`.
      Reuses the existing `INSTRUCTIONS` const and `serverInfo` payload.
- [x] 2.2 Keep unknown methods on `-32601`: that error is precisely what makes a
      dual-era client fall back to `initialize` against an older `reado` binary.

## 3. Modern result envelope

- [x] 3.1 Add `resultType: "complete"` to results served to modern requests.
- [x] 3.2 Add `ttlMs` + `cacheScope` to `tools/list`, `resources/list` and
      `resources/read` results (modern era only).
- [x] 3.3 Echo `_meta['io.modelcontextprotocol/serverInfo']` in modern results.
- [x] 3.4 Leave legacy results byte-identical to today's.

## 4. Verify

- [x] 4.1 Unit tests: legacy `initialize` handshake still passes unchanged
      (existing test at `mcp.rs:299` must stay green); `server/discover` returns
      the supported set; a bogus version yields `-32022`.
- [x] 4.2 Piped smoke test both ways: an `initialize`-first exchange and a
      `_meta`-carrying stateless exchange against the same process.
- [ ] 4.3 Confirm against a real dual-era client once one ships (none of the five
      agents in `src/lib/mcp.ts` speak the modern era yet).

## 5. Ship

- [x] 5.1 CHANGELOG entry under `[Unreleased]` → `Changed`.

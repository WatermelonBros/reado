# Tasks — Structured agent results

## 1. Core model (`crates/reado-core`)

- [ ] 1.1 Thread supports a resolution record: {agent, model, diffRef?, verify?:{cmd,
      passed}} serialized into the `.md` (additive, backward compatible).
- [ ] 1.2 New state `resolved-unverified` distinct from resolved/done.

## 2. CLI (`crates/reado-cli`)

- [ ] 2.1 `reado task done [--diff <ref>|--capture] [--verify "<cmd>"]`: capture the
      diff (git range or working diff), run verify, write the resolution record.
- [ ] 2.2 Populate provenance from `$READO_AGENT` + a model env/flag.

## 3. MCP tools (`crates/reado-cli/src/mcp.rs`)

- [ ] 3.1 Expose `task_done`, `task_fail`, `comment_add`, `comment_reply` as MCP
      tools (mutating), alongside the existing read-only resources.
- [ ] 3.2 Tools return structured results (id, new state, verify outcome).

## 4. Desktop wiring

- [ ] 4.1 Comment history renders the resolving diff + verify outcome + provenance.
- [ ] 4.2 Resolve-loop treats `resolved-unverified` distinctly (badge/notice).

## 5. Tests

- [ ] 5.1 Core: round-trip the resolution record through `.md`.
- [ ] 5.2 CLI: `task done --verify` records pass/fail; MCP tool returns a result.

## 6. Verify

- [ ] 6.1 `cargo fmt/clippy/test` across crates; `pnpm typecheck && pnpm test`.

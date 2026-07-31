## Why

Reado's LSP-free code navigation — the workspace symbol picker (Cmd+T,
`list_symbols`) and heuristic go-to-definition (`find_definition`) — walks the
whole project and **reads and regex-scans every file on every call**
(`symbols.rs` is explicitly marked `ponytail: scans files on each call (no
persistent index)`). On a large repo, opening the symbol picker or jumping to a
definition re-reads the entire tree each time — wasted work that scales with repo
size, and the main reason navigation feels slow without a language server.

## What Changes

- **symbol-index** (capability): an in-memory, per-file symbol index invalidated
  by file mtime.
  - Extract each file's declaration records (keyword declarations, assignments/
    fields, call-like sites — the same signals the current heuristics use) **once**
    and cache them keyed by the file's mtime.
  - On a later call, unchanged files return their cached records without being
    re-read or re-scanned; only changed/new files are re-extracted.
  - `list_symbols` and `find_definition` are rebuilt on top of this shared index,
    preserving today's behaviour and ranking exactly (keyword > assignment > call,
    the same caps).
  - The cache is bounded (evicted past a cap) and skips oversized files, so it
    can't grow without limit.
- No new command surface, no new dependency, no disk format. Persistence across
  restarts is intentionally out of scope (a documented ceiling — a later SQLite
  index if warm-start latency ever matters).

Out of scope: replacing the heuristics with a real parser/LSP; cross-restart
persistence; symbol-kind richness beyond today's keyword hint.

## Capabilities

### Added Capabilities

- **symbol-index** — an in-memory, mtime-invalidated per-file symbol index that
  backs the workspace symbol picker and heuristic go-to-definition, so unchanged
  files are never re-read or re-scanned and navigation stays fast as the repo
  grows, with identical results to the previous per-call scan.

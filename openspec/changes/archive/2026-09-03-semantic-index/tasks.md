# Tasks — Semantic index

## 1. Backend index (`src-tauri/src/index.rs` or a new module)

- [x] 1.1 SQLite table(s) for symbols/paths/KB-text with a tokenized column
      (FTS5 if available, else a tokens table); rebuildable like the comment index.
- [x] 1.2 Incremental update on `file-changed` (reuse the watcher); drop+rebuild
      fallback.
- [x] 1.3 `semantic_query(root, q)` → ranked hits (BM25/FTS ranking + symbol boost).

## 2. Frontend (`src/lib/semanticSearch.ts`, `SemanticModal.tsx`)

- [x] 2.1 Query the local index as-you-type; render instant ranked hits.
- [x] 2.2 Keep the agent path behind an explicit "ask the agent" action; cache its
      answer keyed by a content hash; show agent answers distinctly.

## 3. i18n + a11y

- [x] 3.1 Keys for local-vs-agent result labelling; keyboard nav of results.

## 4. Tests

- [x] 4.1 Backend: index build + query ranking (symbol above prose); rebuild.
- [x] 4.2 Frontend: as-you-type query wiring; agent-answer cache reuse.

## 5. Verify

- [x] 5.1 `cargo fmt/clippy/test`; `pnpm typecheck && pnpm test`; impeccable pass.

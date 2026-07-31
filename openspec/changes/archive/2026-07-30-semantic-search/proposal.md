## Why

Reado's search today is literal: ripgrep full-text (`src-tauri/src/search.rs`)
and a symbol index (Workspace Symbols / Go to Definition). Both require you to
already know the token. When you're reading an unfamiliar codebase the real
question is conceptual — "where do we handle auth?", "what computes reading
progress?" — and the words you'd grep for may not appear in the code at all.

Semantic search closes that gap: a natural-language query returns ranked code
locations by meaning, not string match. It fits read-first directly — it is a
comprehension aid for exploring code you don't yet know — and it feeds the
comment↔AI loop, since the locations it surfaces are exactly where you'd drop a
comment for the agent to resolve. Following Reado's honest-surfaces principle,
the index is built on an explicit trigger (never silent) and always reports its
freshness so a stale answer is never presented as current.

## What Changes

- **Semantic index (Rust)**: new `src-tauri/src/semantic.rs` that chunks the
  project by symbol/file (reusing the symbol index where available, falling back
  to file/window chunks), embeds each chunk, and stores vectors plus chunk
  metadata under the project's `.reado/` directory (e.g.
  `.reado/semantic.sqlite`, gitignored — mirroring the rebuildable cache pattern
  of `src-tauri/src/index.rs`). Index build/refresh is explicit, and supports an
  incremental refresh that only re-embeds chunks whose source changed (by
  content hash / mtime).
- **Query path (Rust)**: a Tauri command that embeds the natural-language query
  and returns the top-k chunks ranked by vector similarity, each with file path,
  line range, and a code snippet — shaped to be navigable like existing
  `SearchMatch` rows.
- **Search panel integration (frontend)**: extend `SearchPanel.tsx` with a
  semantic mode alongside text search, rendering ranked results with snippets
  that open the file at the location on click (reusing the existing result→editor
  navigation). Surface index state (built / building / stale / absent) and an
  explicit "Build / Refresh index" action. Add a `semantic` tool/mode entry as
  needed in `src/lib/store.ts` and an `src/lib/semantic.ts` client wrapper.
- **Freshness**: track when the index was last built and against which files;
  flag the index stale when project files changed since, and label results
  accordingly so users know whether the answer reflects current code.
- **i18n**: EN+IT copy for the semantic mode, build/refresh actions, and
  freshness/empty states (`src/i18n/locales/en.json|it.json`).

## Capabilities

### Added Capabilities
- `semantic-search`: natural-language semantic search over an embeddings index of
  the project, returning ranked, navigable code locations with snippets.

## Out of Scope

- Mandating a specific embedding backend. Local vs. provider embeddings is an
  implementation note: the index is provider-agnostic and the choice (e.g. a
  bundled local model vs. an external embeddings API) is left to implementation,
  provided the freshness and storage contract here is honoured.
- Replacing text or symbol search — semantic search is additive.
- Cross-project / global indexes; the index is per-project under `.reado/`.
- Conversational answers or RAG-style synthesis; this returns ranked locations,
  not generated prose.

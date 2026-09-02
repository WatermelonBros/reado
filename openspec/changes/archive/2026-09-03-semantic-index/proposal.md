## Why

Semantic search (`semanticSearch.ts`) is self-described as a stopgap: a natural-
language query is handed to the terminal agent, which writes ranked JSON to
`.reado/semantic.json`, polled for up to 90 seconds, with no cache, no
persistence, and no way to refine. For "where do we handle auth?" the reader
waits a minute-and-a-half for a one-shot answer that vanishes.

Reado's architecture keeps generative AI in the terminal agent (no embedded LLM
client), so this change does **not** add an embedding model. Instead it builds a
fast, persisted, incremental **local relevance index** — over symbols,
identifiers, paths, and comment/doc text — that answers most "where is …?"
queries instantly, and keeps the agent path for genuinely free-form questions.

## What Changes

- **semantic-index** (capability):
  - A persisted, incremental index (mirroring the existing `.reado/index.sqlite`
    pattern) of the project's symbols, file paths, and knowledge-base text, kept
    fresh via the file watcher.
  - Instant ranked query (BM25-style lexical + symbol/identifier boosting) that
    returns results as you type, persisted and re-queryable — no 90-second wait.
  - The terminal-agent path is kept as an explicit "ask the agent" escalation for
    true natural-language questions the local index can't satisfy; its results are
    cached and invalidated by content change.
  - Honest signalling: instant local results vs an agent pass are visibly distinct.

Out of scope: an embedded embeddings/vector model (a documented future backend —
it would change the AI-in-the-terminal architecture); cross-project search.

## Capabilities

### Added Capabilities

- **semantic-index** — a persisted, incremental local relevance index over
  symbols, paths, and knowledge-base text that returns ranked results instantly,
  replacing the 90-second agent round-trip for the common case while keeping an
  explicit agent escalation for free-form questions.

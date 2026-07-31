> Design note: Reado has no in-app embedding client (AI runs through the terminal
> agent — see the project decision). So semantic search is delivered by dispatching
> the natural-language query to the agent, which searches the repo and writes ranked
> results to `.reado/semantic.json`; Reado renders them. A local/provider embeddings
> index is a possible future backend — the proposal left the backend unmandated —
> but this delivers the user-facing capability (NL query → ranked navigable results)
> today without a heavy dependency.

## 1. Query → results (via the agent)

- [x] 1.1 `useSemanticSearch.run(query)` dispatches the agent with the NL query and
      polls `.reado/semantic.json` for ranked `{ file, line, snippet }` results.
- [x] 1.2 Robust JSON parsing (tolerates partial/malformed agent output).

## 2. Query + results UI

- [x] 2.1 Palette command "Semantic search" prompts for the query.
- [x] 2.2 `SemanticModal` lists ranked results (file:line + snippet), click to jump;
      loading / no-results states.

## 3. Backend (future)

- [~] 3.1 A persistent local embeddings index is DEFERRED as a possible future
      backend (the proposal left it unmandated); the agent performs the semantic
      step per query instead.

## 4. Verify

- [x] 4.1 EN + IT (`semantic.*`); typecheck + cargo check + build green.

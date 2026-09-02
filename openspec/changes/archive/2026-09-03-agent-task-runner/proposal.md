## Why

Reado has at least five features that dispatch a prompt to the terminal agent and
then poll a `.reado/*` file for the result: file synopsis (`synopsis.ts`), Q&A
(`qa.ts`), semantic search (`semanticSearch.ts`), pre-review (`preReview.ts`), and
AI tours (`tours.ts`). Each re-implements the same loop — a token, a fixed
`delay`, a capped poll count, then a generic `error` — with the same weaknesses:
no cancellation surfaced to the user, no retry/backoff, no progress signal, and a
slow agent or a malformed JSON write silently degrades to an empty result the user
can't distinguish from "still working".

## What Changes

- **agent-task-runner** (capability): one shared abstraction for "dispatch a
  prompt to the agent, await a file-based result".
  - A single runner with: a typed result/parse step, cancellation the UI can
    trigger, retry/backoff, a real status (`running` / `done` / `failed` /
    `cancelled` / `timed-out`) distinct from "empty", and surfacing through the
    notice surface on failure.
  - Migrate synopsis, Q&A, semantic search, pre-review, and AI tours onto it,
    deleting their hand-rolled pollers.
  - A small in-flight registry so the UI can show what's running and cancel it.

Out of scope: changing the on-disk result formats; the underlying dispatch
mechanism (still the PTY / structured channel).

## Capabilities

### Added Capabilities

- **agent-task-runner** — a shared runner for agent-dispatched, file-result tasks
  with cancellation, retry/backoff, and honest status, replacing five duplicated
  poll loops so a slow agent or a bad write is a clear state, not a silent empty.

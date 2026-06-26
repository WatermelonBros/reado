## Why

Reado runs one direction today: the human reads, leaves anchored comments, and an
agent resolves them. The reverse — discovering *what* to read and review — is still
fully manual: the human navigates the codebase, picks files, decides the order,
opens them one by one. Meanwhile a raw "let the LLM review everything" pass loses
signal at scale and produces shallow or misaligned comments; and a senior reviewer
has judgment (real risk vs tolerable drift vs intentional debt vs false positive)
that an average model lacks.

The missing model is a **third one: a guided, incremental, human-in-the-loop
review** where the LLM *orchestrates the path* — proposes a route, asks targeted
questions, fetches context, drafts comments, summarizes — while the human keeps
agency and judgment. Reado becomes the review cockpit where human judgment and LLM
investigation cooperate through a structured, incremental reading path. Not "AI
reviews, human approves," but "AI proposes a route, asks good questions, drafts
comments, and helps decide where to go next; the human validates meaning, priority
and taste."

## What Changes

- Add a **Guided Pair Review** session mode. The user starts it from a scope
  (current diff, branch vs main, a folder, selected files, open tasks/comments, or
  the whole project sampled progressively — the **GitHub PR** scope is provided by
  the `pull-request-review` adapter) and an optional objective (bug risk,
  design/API, maintainability, security, performance, test coverage,
  AI-generated-code sanity, onboarding, general senior review).
- Add a **planning pass**: the LLM reads metadata/diff/tree/symbols/deps/existing
  comments and proposes an **ordered review route** (grouping related files, with a
  one-line reason each); the user can accept, edit, or skip it.
- Add **file-by-file pair review**: the code is the hero; a "Review Guide" panel
  shows session state, the LLM's targeted questions/observations, and quick
  actions. The LLM **proposes** comments (never auto-final); the user can approve,
  edit, mark task/note, ask follow-up, jump to a related file, defer, or discard.
- Add **dynamic routing**: as signals emerge the LLM can suggest widen/narrow
  scope, deep-dive, a cross-cutting mini-review, or "enough evidence, next file";
  the user is always in control (continue / skip / deep dive / widen / narrow /
  stop / send tasks / summarize).
- Persist a **review session** in `.reado/sessions/` (scope, route, per-file
  status, created artifacts, decisions, open questions, summaries) — **resumable**.
- Add **per-file and session summaries** (what was checked/decided, comments
  created, remaining risks, dependents, recommended next) that feed the knowledge
  graph and future reviews.
- Extend the **`reado` CLI contract** with `session` and `review` subcommands so
  the agent gets structured context without scraping UI state.
- Every LLM review artifact carries a **state** (proposed / accepted / edited /
  discarded / converted_to_task / converted_to_note / resolved_as_false_positive)
  — a discarded suggestion stays useful session memory.
- **Integrate with the resolve loop** (`async-review-loop`): at any point send
  only the confirmed tasks to the agent; guided review sits *before and around*
  that loop, which queues them, tracks progress and notifies when done.

## Composition

This is the umbrella review capability. Two adapters plug into it, each owning one
concern so nothing is duplicated:

- **`pull-request-review`** — the GitHub adapter. It provides "GitHub PR" as a
  *scope/source* for a guided review (open + fetch & check out) and the *sink*
  (pull existing threads in, submit the session as a batched review with a verdict,
  sync resolution). The read-first walk, route, curation and session are owned here.
- **`async-review-loop`** — the resolve back. When the session sends confirmed
  tasks, that capability runs the agent, tracks resolution and emits the
  finished/needs-approval events (delivered to a phone by `reado-anywhere`).

## Capabilities

### Added Capabilities
- `guided-pair-review`: an LLM-guided, incremental, human-in-the-loop review session — the LLM proposes a route, asks questions, drafts comments and summaries; the human decides; results are durable Reado artifacts feeding the existing resolve loop.

## Out of Scope

- Replacing GitHub PR review, or fully automating reviewer judgment.
- Guaranteeing complete codebase coverage.
- Building Reado's own agent runtime (the agent runs via the existing CLI/terminal).
- Requiring cloud services.
- Pre-apply patch gating, or team collaboration/presence.
- Becoming an "LLM review bot inside Reado" — the human keeps agency and taste.

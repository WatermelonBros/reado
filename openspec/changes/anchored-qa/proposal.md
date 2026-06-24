## Why

Reado is read-first: the goal is durable understanding, not just momentary
answers. "Explain selection" already lets the user get a one-off explanation in
the agent terminal, but the insight evaporates the moment the terminal scrolls.
The most valuable reading moments are questions — "why is this guarded?", "what
calls this?", "is this safe to remove?" — and their answers deserve to *stick*
to the code, exactly like a comment sticks to the code.

Anchored Q&A treats a question-and-answer as the same durable, anchored unit as
a comment ("the comment is the unit"), but for understanding rather than for the
agent to act on: the user selects code, asks a natural-language question, the AI
answers using that code as context, and the Q&A is persisted anchored to the
selection in `.reado/`. It survives, it can be revisited, and it joins the
overlay and knowledge base — building durable understanding instead of a
disposable chat. This is distinct from "Explain selection" (one-off, terminal,
not a question) and from comments (a task the agent resolves and commits).

## What Changes

- A new **Ask about selection** action (explicit trigger): selection context
  affordance + command + command palette + Edit/Selection menu. The user types a
  natural-language question about the current selection.
- The selected code (with file/line context) and the question are sent to the AI
  as context; the AI answers grounded in that code. Reuses the existing
  terminal-injection + `reado` CLI contract (`src/lib/agents.ts`,
  `src/lib/review.ts`); no new agent plumbing.
- The Q&A is persisted as a durable **`qa` note** anchored to the selection,
  stored as a single `.md` file under `.reado/` with YAML front-matter (kind
  `qa`, the question, the answer, anchor file/range, context snapshot,
  timestamps), reusing the comment file schema and anchoring/orphan model.
- Anchored Q&A notes are listed and revisited in a side-panel surface (filter
  within the Comments tool) and rendered in the gutter/overlay on the file they
  anchor to; opening one shows the question and the saved answer.

## Capabilities

### Added Capabilities
- `anchored-qa`: ask the AI a question about a selection and save the answer as a
  durable note anchored to that code, revisitable from the overlay and a list.

## Out of Scope

- Re-running or "refreshing" a saved answer against changed code (a saved Q&A is
  a snapshot; revisiting is read-only here).
- Threaded follow-up conversations on a Q&A note (single question, single
  answer).
- Changing the one-off "Explain selection" behaviour or the comment→agent task
  loop.
- New storage backends; Q&A notes reuse the existing `.reado/` markdown layout
  and SQLite index.

## Why

Reado's AI loop today resolves *tasks* (comments → agent fixes). But while
reading, the most common need is the opposite: "what does this do?". Letting the
user select code and ask the agent to explain it — right where they're reading —
is the natural read-first complement to the review loop, and a real
differentiator.

## What Changes

- An **Explain selection** action (selection context affordance + command +
  palette): sends the selected code (with its file/line context) to the focused
  agent in the terminal, asking for a concise explanation.
- The explanation comes back in the agent terminal by default. Optionally, the
  user can have it recorded as a **note** comment anchored to the selection (via
  the `reado` CLI), so it joins the durable overlay and the knowledge base —
  consistent with how findings already work.
- Reuses the existing terminal-injection + `reado` CLI contract; no new agent
  plumbing.

## Capabilities

### Modified Capabilities
- `ai-review-loop`: adds an "Explain selection" action that asks the focused
  agent to explain selected code, optionally captured as an anchored note.

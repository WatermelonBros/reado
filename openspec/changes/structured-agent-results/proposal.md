## Why

Reado's core loop — read → annotate → AI-resolve — has no structured return
channel. The resolve loop **infers** completion purely from comment-state deltas
seen through the file watcher (`resolveLoop.ts`): if the agent edits code but
forgets or fails to run `reado task done`, the loop never finishes and just goes
idle. There is no captured diff, no evidence the code actually changed, no test
result, and the "needs approval" signal is a 90-second wall-clock heuristic that
can't tell "waiting for the human" from "thinking hard" from "crashed". The
whole dispatch is a timing-fragile paste into a shared PTY, which also forces
prompts to a single line and invites the prompt-injection defence in `agents.ts`.

This is the product's differentiator; it should be trustworthy, not inferred.

## What Changes

- **structured-agent-results** (capability):
  - **Capture the resolving change**: `reado task done` optionally records the
    diff (or commit range) that resolved the task and attaches it to the thread,
    so a resolved task shows *what* changed, not just that it closed.
  - **Optional verification gate**: `reado task done --verify "<cmd>"` runs the
    command, records pass/fail on the thread, and marks the task resolved-but-
    unverified when it fails — surfaced distinctly in the UI.
  - **MCP tools, not just resources**: expose the CLI verbs (`task done`,
    `task fail`, `comment add`, `comment reply`) as MCP **tools** so a capable
    agent (Claude Code, Codex) resolves through a structured channel and Reado
    receives a real result object, instead of screen-scraping a TUI.
  - **Provenance**: record which agent + model resolved each task (beyond a free-
    text string) on the thread, so the knowledge base has an honest audit trail.
- Backward compatible: the PTY paste path remains for agents without MCP; the new
  fields are additive on the `.md` thread format.

Out of scope: parallel multi-agent orchestration; a hosted result service. The
channel stays local and file/MCP-based.

## Capabilities

### Added Capabilities

- **structured-agent-results** — a structured completion channel for the resolve
  loop: captured resolving diffs, an optional verify-command gate, MCP tools for
  the CLI verbs, and model/agent provenance — so a resolved task carries evidence
  of what changed and how it was checked, instead of being inferred from a file
  watcher.

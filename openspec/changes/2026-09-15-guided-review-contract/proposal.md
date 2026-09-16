## Why

The guided review's whole contract with the agent lives in one line of text.
`composeGuidedPlanPrompt` is assembled by string concatenation, typed into the
PTY, and never verified: Reado does not know whether the command it asked for
ever ran. Three consequences, all observed in the code:

- **The objective never reaches the planner.** It is stored on the session and
  passed to the per-file prompt, but not to the planning prompt — so choosing
  "security" ranks the route by generic risk.
- **Reado asks the agent to re-derive facts it already holds.** `scopeFromChanges`
  calls `git_changed_files` (which includes untracked files) and throws the
  result away; the prompt then tells the agent to "inspect the changed files".
  Nothing checks that the route covers them, so a file can be silently missed.
- **`propose-route-change` is dead code that also contradicts the spec.** No
  prompt names it, and its CLI handler is an alias of `plan` — it *replaces* the
  route rather than proposing a change, while "Dynamic Routing Under Human
  Control" requires the human to accept it.

Underneath all three: the route JSON travels as a single-quoted shell argument
inside a TUI, where one apostrophe in a `reason` breaks the command and the
failure is silent. And the one piece of standing context Reado does inject
(`--append-system-prompt`) only exists for Claude Code — every other agent gets
nothing.

## What Changes

- **A structured MCP contract for the session.** `review_plan`,
  `review_propose_route_change`, `session_show`, `review_context`,
  `review_propose_comment`, `review_propose`, `review_summarize_file` and
  `session_summarize` become MCP tools with typed arguments — no shell quoting,
  and an error the agent can read. The MCP `instructions` carry the guided-review
  contract, so **every** MCP-speaking agent receives it, not just Claude Code.
  The CLI stays as the fallback for agents without MCP, and learns to read a
  route from stdin (`--route -`) or a file (`--route @path`).
- **The scope's known file set is captured on the session** (`expectedFiles`) for
  the scopes where Reado can know it — the current diff and a branch range. A PR
  lives in git refs and a free-text request has no set, so for those it stays
  empty and nothing is asserted.
- **Coverage is verified, not hoped for.** Setting a route answers with the
  expected files it left out; the panel shows the same gap to the human, with the
  file openable and a one-click ask to route them. A file may still be left out —
  by declaring it `out_of_scope`, which is an answer, not a silence.
- **Route changes become real proposals.** The agent proposes a new route with a
  reason; it is held on the session until the human accepts or discards it.
  Re-planning a session that already has a route is refused and pointed at this
  verb, so an approved route cannot be overwritten behind the human's back.
- **The planning prompt carries the objective** and, when known, the file set.

## Capabilities

### Modified Capabilities

- `guided-pair-review`: the agent-facing contract (MCP + CLI), the captured scope
  file set, route coverage, and human-disposed route changes.

## Impact

- `crates/reado-core/src/session.rs`: `expected_files`, `RouteChange`,
  `uncovered_files`, `propose_route_change`, `accept/discard_route_change`, and
  `set_route` refusing to overwrite an existing route.
- `crates/reado-cli/src/mcp.rs`: eight session tools + guided-review instructions.
- `crates/reado-cli/src/main.rs`: `plan` reports coverage, `propose-route-change`
  proposes, `--route` accepts `-`/`@file`.
- `src-tauri/src/sessions.rs`: accept/discard commands for the route change.
- `src/lib/review.ts`, `src/lib/guidedReview.ts`, `GuidedReviewPanel.tsx`, i18n.
- `plugin/reado/{AGENTS.md,skills/reado/SKILL.md}`: the guided-review contract for
  agents that read files instead of MCP.

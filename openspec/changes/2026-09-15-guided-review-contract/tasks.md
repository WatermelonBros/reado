## 1. Session model

- [x] 1.1 `expected_files` on `Session`/`NewSession`, captured for diff and branch
      scopes only (a PR lives in refs, a request has no set).
- [x] 1.2 `RouteChange` on the session: the proposed route, its reason, author and
      time — pending until disposed of.
- [x] 1.3 `uncovered_files`: expected minus routed minus deliberately-left-out.
- [x] 1.4 `set_route` refuses a session that already has a route, naming the
      proposal verb; `propose_route_change` / `accept_route_change` /
      `discard_route_change`.

## 2. Agent contract

- [x] 2.1 MCP tools: `session_show`, `review_context`, `review_plan`,
      `review_propose_route_change`, `review_propose_comment`, `review_propose`,
      `review_summarize_file`, `session_summarize`.
- [x] 2.2 MCP `instructions`: the guided-review loop, for every vendor's agent.
- [x] 2.3 CLI: `plan` reports the coverage gap; `propose-route-change` proposes
      instead of replacing; `--route` accepts `-` (stdin) and `@path`.
- [x] 2.4 `AGENTS.md` + `SKILL.md`: the guided-review verbs, so a file-reading
      agent gets the same contract.

## 3. Reado's side

- [x] 3.1 `scopeFromChanges` keeps the file list and `start` persists it.
- [x] 3.2 Planning prompt carries the objective and the known file set; file
      prompt names the route-change verb; prompts prefer MCP with a CLI fallback.
- [x] 3.3 Tauri commands + store actions for accepting/discarding a route change.
- [x] 3.4 Panel: the coverage gap (openable files, one-click ask) and the pending
      route change (reason, added files, accept/discard), in five locales.

## 4. Verify

- [x] 4.1 Core tests: coverage arithmetic, route-change lifecycle, replace refusal.
- [x] 4.2 MCP + CLI tests: each new tool, stdin/@file routes, coverage in output.
- [x] 4.3 Frontend tests: prompt composition, store actions, panel interactions
      driven by clicks.
- [x] 4.4 Drive the real app: plan a session, miss a file, propose a route change,
      accept it. (Done against a fixture repo: CLI `plan` → coverage gap in the
      panel → `propose-route-change` from the CLI → accepted and discarded by
      clicking, verified on disk each time.)

## 5. The panel itself

- [x] 5.1 Per-action hand-off state (sending / waiting / failed) instead of one
      global flag, with waiting ending when the session changes.
- [x] 5.2 Every swallowed `catch` reports what failed and why, dismissibly.
- [x] 5.3 Second press on the destructive paths: delete the session, discard all,
      abandon an edit, accept a route change that costs findings.
- [x] 5.4 The progress bar made honest and visible — the plan and the unplanned
      as two bars, a track with its own boundary, `role="progressbar"`.
- [x] 5.5 One card (the decision), flat sections for the rest, section rhythm,
      one path presentation, 28px chips, overflow menus for the rare actions.
- [x] 5.6 The session title, and the scope it names, in the user's language.

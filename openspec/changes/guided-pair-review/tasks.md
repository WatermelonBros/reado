> The third review model: **guided, incremental, human-in-the-loop**. The LLM
> proposes a route, asks targeted questions, drafts comments and summaries; the
> human decides. State lives in `.reado/sessions/`; the agent gets context via the
> `reado` CLI; confirmed tasks flow into the existing resolve loop. Built in MVP
> tiers — ship MVP 1 first.

## 1. Session entity (`.reado/sessions/`)

- [ ] 1.1 Define the session model: id, title, scope, mode/objective, files-in-scope,
      proposed route, current position, per-file status, created artifacts, decisions,
      open questions, summaries, agent identity, links to existing comments/tasks.
- [ ] 1.2 Per-file states: not_started / queued / in_review / reviewed / needs_followup
      / skipped / blocked / out_of_scope. Persist + reload (resumable).

## 2. CLI contract (the agent's bridge)

- [ ] 2.1 `reado session` create/list/show/plan/next/status/update-file/add-decision/summarize/close.
- [ ] 2.2 `reado review` plan/next/context/propose-comment/propose-route-change/summarize-file.
- [ ] 2.3 CLI exposes structured context (no UI scraping).

## 3. Planning pass (MVP 1)

- [ ] 3.1 Gather signals: git diff size, file type, changed lines, imports/deps,
      test-vs-impl, files with existing comments, recently changed, LSP/tree-sitter
      symbols, knowledge-graph refs, manual selection.
- [ ] 3.2 LLM ranks files (schema: `{file, priority, reason, suggested_review_mode, related_files}`)
      → an ordered route the user can accept/edit/skip.

## 4. Review Guide panel + file-by-file (MVP 1)

- [ ] 4.1 "Review Guide" panel: current session, file/group, objective, LLM guidance,
      proposed next action, route queue, open questions, file summary, progress.
- [ ] 4.2 File-by-file: code centre, anchored comments as today; LLM asks targeted
      questions and **proposes** comments (drafts), never auto-final.
- [ ] 4.3 Per-proposal actions: accept / edit & save / mark task / mark note /
      ask follow-up / jump to related file / defer / discard.
- [ ] 4.4 "Next file" + "Mark reviewed"; session stores per-file status + summary.

## 5. Durable artifacts + state (MVP 1)

- [ ] 5.1 Artifact states: proposed / accepted / edited / discarded / converted_to_task
      / converted_to_note / resolved_as_false_positive — discarded stays as memory.
- [ ] 5.2 Approve → real anchored Reado comment/task (reuse the comment model).

## 6. Dynamic routing (MVP 2)

- [ ] 6.1 LLM may propose widen/narrow/deep-dive/cross-cutting/next; user decides
      (continue/skip/deep-dive/widen/narrow/stop/send-tasks/summarize).
- [ ] 6.2 Track "needs follow-up"; route queue updates live.

## 7. Memory & summaries (MVP 2)

- [ ] 7.1 Per-file mini-summary (checked/decided/comments/risks/dependents/next).
- [ ] 7.2 Session-level summary; resume verbs ("continue last guided review",
      "show reviewed/remaining high-risk files", "summarize so far").

## 8. Controlled context (MVP 2)

- [ ] 8.1 Progressive loading (overview → file → related → comments/specs → wider on ask);
      prefer asking over assuming.
- [ ] 8.2 Explicit "Widen Review / Big Pass" (whole subsystem, compare with specs,
      scan repeated patterns, run tests/typecheck, ask a second agent).

## 9. Resolve-loop integration + deep (MVP 3)

- [ ] 9.1 Send only confirmed tasks to the agent (existing flow); resume after fixes.
- [ ] 9.2 Knowledge graph informs the route; existing comments/docs/specs pulled into context.
- [ ] 9.3 Second-agent challenge mode; export session as a PR-review summary.

## 10. Glue

- [ ] 10.1 i18n (EN + IT); start entry points (file tree, diff, PR view, palette, graph, terminal).
- [ ] 10.2 Tests: session persistence/resume; route schema; artifact state transitions;
      "send confirmed tasks only".

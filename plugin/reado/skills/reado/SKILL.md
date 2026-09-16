---
name: reado
description: >-
  Use when working in a project that uses Reado (it has a `.reado/` folder) and
  the user asks you to resolve review tasks, address comments, or when a "READO
  REVIEW" prompt arrives. Teaches the `reado` CLI contract for reading and
  closing anchored code comments.
---

# Reado task resolution

Reado is a read-first code IDE where the human leaves **comments anchored to
code**. Comments flagged as **tasks** are work for you to resolve. You read and
mutate them **only** through the `reado` CLI — never edit files under `.reado/`
directly. The CLI is the stable contract; the on-disk format may change.

## Workflow

1. **List the work.** Run `reado task list` to see open tasks. Each line shows
   the id, type, anchor (`file:line`) and the first line of the comment.
2. **Read details** when needed: `reado task show <id>` prints the full thread.
3. **Resolve.** Make the change in the code (edit files normally — comments are
   an external overlay, so editing the code never touches them).
4. **Close it.** `reado task done <id>` marks the task done (it is archived as
   history). If you cannot do it, `reado task fail <id> "<reason>"` returns it to
   the user with your note in the thread.
5. **Report back** in the thread when useful: `reado comment reply <id> "<text>"`.
6. **Flag new issues** you notice on the code (or on another agent's work):
   `reado comment add --file <path> --line <n> [--end <m>] --type <bug|refactor|performance|question|note> "<body>"`.

## Commands

```
reado task list                       # open tasks awaiting resolution
reado task show <id>                  # a task and its full thread
reado task done <id>                  # mark done (archives it)
reado task fail <id> "<reason>"       # return to open with a note
reado task link <id> <target>         # link to another comment (graph)
reado comment add --file F --line N [--end M] [--type T] [--note] "<body>"
reado comment reply <id> "<body>"     # reply in a thread
reado comment search "<query>"        # find comments by text
```

Add `--json` to any read command for machine-readable output. Your identity is
taken from `$READO_AGENT` (Reado sets it when it launches you), so replies and
new comments are attributed to you automatically.

## Rules

- One task at a time: resolve, verify, then `reado task done`.
- Never invent ids — always start from `reado task list`.
- Keep the user's code style; comments are specs anchored to the code, so honour
  the intent of each task precisely.
- If `reado` is not found, tell the user to run `pnpm cli:install` in the Reado
  repo (or otherwise put the `reado` binary on PATH).

## Guided Pair Review

A `READO GUIDED REVIEW` prompt carries a **session id**: the user is reviewing
with you, one file at a time, and everything you produce is a **proposal** they
accept, edit or discard. Use the MCP tools when they are available
(`session_show`, `review_context`, `review_plan`, `review_propose_route_change`,
`review_propose_comment`, `review_propose`, `review_summarize_file`,
`session_summarize`) — they take typed arguments, so a route survives that a
shell-quoted JSON argument would not. The CLI carries the same verbs:

```
reado session show <id> --json               # the whole session
reado review plan <id> --route @route.json   # or `-` for stdin, or inline JSON
reado review context <id> --file F --json    # before reviewing a file
reado review propose-comment <id> --file F --line N [--end M] --type T "<body>"
reado review propose <id> --kind question|follow-up|needs-context --file F --line N "<body>"
reado review propose-route-change <id> --route @new.json --reason "<why>"
reado review summarize-file <id> --file F "<what you checked / risks / next>"
reado session set-file <id> --file F --state out-of-scope
reado session summarize <id> "<the overall read>"
```

### Rules for a review

- **Propose, never accept.** The human disposes of every comment, question and
  route change. Do not edit code during a review.
- **The route belongs to the human.** Once planned, it is theirs: `plan` refuses
  to overwrite it. A file you discover matters mid-review is a
  `propose-route-change` with a reason — it waits for them, so keep reviewing.
- **Cover the scope or say why not.** `plan` answers with the files the scope
  contains that your route left out. Route them, or mark each `out-of-scope`.
  Saying a file needs no review is an answer; silence is not.
- **Prefer a question to a guess.** `--kind needs-context` when you cannot judge
  the code without more of it.

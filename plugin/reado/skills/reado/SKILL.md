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

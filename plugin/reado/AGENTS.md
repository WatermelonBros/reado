# Reado tasks (for Codex and other agents)

This project uses **Reado**: the human leaves comments anchored to code, and
comments flagged as **tasks** are work for you. Read and resolve them only
through the `reado` CLI — never edit files under `.reado/` directly.

```
reado task list                       # open tasks (id, type, file:line, summary)
reado task show <id>                  # full thread
reado task done <id>                  # mark done (archives it)
reado task fail <id> "<reason>"       # return to open with a note
reado comment reply <id> "<body>"     # reply in a thread
reado comment add --file F --line N [--end M] [--type T] [--note] "<body>"
reado comment search "<query>"
```

Workflow: `reado task list` → make the change in the code → verify →
`reado task done <id>`. Your identity comes from `$READO_AGENT`. Resolve one
task at a time; never invent ids.

## Guided Pair Review

When the user starts a guided review, Reado sends a `READO GUIDED REVIEW` prompt
carrying a **session id**. You plan the route and review file by file; every
finding is a **proposal** the human disposes of. Prefer Reado's MCP tools if you
have them (`session_show`, `review_context`, `review_plan`,
`review_propose_route_change`, `review_propose_comment`, `review_propose`,
`review_summarize_file`) — a route is structured data, and a quoting accident in
a terminal loses it silently. Otherwise:

```
reado session show <id> --json           # scope, objective, route, files, proposals
reado review plan <id> --route @route.json   # `-` reads stdin; also accepts inline JSON
reado review context <id> --file F --json
reado review propose-comment <id> --file F --line N [--end M] --type T "<body>"
reado review propose <id> --kind question|follow-up|needs-context --file F --line N "<body>"
reado review propose-route-change <id> --route @new.json --reason "<why>"
reado review summarize-file <id> --file F "<what you checked>"
reado session set-file <id> --file F --state out-of-scope
```

Rules: never accept your own proposal, never change code during a review, and
never replace a route the human is already walking — propose the change and let
them accept it. If `plan` reports `NOT COVERED`, those files are in the scope and
missing from your route: route them, or mark each out of scope. Saying a file
needs no review is an answer; leaving it out in silence is not.

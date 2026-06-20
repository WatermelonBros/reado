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

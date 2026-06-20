---
description: Resolve the open Reado tasks in this project via the `reado` CLI.
---

Resolve the Reado review tasks for this project.

1. Run `reado task list` to see the open tasks.
2. For each task, in order:
   - `reado task show <id>` if you need the full thread.
   - Make the change in the code (files only — never touch `.reado/`).
   - Verify it builds / passes where applicable.
   - `reado task done <id>` (or `reado task fail <id> "<reason>"` if blocked).
3. Briefly summarise what you changed for each task.

Resolve tasks one at a time and confirm each before moving on. Do not invent
task ids — always work from `reado task list`.

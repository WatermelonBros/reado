---
description: Audit a file or folder and record findings as Reado comments (no code changes).
---

Audit the target the user names (a file or folder) and record every finding as a
Reado comment anchored to the exact code, so the human can read them inline.

Rules:

- Do **not** change any code. The deliverable is comments, not edits.
- For each finding, anchor a comment to the precise line(s):
  `reado comment add --file <path> --line <n> [--end <m>] --type <bug|refactor|performance|question|note> "<body>"`
  - Use a **task** comment (omit `--note`) for actionable issues a human/agent
    should later resolve.
  - Add `--note` for observations that aren't actionable.
- Pick the most fitting `--type` per finding (`bug`, `refactor`, `performance`,
  `question`, `note`).
- Keep each comment concise and specific to its location; one finding per comment.
- When done, briefly summarise how many comments you added, grouped by type.

If a "READO AUDIT" prompt arrives with focus instructions, scope the audit to
that focus. Otherwise do a general correctness, quality, and security pass.

## ADDED Requirements

### Requirement: Hide resolved comments

Reado SHALL let the user choose whether resolved (done/discarded) comment threads
remain visible on the reading surface or are hidden to keep it clean during a
review. The setting SHALL affect only presentation — it SHALL NOT delete,
resolve, or alter any comment, and the threads SHALL remain reachable.

#### Scenario: Hiding declutters the surface

- **WHEN** the user turns off "Show resolved comments"
- **THEN** resolved threads no longer draw their gutter markers/inline presence,
  and the comments panel hides them from its default list

#### Scenario: Hidden comments are not lost

- **WHEN** resolved comments are hidden
- **THEN** the underlying comments still exist on disk and can still be reviewed
  (e.g. via the history/archived view), and re-enabling the setting restores
  their on-surface presence

#### Scenario: Only resolved threads are affected

- **WHEN** the setting is off and a thread is still open
- **THEN** that open thread remains fully visible; only resolved ones are hidden

### Requirement: Suppress inline diagnostics

Reado SHALL let the user turn off inline diagnostic decorations (squiggles /
underlines) in the editor for distraction-free reading, without changing what
diagnostics exist. The Problems panel, tree error counts, and any gutter/summary
signals SHALL continue to report the same diagnostics.

#### Scenario: Turning off squiggles

- **WHEN** the user disables inline diagnostics while a file has errors
- **THEN** the editor draws no underlines for those errors, but the Problems
  panel and the file tree's error counts still show them

#### Scenario: Re-enabling restores decorations

- **WHEN** the user re-enables inline diagnostics
- **THEN** the current file's diagnostics are re-decorated live without reopening
  the file

### Requirement: Review controls persist and travel

The review controls SHALL persist in `reado.settings` with documented defaults
(resolved comments shown, inline diagnostics on), apply live, propagate across
open windows, and be included in the settings-sync bundle allow-list, while never
carrying any comment or diagnostic data themselves.

#### Scenario: Defaults preserve today's behaviour

- **WHEN** the app runs with no persisted settings
- **THEN** resolved comments are shown and inline diagnostics are drawn, matching
  current behaviour

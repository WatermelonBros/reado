## ADDED Requirements

### Requirement: Calm per-line blame annotation

Reado SHALL show, when blame mode is on, a per-line annotation giving the line's
last author and a relative age (e.g. "Ada · 3d"), rendered as a quiet gutter that
recedes against the code. The presentation SHALL be faint by default, use no
per-line recency or author coloring, and SHALL be off by default and toggleable.

#### Scenario: Reader enables blame

- **WHEN** the reader toggles blame on from the breadcrumb for a tracked file
- **THEN** each line shows a faint "author · relative-age" annotation in the
  gutter without shifting or obscuring the code column

#### Scenario: Off by default

- **WHEN** a file is first opened
- **THEN** no blame annotation is shown until the reader explicitly toggles it on

#### Scenario: Not-yet-committed lines

- **WHEN** a line has local uncommitted changes (all-zero hash)
- **THEN** its annotation is shown muted ("not yet committed") rather than with an
  author and date

### Requirement: Lazy per-file blame backing

Reado SHALL back inline blame with `git blame --line-porcelain` on the Rust side
(`git_blame`), computed lazily per file only while blame mode is on, and SHALL
cache the result per (file, HEAD) so toggling or re-opening the file does not
recompute it. The cache SHALL be invalidated when the file or HEAD changes.

#### Scenario: Lazy first compute

- **WHEN** blame is toggled on for a file for the first time
- **THEN** `git_blame` runs once for that file and its lines are rendered

#### Scenario: Cached re-toggle

- **WHEN** blame is toggled off and on again for the same file with no change to
  the file or HEAD
- **THEN** the cached blame is reused instead of running `git blame` again

#### Scenario: Git unavailable or untracked

- **WHEN** git is unavailable or the file is untracked
- **THEN** `git_blame` returns an empty result and no annotation is shown, with no
  error surfaced to the reader

### Requirement: Commit context on hover

Reado SHALL reveal commit context for a blame annotation on hover, showing at
least the commit subject, abbreviated hash, author, and full date, in a quiet
tooltip that does not compete with the code.

#### Scenario: Hover a blame line

- **WHEN** the reader hovers (or focuses) a line's blame annotation
- **THEN** a quiet tooltip shows the commit subject, abbreviated hash, author and
  full date for that line

#### Scenario: Dismiss

- **WHEN** the pointer leaves the annotation or the reader presses Escape
- **THEN** the tooltip is dismissed

### Requirement: Restraint and honest surfaces

Reado SHALL keep inline blame visually restrained: the annotation MUST use faint
tokens, MUST NOT obscure or reflow the code column, and MUST NOT overlap other
gutters (such as the comment gutter). State SHALL be honest — blame reflects the
current file/HEAD and disappears cleanly when toggled off.

#### Scenario: Does not obscure code

- **WHEN** blame is on
- **THEN** the annotation stays within its gutter, capped in width, and the code
  column is not shifted or covered

#### Scenario: Clean toggle off

- **WHEN** the reader toggles blame off
- **THEN** all blame annotations are removed and the editor returns to its
  unannotated layout

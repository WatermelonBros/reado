## ADDED Requirements

### Requirement: Reado Folder Layout
Reado SHALL store project annotations under a `.reado/` folder in the project root, with `comments/` for active comments, `archive/` for resolved comments, `index.sqlite` for the derived index, and `config` for per-project settings.

#### Scenario: Folder structure
- **WHEN** a project has active and resolved comments
- **THEN** active comments live under `.reado/comments/` and resolved ones under `.reado/archive/`

### Requirement: Comment File Schema
Each comment SHALL be a single `.md` file containing YAML front-matter (id, type, state, task/note flag, author, anchor with file/range, last-known position and context snapshot, links, timestamps) followed by the markdown body. The `.md` files SHALL be the source of truth.

#### Scenario: One file per comment
- **WHEN** a comment is created
- **THEN** a `.md` file is written with its metadata front-matter and body

### Requirement: First-Comment Initialization
When a project has no `.reado/` folder and the user creates the first comment, Reado SHALL create the folder structure automatically.

#### Scenario: Auto-create on first comment
- **WHEN** the user creates the first comment in a project without `.reado/`
- **THEN** the `.reado/` structure is created and the comment is stored

### Requirement: Gitignore Prompt
On first initialization, Reado SHALL ask whether to add `.reado/` to `.gitignore`, with a "don't ask again" option that persists the choice.

#### Scenario: Remember the choice
- **WHEN** the user answers the gitignore prompt with "don't ask again" checked
- **THEN** the choice is applied and the prompt does not appear again for that scope

### Requirement: Versioning Toggle
Reado SHALL default `.reado/` to gitignored and SHALL provide a setting to version it instead (for backup/sharing).

#### Scenario: Enable versioning
- **WHEN** the user enables the versioning toggle for a project
- **THEN** `.reado/` is no longer gitignored (except the rebuildable `index.sqlite`)

### Requirement: Archive on Resolution
When a comment becomes done, Reado SHALL move its `.md` file from `comments/` to `archive/`, preserving it as consultable history rather than deleting it.

#### Scenario: Resolution archives
- **WHEN** a comment transitions to done
- **THEN** its `.md` file is moved to `.reado/archive/` and remains readable

### Requirement: SQLite Index
Reado SHALL maintain a SQLite index as a rebuildable cache (gitignored), built on project open if absent and updated incrementally via the watcher. The index SHALL never be authoritative; it SHALL be reconstructable entirely from the `.md` files.

#### Scenario: Rebuild from markdown
- **WHEN** `index.sqlite` is deleted and the project is opened
- **THEN** the index is rebuilt from the `.md` files with no loss of comments

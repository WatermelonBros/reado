## ADDED Requirements

### Requirement: Per-file mtime-invalidated symbol index

Reado SHALL maintain an in-memory index of each file's extracted declaration
records, keyed by the file's modification time, so that a file whose mtime is
unchanged since it was last indexed is neither re-read nor re-scanned on a
subsequent symbol query. A file that is new or whose mtime changed SHALL be
re-extracted.

#### Scenario: Unchanged file is not re-scanned

- **WHEN** a symbol query runs twice with no file changes in between
- **THEN** the second run serves the unchanged files from the index without
  reading them again

#### Scenario: Changed file is refreshed

- **WHEN** a file is edited (its mtime advances) and a symbol query runs
- **THEN** that file's records are re-extracted and reflect the new contents

### Requirement: Behaviour and ranking preserved

The workspace symbol list and go-to-definition SHALL return the same symbols and
the same ranking as the previous per-call scan: keyword declarations rank above
assignments/fields, which rank above call-like sites, with the same result caps.

#### Scenario: Definition ranking unchanged

- **WHEN** a name is declared with a keyword, assigned, and called in the project
- **THEN** the keyword declaration is the top go-to-definition result

#### Scenario: Symbol list unchanged

- **WHEN** the workspace symbol picker lists symbols
- **THEN** it contains the same keyword-declared names as before, with their kind
  hint

### Requirement: Bounded memory

The index SHALL be bounded — evicted when it grows past a cap, and skipping files
above a size threshold — so it cannot grow without limit over a long session on a
large repository.

#### Scenario: Cap enforced

- **WHEN** more files are indexed than the cap allows
- **THEN** the index is bounded (older entries are evicted) and queries still
  return correct results by re-extracting as needed

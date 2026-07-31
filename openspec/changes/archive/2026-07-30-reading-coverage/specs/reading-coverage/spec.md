## ADDED Requirements

### Requirement: Overall reading coverage

Reado SHALL show, in a dedicated side panel, the overall reading coverage of the
open project as the number of files read out of the total readable files and the
corresponding percentage, with a progress bar. The total SHALL respect the same
exclude globs and gitignore handling as the file tree, so hidden files do not
skew the figure.

#### Scenario: Coverage reflects read files

- **WHEN** the reader has marked some files read
- **THEN** the panel shows `read / total` and the percentage, and the bar fills
  to that fraction

#### Scenario: Nothing read yet

- **WHEN** no file has been read in the project
- **THEN** the panel shows 0% with a calm empty-state message rather than an
  error or a blank

#### Scenario: Excluded files don't skew the total

- **WHEN** the user has exclude globs configured
- **THEN** the total counts only the files the tree would show (excluded/ignored
  paths are not in the denominator)

### Requirement: Per-folder breakdown

Reado SHALL break coverage down by top-level directory, each row showing that
area's read/total and a mini progress bar, ordered so the largest areas appear
first. Files at the project root SHALL be grouped into their own row.

#### Scenario: Folder rows

- **WHEN** the project has multiple top-level directories with read files
- **THEN** each directory appears with its own read/total and bar, largest first

#### Scenario: Fully-read area

- **WHEN** every file in a directory has been read
- **THEN** that area reads as complete (100%)

### Requirement: Changed-since-read list

Reado SHALL list the read files that have changed externally since being read
(the existing changed-delta set) as items worth re-reading, each opening the file
when activated. When none have changed, the section SHALL be absent rather than
showing an empty header.

#### Scenario: A read file changed externally

- **WHEN** a file that was read is edited on disk (e.g. by the agent)
- **THEN** it appears in the changed-since-read list; clicking it opens the file

### Requirement: Live updates and motion

The panel SHALL update live as files are read, unread, or change, and its bars
SHALL animate to their values with a short transition that collapses to instant
under reduce-motion.

#### Scenario: Marking a file read updates the map

- **WHEN** the reader marks a file read (or unread) while the panel is open
- **THEN** the overall figure, the relevant folder row, and the bars update
  without a manual refresh

#### Scenario: Reduce-motion

- **WHEN** reduce-motion is active
- **THEN** bars jump to their values with no growth transition

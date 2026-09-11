## MODIFIED Requirements

### Requirement: Line Wrap Toggle

Reado SHALL default code line wrapping to off, with a quick toggle to enable it,
and SHALL let the user choose where a wrapped line breaks: at the editor's edge
(the default) or at a fixed column.

#### Scenario: Toggle wrap

- **WHEN** the user toggles line wrap on for a file with long lines
- **THEN** long lines wrap instead of scrolling horizontally

#### Scenario: Wrap at a column

- **WHEN** wrap is on and the user sets the wrap column to 120
- **THEN** lines break at 120 characters however wide the window is

#### Scenario: Column zero means the edge

- **WHEN** the wrap column is 0
- **THEN** lines wrap at the editor's edge, as they always have

#### Scenario: The setting applies to open files

- **WHEN** the wrap column changes while a file is open
- **THEN** that file re-wraps without being reopened

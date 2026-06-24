## ADDED Requirements

### Requirement: Structural Marks
Reado SHALL render a slim vertical ribbon beside the active file's scrollbar that
marks the line positions of functions/classes (from document symbols), comment
anchors, and diagnostics, so the reader grasps the file's structure at a glance.

#### Scenario: Symbols and comments appear as marks
- **WHEN** a file with functions/classes and anchored comments is open
- **THEN** the ribbon shows a calm mark at the relative vertical position of each
  symbol and each comment anchor

#### Scenario: Diagnostics appear as marks
- **WHEN** the file has LSP diagnostics
- **THEN** the ribbon shows a mark at each diagnostic's line, distinguishable by
  severity

#### Scenario: Marks stay in sync
- **WHEN** the symbols, comments, or diagnostics for the file change, or the
  active file switches
- **THEN** the ribbon's marks update to match

### Requirement: Click and Hover Navigation
The ribbon SHALL let the reader navigate the file by clicking a mark or ribbon
position, and SHALL reveal a quiet tooltip on hover/focus.

#### Scenario: Click to jump
- **WHEN** the reader clicks a mark or a position on the ribbon
- **THEN** the editor scrolls to bring the corresponding line into view

#### Scenario: Hover shows context
- **WHEN** the reader hovers or focuses a mark
- **THEN** a quiet tooltip shows the symbol name, comment text, or diagnostic
  message for that mark

### Requirement: Viewport Indicator
The ribbon SHALL show a viewport indicator that reflects the currently visible
line range and tracks scrolling.

#### Scenario: Indicator follows scroll
- **WHEN** the reader scrolls the editor
- **THEN** the viewport indicator band moves to reflect the newly visible range

### Requirement: Calm Toggleable Presentation
The ribbon SHALL use calm, low-contrast presentation with muted theme tokens and
SHALL be toggleable, and it SHALL NOT render a pixel minimap or scaled-down text.

#### Scenario: Calm low-contrast marks
- **WHEN** the ribbon is shown
- **THEN** marks use muted theme colours that meet WCAG AA and no pixel/text
  rendering of file contents is drawn

#### Scenario: Toggle off reclaims space
- **WHEN** the reader toggles the ribbon off
- **THEN** the ribbon is hidden, the preference is persisted, and the ribbon
  reserves no layout space

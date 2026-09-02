## ADDED Requirements

### Requirement: Dockable Panels

Reado SHALL let the user move any dockable panel (each tool panel, the terminal,
and the browser preview) to any dock area — **left**, **right**, or **bottom** —
around the fixed editor centre, by dragging its tab or via a "Move to" menu on the
tab. A panel SHALL live in exactly one place at a time.

#### Scenario: Move a panel to another area

- **WHEN** the user drags a panel's tab onto a different dock area (or picks
  "Move to → Right")
- **THEN** the panel moves there and is removed from its previous location

#### Scenario: Keyboard/menu parity

- **WHEN** the user opens a panel tab's menu
- **THEN** it offers Move to Left / Right / Bottom, Split, and Close — so the panel
  can be rearranged without dragging

### Requirement: Stack and Split

A dock area SHALL hold one or more panel **groups**; a group SHALL be a tabbed
stack of panels. The user SHALL be able to drop a panel **into a group** (as a new
tab) or **beside a group** (splitting the area) so two panels sit side-by-side —
e.g. the browser preview next to the terminal in the bottom area.

#### Scenario: Stack as tabs

- **WHEN** the user drops a panel onto another group's tab strip
- **THEN** both panels share that group as tabs, one active at a time

#### Scenario: Split side-by-side

- **WHEN** the user drops a panel beside a group (e.g. the browser next to the
  terminal)
- **THEN** the area splits into two groups shown side-by-side

### Requirement: Resizable Areas and Splits

Every dock area and every split between groups SHALL be drag-resizable, and the
sizes SHALL be remembered.

#### Scenario: Resize persists

- **WHEN** the user drags an area edge or a group splitter to resize it
- **THEN** the new size is applied and retained for later

### Requirement: Persisted Layout with Reset

The panel arrangement SHALL be **persisted per project** and restored when the
project is reopened (and after a reload). A **Reset layout** action SHALL return to
the default arrangement.

#### Scenario: Layout restored on reopen

- **WHEN** the user rearranges panels and later reopens the project (or reloads)
- **THEN** the same arrangement is restored

#### Scenario: Reset to default

- **WHEN** the user chooses "Reset layout"
- **THEN** the panels return to Reado's default arrangement

### Requirement: Content Survives a Move

Moving a panel SHALL preserve its live content: the terminal keeps its PTY session
and scrollback, and the browser preview keeps its loaded page and captured
console/network — only the container is reparented, nothing is torn down.

#### Scenario: Terminal survives a dock move

- **WHEN** the user moves the terminal to another area
- **THEN** its running shell/agent and scrollback are unchanged

#### Scenario: Browser follows its dock

- **WHEN** the user moves or resizes the browser preview's dock
- **THEN** the native preview window follows the panel's on-screen rect, and the
  loaded page is not reloaded

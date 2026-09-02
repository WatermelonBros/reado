# integrated-terminal Specification

## Purpose
TBD - created by archiving change add-reado-mvp. Update Purpose after archive.
## Requirements
### Requirement: Multi-Tab PTY Terminal
Reado SHALL provide an integrated terminal panel backed by real PTYs, supporting multiple tabs so different sessions (e.g. one per agent, one for manual commands) can run simultaneously.

#### Scenario: Open multiple terminal tabs
- **WHEN** the user opens more than one terminal tab
- **THEN** each tab runs an independent PTY session

### Requirement: Login Shell
The terminal SHALL launch the user's login shell (zsh by default) so it inherits the user's environment, PATH, and aliases.

#### Scenario: Inherited environment
- **WHEN** a terminal tab is opened
- **THEN** it runs the login shell with the user's environment available

### Requirement: Interactive Input
The terminal SHALL accept interactive input, allowing the user to type and run arbitrary commands.

#### Scenario: Run a command
- **WHEN** the user types a command and presses enter in a terminal tab
- **THEN** the command runs and its output streams into the terminal

### Requirement: Agent Launch Buttons
The terminal SHALL provide buttons to launch supported agents (e.g. claude, codex) into a terminal tab.

#### Scenario: Launch via button
- **WHEN** the user clicks the launch button for an agent
- **THEN** that agent is started in a terminal tab

### Requirement: Split Panes Within a Tab
A terminal tab SHALL be a group that can contain multiple panes, each backed by
an independent PTY, tiled and visible at the same time within the panel body.

#### Scenario: Split the active group
- **WHEN** the user invokes "Split terminal" on the active group
- **THEN** a new pane with its own PTY is added to that group and becomes visible
  alongside the existing pane(s)

#### Scenario: A fresh tab is a single pane
- **WHEN** the user creates a new terminal tab
- **THEN** the group contains exactly one full-size pane that behaves like the
  pre-split terminal

### Requirement: Split Orientation
A group SHALL tile its panes along a single axis, and the user SHALL be able to
toggle that axis between horizontal (side-by-side) and vertical (stacked).

#### Scenario: Toggle orientation
- **WHEN** the user toggles the active group's orientation
- **THEN** its panes re-tile along the other axis without losing their PTYs or
  scrollback

### Requirement: Resizable Panes
Panes within a group SHALL be drag-resizable along the split axis, and each
pane's terminal SHALL re-fit its PTY to the new size.

#### Scenario: Drag a divider
- **WHEN** the user drags the divider between two panes
- **THEN** the two panes' sizes change accordingly and both terminals re-fit
  (rows/cols updated) without restarting their PTYs

### Requirement: Focused Pane
Exactly one pane SHALL be focused at a time. Keyboard input, agent launches, and
the "Send review" / "Audit" injections SHALL target the focused pane.

#### Scenario: Focus by click
- **WHEN** the user clicks inside a pane
- **THEN** that pane becomes focused and subsequent input/injection goes to it

#### Scenario: Launch targets the focused pane
- **WHEN** the user launches an agent or sends a review while a pane is focused
- **THEN** the command is injected into that pane's PTY

### Requirement: Close a Pane
The user SHALL be able to close an individual pane; closing the last pane of a
group closes the group (tab).

#### Scenario: Close one pane of several
- **WHEN** the user closes a pane in a group that has more than one
- **THEN** that pane's PTY is terminated and the remaining panes re-tile to fill
  the space

#### Scenario: Close the last pane
- **WHEN** the user closes the only pane in a group
- **THEN** the group (tab) is removed, and the panel closes if no groups remain

### Requirement: Responsive Panel Header
The terminal panel header SHALL stay legible when the panel is narrow (e.g.
docked on the right and shrunk): labeled action buttons SHALL collapse to
icon-only (with tooltips) below a width threshold instead of clipping or wrapping.

#### Scenario: Narrow right-docked panel
- **WHEN** the panel is docked on the right and narrowed past the threshold
- **THEN** the header's labeled buttons ("Send review", "Audit") render icon-only
  with their labels moved to tooltips, and nothing clips or overflows

### Requirement: Panes Adapt To Dock And Resize
Panes SHALL remain correctly tiled and fitted when the panel is docked at the
bottom or on the right and when the panel itself is resized.

#### Scenario: Re-fit on panel resize
- **WHEN** the panel is resized or moved between bottom and right docks
- **THEN** every visible pane re-fits its PTY to its new dimensions


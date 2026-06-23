## ADDED Requirements

### Requirement: Custom themed title bar

Reado SHALL render its own title bar, themed with the app's OKLCH tokens, in
place of the default OS title bar. On macOS it SHALL keep the native traffic
lights (transparent/overlay title bar); on Windows and Linux it SHALL hide the
native decorations and draw the window controls itself.

#### Scenario: Title bar matches the theme

- **WHEN** a dark theme is active
- **THEN** the title bar is dark on every platform (no default light bar)

#### Scenario: macOS keeps native traffic lights

- **WHEN** running on macOS
- **THEN** the standard red/yellow/green controls are present and functional, and
  the rest of the bar is Reado's content

### Requirement: Command Center

The title bar SHALL contain a centered Command Center pill that shows the project
context (or "Search…") and opens the existing command palette when clicked or
when its shortcut (⌘K / Ctrl+K) is pressed.

#### Scenario: Open the palette from the Command Center

- **WHEN** the user clicks the Command Center pill
- **THEN** the command palette opens

#### Scenario: Keyboard shortcut

- **WHEN** the user presses ⌘K / Ctrl+K
- **THEN** the command palette opens

### Requirement: Window controls and drag

The title bar SHALL be a drag region for moving the window, excluding interactive
elements (the pill, buttons, menu). On Windows and Linux it SHALL provide
minimize, maximize/restore, and close controls, and double-clicking an empty area
SHALL toggle maximize.

#### Scenario: Drag to move

- **WHEN** the user drags an empty part of the title bar
- **THEN** the window moves

#### Scenario: Window controls (Windows/Linux)

- **WHEN** the user clicks the close / minimize / maximize control
- **THEN** the window closes / minimizes / toggles maximized

#### Scenario: Interactive elements don't drag

- **WHEN** the user clicks the Command Center or a control
- **THEN** the action fires and the window does not start dragging

### Requirement: Menu access without native decorations

On Windows and Linux the title bar SHALL provide access to the application menu
(a rendered menu or a menu button), since hiding decorations also removes the
native menu strip. macOS SHALL continue to use the system menu bar.

#### Scenario: Reach the menu on Windows/Linux

- **WHEN** running with custom decorations and the user opens the title bar's
  menu affordance
- **THEN** the application menu commands are available

## ADDED Requirements

### Requirement: Interface tab gathers chrome controls

Reado SHALL provide an Interface tab in Settings that gathers the app-chrome
preferences — interface zoom, activity bar visibility, status bar visibility,
breadcrumb visibility, structure ribbon, and file-type icons — each reading the
existing store field, applying live, and staying in sync with the View menu and
any keyboard shortcut that changes the same field.

#### Scenario: Hiding chrome applies live

- **WHEN** the user turns off the status bar in the Interface tab
- **THEN** the status bar disappears immediately and stays hidden across
  restarts, and the View menu reflects the same state

#### Scenario: Chrome toggle reaches other windows

- **WHEN** two windows are open and the user hides the activity bar in one
- **THEN** the other window hides it too, via the existing cross-window sync

### Requirement: Interface zoom as preset levels

Reado SHALL let the user pick the interface zoom from a set of preset levels that
write the existing numeric zoom factor, applied live and kept consistent with the
zoom-in / zoom-out shortcuts.

#### Scenario: Selecting a zoom level

- **WHEN** the user selects 125%
- **THEN** the interface scales to 1.25 immediately and persists

#### Scenario: Shortcut and control agree

- **WHEN** the user zooms in with the keyboard shortcut past a preset boundary
- **THEN** the Settings control reflects the nearest/equal preset the next time
  it is shown, and neither surface fights the other

### Requirement: Reduce motion

Reado SHALL let the user damp non-essential interface motion with three modes —
follow the OS setting, force on, or force off — and SHALL suppress non-essential
animations app-wide when it resolves to on.

#### Scenario: Following the OS setting

- **WHEN** reduce-motion is set to "system" and the OS requests reduced motion
- **THEN** Reado suppresses non-essential animations (segmented-control slide,
  drawer/overlay transitions) without the user changing anything in Reado

#### Scenario: Forcing motion off overrides the OS

- **WHEN** reduce-motion is set to "off" while the OS requests reduced motion
- **THEN** Reado still plays its animations, honouring the explicit override

#### Scenario: Essential feedback is preserved

- **WHEN** reduce-motion resolves to on
- **THEN** state changes still occur instantly and legibly (no reliance on an
  animation to convey meaning); only decorative motion is removed

### Requirement: Cursor style and blinking

Reado SHALL let the user choose the caret shape (line, block, underline) and its
blink behaviour (blink, smooth, solid), applied live to the editor and persisted.

#### Scenario: Solid block caret

- **WHEN** the user sets cursor style to block and blinking to solid
- **THEN** the editor caret is a non-blinking block immediately

### Requirement: Scrollbar and tab-strip visibility

Reado SHALL let the user control editor scrollbar visibility (auto, always,
hidden) and the editor tab-strip density (multiple tabs, single tab, hidden),
each applied live and persisted.

#### Scenario: Hidden scrollbar keeps scrolling

- **WHEN** the user sets the scrollbar to hidden
- **THEN** the scrollbar is not drawn but wheel/trackpad and keyboard scrolling
  still work

#### Scenario: Single-tab mode

- **WHEN** the user sets the tab strip to single and opens a second file
- **THEN** the editor shows only the active file's tab, and switching files
  replaces it rather than accumulating a row of tabs

#### Scenario: Hidden tab strip still allows switching

- **WHEN** the tab strip is hidden and multiple files are open
- **THEN** the tab row is not shown, but the user can still switch files via the
  command palette / keyboard, and no open file is silently closed

### Requirement: Interface controls persist and travel

Every Interface control SHALL persist in `reado.settings` with a documented
default, apply without a full editor/app remount, propagate to other open
windows, and be included in the settings-sync bundle allow-list.

#### Scenario: Defaults on fresh install

- **WHEN** the app runs with no persisted settings
- **THEN** each Interface control reports its documented default and the chrome
  renders accordingly

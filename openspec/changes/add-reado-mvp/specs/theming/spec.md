## ADDED Requirements

### Requirement: Research-Based Palettes
Reado SHALL ship 2-4 themes whose colors are derived from research on color theory for prolonged code reading, using a desaturated base and comfortable (not maximal) contrast rather than pure black on pure white. Both a light and a dark theme SHALL be first-class.

#### Scenario: Default follows system preference
- **WHEN** Reado is first used
- **THEN** the active theme follows the operating-system light/dark preference
- **AND** the dark theme uses a low-fatigue gray-blue base (not pure black) and the light theme a warm off-white base (not pure white)

#### Scenario: Auto-switch with the system
- **WHEN** the OS switches between light and dark while Reado is open
- **THEN** Reado switches to the corresponding theme automatically

### Requirement: Semantic Color Hierarchy
Themes SHALL use at most ~6 semantic colors over the base, prioritizing structural understanding (control flow, definitions, strings) and muting noise (punctuation, symbols), avoiding a "Christmas tree" rainbow.

#### Scenario: Limited semantic palette
- **WHEN** code is highlighted in any shipped theme
- **THEN** no more than ~6 semantic colors are used and structure-bearing tokens are emphasized over noise

### Requirement: Whole-UI Theming
Themes SHALL apply consistently across the whole interface (chrome, panels, terminal, editor), not only the editor.

#### Scenario: Consistent surfaces
- **WHEN** a theme is active
- **THEN** the chrome, panels, terminal, and editor share the theme's palette

### Requirement: Theme Selection Mode
Reado SHALL support three theme-selection modes: **Manual** (a fixed chosen theme), **System** (follows the OS light/dark preference), and **Time of day ("Trust Reado")** (Reado picks light/dark automatically by local time of day). The mode SHALL be configurable.

#### Scenario: Manual mode
- **WHEN** the mode is Manual and the user selects a theme
- **THEN** that theme stays active regardless of OS preference or time of day

#### Scenario: System mode
- **WHEN** the mode is System
- **THEN** the active theme follows the OS light/dark preference and switches with it

#### Scenario: Trust Reado mode
- **WHEN** the mode is "Trust Reado" (time of day)
- **THEN** Reado selects the light theme during daytime and the dark theme in the evening/night based on local time

### Requirement: Time-of-Day Thresholds
In "Trust Reado" mode, Reado SHALL switch by local sunrise/sunset when location is available, and otherwise by configurable fixed times (default light 07:00–19:00). Switching SHALL happen live while the app is open, without restart.

#### Scenario: Auto switch in the evening
- **WHEN** "Trust Reado" mode is active and local time crosses into the evening threshold while Reado is open
- **THEN** Reado switches to the dark theme automatically

#### Scenario: Configurable fallback times
- **WHEN** location is unavailable and the user sets custom day/night times
- **THEN** Reado uses those times to choose the theme

### Requirement: Live Theme Switch
Reado SHALL switch themes live without requiring a restart.

#### Scenario: Switch instantly
- **WHEN** the user selects a different theme
- **THEN** the interface updates immediately without a restart

### Requirement: Colorblind and Contrast Validation
Each shipped theme SHALL be validated for common color-vision deficiencies and SHALL meet WCAG AA contrast as a minimum floor.

#### Scenario: Theme passes checks
- **WHEN** a theme is shipped
- **THEN** it meets WCAG AA contrast and remains distinguishable under common colorblindness simulations

### Requirement: Configurable Code Font
Reado SHALL use a high-legibility monospace code font by default and allow the user to configure it.

#### Scenario: Change the code font
- **WHEN** the user selects a different code font in settings
- **THEN** the editor renders code in that font

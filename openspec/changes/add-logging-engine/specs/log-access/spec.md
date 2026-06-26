## ADDED Requirements

### Requirement: Reveal the log file
The system SHALL provide a user-facing action that reveals the active log file in the OS file manager (or opens it), using the existing opener capability, so a user can attach it to a bug report without knowing its path.

#### Scenario: Reveal action opens location
- **WHEN** the user triggers the "Reveal log file" action
- **THEN** the OS file manager opens with the active log file shown (or the log directory if reveal-in-folder is unavailable)

#### Scenario: Action available from the menu
- **WHEN** the user opens the application menu
- **THEN** a discoverable entry for revealing/opening logs is present

### Requirement: Copy the log path
The system SHALL let the user copy the absolute path of the active log file to the clipboard, and SHALL surface the configured log location in settings so it is discoverable.

#### Scenario: Copy path
- **WHEN** the user triggers "Copy log path"
- **THEN** the absolute path of the active log file is placed on the clipboard

#### Scenario: Path shown in settings
- **WHEN** the user views logging settings
- **THEN** the resolved log directory/file path is displayed alongside the enable and level controls

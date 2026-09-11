# log-access Specification

## Purpose
TBD - created by archiving change add-logging-engine. Update Purpose after archive.
## Requirements
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

### Requirement: In-app output channels

Reado SHALL show its own log records inside the app, in a panel, grouped into
channels by the record's source, with the language servers' output among them.
The panel SHALL let the user filter by channel, by level and by text, and SHALL
bound what it holds in memory.

#### Scenario: Diagnosing a server that will not start

- **WHEN** a language server fails to start and the user opens the Output panel
- **THEN** that server's channel shows what it printed and the failure record

#### Scenario: Choosing a channel

- **WHEN** the user picks a channel
- **THEN** only that source's records are listed

#### Scenario: Only channels that exist

- **WHEN** no record has been produced for a source
- **THEN** that source is not offered as a channel

#### Scenario: Bounded memory

- **WHEN** more records arrive than the buffer holds
- **THEN** the oldest are dropped and the newest are kept

#### Scenario: Logging disabled

- **WHEN** logging is turned off in settings
- **THEN** the panel collects nothing and says so, rather than appearing broken

#### Scenario: The file is still there

- **WHEN** the user needs more than the buffer holds
- **THEN** the panel points at the log file, which keeps the full history


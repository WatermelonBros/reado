## ADDED Requirements

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

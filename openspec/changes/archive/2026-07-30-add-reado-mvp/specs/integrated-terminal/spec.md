## ADDED Requirements

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

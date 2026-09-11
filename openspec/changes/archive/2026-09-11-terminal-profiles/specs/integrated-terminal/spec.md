## ADDED Requirements

### Requirement: Named Terminal Profiles

Reado SHALL let the user define named terminal profiles — a command, its
arguments and optional environment — and open a terminal from any of them. One
profile SHALL be the default used by the ordinary "new terminal" action, and with
no profiles defined the terminal SHALL open the user's login shell exactly as it
does today.

#### Scenario: Opening a profile

- **WHEN** the user chooses a profile from the new-terminal control
- **THEN** a terminal opens running that profile's command, titled with its name

#### Scenario: The default profile

- **WHEN** the user opens a terminal without choosing a profile
- **THEN** the default profile runs, or the login shell if none is set

#### Scenario: Existing shell setting

- **WHEN** a user who had configured a custom shell upgrades
- **THEN** that shell is the default profile and their terminals are unchanged

#### Scenario: Two terminals from one profile

- **WHEN** the user opens the same profile twice
- **THEN** both terminals are named after it and can still be told apart

### Requirement: Run Selected Text In Terminal

Reado SHALL send the editor's current selection to the focused terminal on a
single command, and SHALL send the cursor's line when nothing is selected.

#### Scenario: Running a selection

- **WHEN** the user selects a command in a file and runs "Run Selected Text in
  Terminal"
- **THEN** that text is written to the focused terminal and executed

#### Scenario: No selection

- **WHEN** nothing is selected
- **THEN** the line under the cursor is sent

#### Scenario: No terminal open

- **WHEN** no terminal is open
- **THEN** one is opened and the text is sent to it

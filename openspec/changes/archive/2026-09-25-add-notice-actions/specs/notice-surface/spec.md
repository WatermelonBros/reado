## ADDED Requirements

### Requirement: A notice may offer one action

A notice SHALL be able to carry one action, a label and what it does. The toast SHALL
show the label as a button; choosing it SHALL run the action and dismiss that toast.
A notice without an action SHALL look and behave as before.

#### Scenario: Choosing the action

- **WHEN** a notice "Luca assigned you a comment" carries the action "Open"
- **AND** the person chooses "Open"
- **THEN** the action runs and the toast is dismissed

#### Scenario: No action

- **WHEN** a notice is raised without an action
- **THEN** the toast shows only its text and the dismiss button

## ADDED Requirements

### Requirement: Explain Selection
The user SHALL be able to ask the focused agent to explain the selected code; the
request SHALL include the selection and its file/line context and be injected
into the focused terminal pane.

#### Scenario: Explain a selection
- **WHEN** the user invokes "Explain selection" with code selected
- **THEN** a prompt asking the agent to explain that code (with its file:line
  context) is submitted to the focused agent terminal

#### Scenario: No selection
- **WHEN** "Explain selection" is invoked with no selection
- **THEN** it explains the symbol/line at the cursor instead (or is disabled)

### Requirement: Optional Anchored Note
Reado SHALL offer to capture the explanation as a `note` comment anchored to the
selection via the `reado` CLI, so it can persist in the overlay and knowledge
base; capturing is the user's choice.

#### Scenario: Capture as note
- **WHEN** the user chooses to capture the explanation
- **THEN** the prompt instructs the agent to record it as a `note` anchored to the
  selected lines

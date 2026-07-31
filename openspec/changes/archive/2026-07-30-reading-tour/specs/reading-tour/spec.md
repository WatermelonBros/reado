## ADDED Requirements

### Requirement: Tour Data Model
Reado SHALL persist a reading tour as an ordered sequence of steps, where each
step has a code anchor (a project-relative file path with an optional line or
line range) and a short prose note, alongside a tour title and description.
Tours SHALL be stored as JSON files under the project's `.reado/tours/`
directory so they are shareable and may optionally be committed.

#### Scenario: Persist a tour
- **WHEN** a tour with ordered, anchored steps is saved
- **THEN** it is written as a JSON file under `.reado/tours/` and reloads with
  its steps in the same order on the next session

#### Scenario: Step anchor resolves to a region
- **WHEN** a step anchored to a file and line range is opened
- **THEN** that file is shown and scrolled to the anchored region

### Requirement: Step-Through Navigation
Reado SHALL provide a calm step-through reader that presents one tour step at a
time, showing the step's note and offering next and previous navigation, and
revealing the step's file and region in the editor when the step becomes active.

#### Scenario: Advance through a tour
- **WHEN** the reader shows a step and the user invokes "next"
- **THEN** the following step's note is shown and its file/region is revealed in
  the editor

#### Scenario: Note is shown with the step
- **WHEN** a step becomes active
- **THEN** that step's note is displayed alongside its revealed code

#### Scenario: Bounds are honest
- **WHEN** the user is on the first or last step
- **THEN** the corresponding previous or next control is unavailable rather than
  wrapping or silently doing nothing

### Requirement: AI-Generated Tour
Reado SHALL generate a reading tour only on an explicit user trigger, dispatching
a request to the terminal AI agent to propose a tour for the repository or a
named feature, and writing the proposed tour as an editable tour artifact for
review.

#### Scenario: Explicit generation
- **WHEN** the user triggers "generate tour" for the repo or a feature
- **THEN** a request is sent to the AI agent and the proposed tour is saved as an
  editable tour the user can review and adjust

#### Scenario: Never silent
- **WHEN** no user trigger has occurred
- **THEN** no tour is generated automatically

### Requirement: Manual Tour Authoring
Reado SHALL let a user create a tour, add a step anchored to the current
selection or open file, edit each step's note, reorder and remove steps, and
delete a tour.

#### Scenario: Create and add a step
- **WHEN** the user creates a tour and adds a step from the current selection
- **THEN** a step anchored to that file and region is appended with an editable
  note

#### Scenario: Reorder and remove
- **WHEN** the user reorders or removes a step
- **THEN** the tour's step sequence updates accordingly and persists

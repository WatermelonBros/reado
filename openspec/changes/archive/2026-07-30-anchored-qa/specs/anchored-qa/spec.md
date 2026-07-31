## ADDED Requirements

### Requirement: Ask About Selection
Reado SHALL provide an explicit "Ask about selection" action that lets the user
type a natural-language question about the current code selection; the request
SHALL include the selection and its file/line context so the AI answers grounded
in that code. The action SHALL never trigger silently — it requires an explicit
invocation and a question.

#### Scenario: Ask a question about a selection
- **WHEN** the user invokes "Ask about selection" with code selected and types a
  question
- **THEN** a prompt embedding that code (with its `file:line` context) and the
  question is submitted to the focused AI agent, which answers using the code as
  context

#### Scenario: No selection
- **WHEN** "Ask about selection" is invoked with no selection
- **THEN** it targets the symbol/line at the cursor instead, or the action is
  disabled

#### Scenario: No question entered
- **WHEN** the user dismisses the question input without entering a question
- **THEN** no request is sent and no note is created

### Requirement: Persist Q&A As Anchored Note
Reado SHALL persist each answered question as a durable `qa` note anchored to the
selection, stored as a single `.md` file under `.reado/` reusing the comment file
schema, with front-matter recording the kind `qa`, the question, the answer, the
anchor (file and line range), and a context snapshot. The `.md` file SHALL be the
source of truth and SHALL survive across sessions.

#### Scenario: Q&A is saved anchored to the code
- **WHEN** the AI returns an answer for an asked question
- **THEN** a `qa` `.md` note is written under `.reado/` anchored to the selected
  lines, capturing both the question and the answer

#### Scenario: Distinct from a task comment
- **WHEN** a `qa` note is stored
- **THEN** it is marked as a note (not a task for the agent to resolve) and is
  not dispatched in "Send Review"

### Requirement: Anchored Q&A Tracking
A `qa` note SHALL participate in the existing anchoring and orphan-awareness
model, tracking its code across edits and being flagged orphaned when its anchor
can no longer be located, consistent with other anchored comments.

#### Scenario: Anchor follows edits
- **WHEN** the file is edited above or around a `qa` note's anchored lines
- **THEN** the note's anchor is updated to keep pointing at the same code

#### Scenario: Lost anchor
- **WHEN** the anchored code for a `qa` note can no longer be located
- **THEN** the note is flagged as orphaned and remains revisitable

### Requirement: Revisit Anchored Q&A
Reado SHALL let the user revisit saved Q&A notes: each note SHALL render on the
file it anchors to (gutter/overlay) and SHALL be listable in the Comments
side-panel surface, where opening a note shows the original question and the
saved answer.

#### Scenario: Open from the overlay
- **WHEN** the user opens a `qa` note from its gutter/overlay marker
- **THEN** the original question and the saved answer are shown for that code

#### Scenario: Browse the list
- **WHEN** the user views the Comments side-panel filtered to Q&A notes
- **THEN** the project's `qa` notes are listed and each can be opened to its
  anchored code with its question and answer

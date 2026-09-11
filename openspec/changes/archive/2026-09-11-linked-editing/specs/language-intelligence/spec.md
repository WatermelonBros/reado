## ADDED Requirements

### Requirement: Linked Editing

Where the language server reports that the range under the cursor is linked to
others (`textDocument/linkedEditingRange`), Reado SHALL apply edits made inside
that range to its linked ranges in the same transaction, and SHALL mark the
linked ranges while the link is live.

#### Scenario: Renaming an HTML tag

- **WHEN** the user edits the name in an opening tag
- **THEN** the matching closing tag changes with it

#### Scenario: One undo

- **WHEN** the user undoes after a linked edit
- **THEN** both ranges return to their previous text in one step

#### Scenario: Editing outside the range

- **WHEN** an edit starts inside the linked range and extends beyond it
- **THEN** nothing is mirrored and the link is dropped

#### Scenario: No server support

- **WHEN** the server does not advertise linked editing ranges
- **THEN** no request is made and typing behaves as it does today

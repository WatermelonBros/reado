## ADDED Requirements

### Requirement: Document Links

Where the language server offers `textDocument/documentLink`, Reado SHALL present
the ranges it reports as links in the editor and SHALL open their targets on
activation: a file target in the editor, a web target in the browser pane.

#### Scenario: A path in a config file

- **WHEN** the server reports the value of a path field as a document link
- **THEN** activating it opens that file in the editor

#### Scenario: Lazily resolved target

- **WHEN** the server reports a link with no target
- **THEN** the target is resolved when the link is activated, and then opened

#### Scenario: Unopenable target

- **WHEN** a link's target cannot be opened
- **THEN** Reado says so, naming the target

#### Scenario: No server support

- **WHEN** the server does not offer document links
- **THEN** Reado's own link resolution applies, as it does today

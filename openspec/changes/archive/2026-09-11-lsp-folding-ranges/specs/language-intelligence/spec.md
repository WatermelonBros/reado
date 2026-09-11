## ADDED Requirements

### Requirement: Server Folding Ranges

Where the language server offers `textDocument/foldingRange`, Reado SHALL use the
regions it reports for folding, and SHALL fall back to syntax-tree folding for
lines the server does not report.

#### Scenario: Folding an import block

- **WHEN** a file opens whose server reports the import block as a folding range
- **THEN** the block can be folded from the gutter as one region

#### Scenario: Syntax folding still works

- **WHEN** the cursor is on a line the server reports no region for
- **THEN** the syntax tree's own folding still applies

#### Scenario: No server

- **WHEN** no server is attached to the file
- **THEN** folding behaves exactly as it does today

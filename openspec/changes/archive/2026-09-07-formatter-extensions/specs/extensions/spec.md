## ADDED Requirements

### Requirement: Formatter extension kind

Reado SHALL support a `formatter` extension kind. A formatter contribution
SHALL declare the file extensions and language ids it serves, how the formatter
is invoked over stdin/stdout, the evidence that proves a project uses it
(configuration file patterns, and manifest dependency or config keys), a
relative preference among formatters serving the same file type, and
per-platform install instructions. Formatter manifests SHALL come only from the
curated registry, on the same grounds as `language-server`: the manifest names a
program Reado will spawn.

#### Scenario: A formatter contribution is registered

- **WHEN** the curated registry contains an extension with `kind: "formatter"`
  and a valid contribution block
- **THEN** Reado registers it and shows it in the marketplace's formatters
  section

#### Scenario: The bundled formatters are extensions

- **WHEN** the system loads
- **THEN** the formatters previously compiled into the backend table (Biome,
  Prettier, rustfmt, gofmt, Ruff, Black, RuboCop, shfmt) are present as bundled
  formatter extensions

#### Scenario: A formatter manifest cannot name an arbitrary command

- **WHEN** a formatter manifest declares a program that is not in the backend's
  allowlist for its extension id
- **THEN** Reado refuses to spawn it and reports the extension as unusable

### Requirement: Project detection is a manifest concern

Reado SHALL evaluate each enabled formatter extension's declared evidence
against the open project and expose the result as part of the extension's
status, so the user can see which formatters this project actually declares.

#### Scenario: Detection status is visible

- **WHEN** the user opens the marketplace with a Biome project open
- **THEN** the Biome extension is marked as used by this project and the
  Prettier extension is not

#### Scenario: Detection follows the open project

- **WHEN** the user switches to a project with different formatter
  configuration
- **THEN** the detection status updates for the newly opened project without a
  restart

## ADDED Requirements

### Requirement: Declarative extension manifest

An extension SHALL be described by a declarative manifest — id, name,
description, version, `kind`, and kind-specific contributions — and SHALL NOT
contain or reference executable extension code. Reado SHALL ignore an extension
whose manifest is malformed or whose `kind` it does not support, without
failing.

#### Scenario: A supported manifest is registered

- **WHEN** the registry contains an extension with `kind: "language-server"` and
  a valid contribution block
- **THEN** Reado registers it as available and shows it in the marketplace

#### Scenario: An unsupported kind is ignored

- **WHEN** an extension declares a `kind` this version does not support
- **THEN** Reado skips it without error and the rest of the registry still loads

### Requirement: Curated registry

Reado SHALL obtain the list of available extensions from a curated, versioned
registry it controls. A manifest's declared executable command (e.g. a language
server binary) SHALL come only from this curated source, never from arbitrary
user- or web-supplied input, so the marketplace cannot be used to run an
attacker-chosen command.

#### Scenario: Marketplace is populated from the registry

- **WHEN** the user opens the marketplace
- **THEN** Reado lists the registry's extensions, each with its install state

#### Scenario: Registry is unreachable

- **WHEN** the registry cannot be fetched
- **THEN** the marketplace shows the already-installed extensions and a quiet,
  non-blocking notice that the catalogue is unavailable

### Requirement: Marketplace sidebar tool

Reado SHALL provide a marketplace as a sidebar tool that lists available and
installed extensions with their status — installed / enabled / disabled / not
found — and offers install, enable, and disable actions. The installed and
enabled state SHALL be persisted per user.

#### Scenario: Status is shown per extension

- **WHEN** a language-server extension is installed and its binary resolves on
  the user's PATH
- **THEN** the marketplace marks it installed and enabled

#### Scenario: Disable is honoured

- **WHEN** the user disables an installed extension
- **THEN** Reado stops using its contributions, and the state survives a restart

### Requirement: Language-server extensions

Language servers SHALL be contributed by extensions rather than a hardcoded
list. A language-server contribution SHALL declare the server command and args,
the file extensions and LSP language ids it handles, and per-platform install
instructions. When a file of a contributed, enabled, installed language opens,
Reado SHALL start that server for the project.

#### Scenario: Opening a file starts the contributed server

- **WHEN** a `.py` file opens, a Python language-server extension is enabled,
  and its server resolves on PATH
- **THEN** Reado starts that server for the project and the file gets LSP
  features

#### Scenario: The built-in servers are extensions

- **WHEN** the system loads
- **THEN** the previously hardcoded servers (TypeScript, Rust, Python, Go,
  C/C++, Bash) are present as bundled language-server extensions

### Requirement: Detection on the login-shell PATH

Reado SHALL determine whether a contributed server's binary is available using
the user's login-shell PATH, not the minimal PATH a GUI application inherits
when launched from the desktop. The resolved PATH SHALL be reused for the app
session.

#### Scenario: A server installed via a version manager is detected

- **WHEN** a server was installed into a directory only present in the login
  shell's PATH (e.g. an nvm or cargo bin dir)
- **THEN** Reado detects it as installed even though the app was launched from
  the Finder

### Requirement: Guided install

The marketplace SHALL install a language server by running the extension's
declared install command in the integrated terminal, so the user sees the
output and the user's own package managers are used. After the command, the
marketplace SHALL re-check and reflect the new status.

#### Scenario: Install from the marketplace

- **WHEN** the user clicks Install on a not-found language-server extension
- **THEN** Reado runs its declared install command in a terminal, and once it
  succeeds the extension shows as installed

#### Scenario: Missing prerequisite is surfaced

- **WHEN** an install command needs a toolchain the user lacks (e.g. Go)
- **THEN** the marketplace shows the prerequisite for that extension up front

### Requirement: PATH resolution for spawning

Reado SHALL spawn language servers using the resolved login-shell PATH so that a
packaged application finds servers installed via npm, cargo, go, brew, and
similar, not only those on the default system PATH.

#### Scenario: Packaged app spawns a PATH-installed server

- **WHEN** the packaged app starts a server whose binary lives in a login-shell
  PATH directory
- **THEN** the spawn succeeds instead of failing with "not found"

### Requirement: Safe by default

The extension system SHALL NOT execute extension-provided code. The only
actions it performs on an extension's behalf are spawning a server binary named
by a curated manifest and running a declared install command that the user
initiates. Disabled or uninstalled extensions SHALL contribute nothing.

#### Scenario: No code execution from a manifest

- **WHEN** any extension is installed or enabled
- **THEN** Reado runs none of its content as code; it only spawns the curated
  server binary on demand and the user-initiated install command

### Requirement: Graceful absence

Reado SHALL fall back to the existing index-based navigation, with no error
shown, when a contributed server for an open file is not installed or its
extension is disabled.

#### Scenario: No server present

- **WHEN** a file opens whose language has a contributed server that is not
  installed
- **THEN** index-based Go to Definition still works and no error is shown

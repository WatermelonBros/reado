# extensions Specification

## Purpose
TBD - created by archiving change extension-system. Update Purpose after archive.
## Requirements
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

Reado SHALL draw extensions from two sources with different trust levels, and
SHALL choose the source by what the extension is allowed to do.

Any extension kind that causes Reado to **spawn a process** — `language-server`,
`formatter` — SHALL come only from a curated, versioned registry the project
controls, never from arbitrary user- or web-supplied input, so the marketplace
cannot be used to run an attacker-chosen command.

Extension kinds that contribute **only data** MAY additionally come from the
Open VSX registry, because nothing in them is executed. Reado SHALL treat every
Open VSX extension as untrusted input, subject to the classification,
verification and confinement requirements below.

#### Scenario: Marketplace is populated from the registry

- **WHEN** the user opens the marketplace
- **THEN** Reado lists the curated registry's extensions, each with its install
  state

#### Scenario: Declarative extensions are listed from Open VSX too

- **WHEN** the user opens the marketplace
- **THEN** Reado additionally lists Open VSX results for the declarative kinds,
  each with its install state and its source

#### Scenario: Registry is unreachable

- **WHEN** a registry cannot be fetched
- **THEN** the marketplace shows the already-installed extensions and a quiet,
  non-blocking notice that the catalogue is unavailable

#### Scenario: An executable kind is never taken from Open VSX

- **WHEN** an Open VSX extension declares a language server or formatter
  contribution
- **THEN** Reado does not register that contribution, regardless of the
  extension's other contents

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

### Requirement: Extensions are classified before download

Reado SHALL determine what an extension contributes from its published
manifest, before downloading its package. An extension SHALL be classified as:

- **fully supported** — it declares no code entry point, no extension
  dependencies and no extension pack, and declares at least one contribution
  kind Reado supports;
- **partially supported** — it declares a code entry point but also at least one
  supported contribution kind; Reado uses the contributions and never loads the
  code;
- **unsupported** — it declares no supported contribution kind.

Unsupported extensions SHALL NOT appear in the marketplace at all. Reado shows
what it can install; a browsable list of things it cannot is noise. Partially
supported extensions SHALL be installable and SHALL state, once, what of theirs
Reado will not run.

#### Scenario: A theme installs fully

- **WHEN** the user installs an extension that contributes only colour themes
- **THEN** it is marked fully supported and everything it contributes works

#### Scenario: A code extension with usable data installs partially

- **WHEN** the user installs an icon theme extension that also ships commands
  and a code entry point
- **THEN** Reado installs the icon theme, runs none of its code, and states that
  its commands and settings are unavailable

#### Scenario: A pure code extension never appears

- **WHEN** search matches an extension whose only contributions require running
  code
- **THEN** it is absent from the results

#### Scenario: Classification costs one metadata request

- **WHEN** search results are shown
- **THEN** the tier is derived from published metadata, without downloading any
  package

### Requirement: Supported contribution kinds

Reado SHALL recognise a fixed whitelist of contribution keys from an
extension's manifest — colour themes, icon themes, snippets, and language
configuration — and SHALL ignore every other key without error. Adding a key to
the whitelist SHALL be a deliberate change, so an extension can never widen its
own reach by declaring something new.

#### Scenario: Unknown contributions are ignored

- **WHEN** an installed extension declares commands, menus, keybindings, views,
  debuggers or settings
- **THEN** Reado ignores them and the extension's whitelisted contributions
  still work

#### Scenario: An extension with several supported kinds contributes all of them

- **WHEN** an extension contributes both colour themes and snippets
- **THEN** both are registered from the single installed extension

### Requirement: Safe acquisition and confined unpacking

Reado SHALL download and unpack extension packages in the backend, never in the
webview. Acquisition SHALL: use HTTPS; verify the package against the checksum
the registry publishes when one is available; enforce a maximum download size, a
maximum total uncompressed size, and a maximum entry count; reject any archive
entry whose path escapes the extension's own directory or is absolute or a
symbolic link; and write only inside a per-extension directory under Reado's
application data. A failed or partial install SHALL leave no registered
extension and no partial directory behind.

Nothing extracted from a package SHALL ever be executed, marked executable, or
placed on any PATH.

#### Scenario: A malicious archive path is rejected

- **WHEN** a package contains an entry that resolves outside the extension
  directory
- **THEN** the install is aborted, nothing is written outside the directory, and
  the extension is reported as rejected

#### Scenario: A decompression bomb is refused

- **WHEN** a package's uncompressed size or entry count exceeds the caps
- **THEN** extraction stops, the partial directory is removed, and the failure is
  reported

#### Scenario: A truncated download is not installed

- **WHEN** the download fails midway or fails checksum verification
- **THEN** no extension is registered and the user may retry

#### Scenario: The webview issues no registry traffic

- **WHEN** the user searches and installs an extension
- **THEN** every registry API call and every package download originates in the
  backend, and the webview makes none — an extension's listed icon is an
  ordinary image load, permitted by the policy already in force

### Requirement: Confined asset access

Assets an extension contributes — icons, fonts, images referenced by its
manifest — SHALL be readable by the interface only through a path-confined
accessor that resolves within that extension's own directory and rejects
traversal. An extension SHALL NOT be able to cause Reado to read a file outside
its directory.

#### Scenario: An icon renders

- **WHEN** an installed icon theme references an image inside its package
- **THEN** the file tree renders that image

#### Scenario: Traversal is refused

- **WHEN** a manifest references a path that resolves outside the extension
  directory
- **THEN** the read is refused and the interface falls back to its built-in
  asset

### Requirement: Malformed contributions degrade, never crash

Contribution files SHALL be parsed tolerantly — the JSON in these packages
commonly carries comments and trailing commas — and a contribution that is
malformed, references a missing file, or fails to map onto Reado's model SHALL
be skipped with a recorded reason while the extension's remaining contributions
continue to work.

#### Scenario: One broken theme in a theme pack

- **WHEN** an extension contributes several themes and one file fails to parse
- **THEN** the other themes remain selectable and the failure is reported for
  that one theme

#### Scenario: Comments in a contribution file

- **WHEN** a contribution file contains comments or trailing commas
- **THEN** Reado parses it successfully

### Requirement: Colour theme contributions

An installed, enabled extension's colour themes SHALL appear alongside Reado's
built-in themes and be selectable in every theme-selection mode. Reado SHALL map
a defined subset of the theme's interface colours onto its own semantic palette
and SHALL derive any token the theme leaves unspecified from the theme's
declared light or dark base, so the whole interface stays coherent rather than
partly themed. Syntax colours SHALL be applied by mapping the theme's token
scopes onto Reado's highlighting tags; scopes with no mapping SHALL fall back to
the derived base.

#### Scenario: An imported theme applies to the whole interface

- **WHEN** the user selects a theme contributed by an extension
- **THEN** the editor, sidebar, panels and status surfaces all follow it, with no
  element left on the previous theme

#### Scenario: A sparse theme is completed, not broken

- **WHEN** a contributed theme specifies only a few interface colours
- **THEN** Reado derives the rest from its declared base and the interface stays
  legible

#### Scenario: An uninstalled theme does not strand the user

- **WHEN** the active theme's extension is disabled or uninstalled
- **THEN** Reado falls back to a built-in theme of the same light/dark polarity
  and says why

### Requirement: Icon theme contributions

An installed, enabled extension's icon themes SHALL be selectable and SHALL
drive the file tree's file and folder icons, resolved by file name, extension,
and language id, with distinct open and closed folder icons where the theme
provides them. Reado's built-in icons SHALL be used for anything the theme does
not define.

#### Scenario: Icons follow the selected theme

- **WHEN** the user selects a contributed icon theme
- **THEN** the file tree shows that theme's icons for known file types and
  folders

#### Scenario: Unknown file types keep a sensible icon

- **WHEN** a file's type is not defined by the selected icon theme
- **THEN** Reado shows its own default icon rather than nothing

### Requirement: Snippet contributions

An installed, enabled extension's snippets SHALL be offered in the editor's
completions for the languages they declare, with placeholders and tab stops
honoured. Snippet syntax Reado cannot represent SHALL be reduced to plain text
rather than inserted literally, so a snippet never leaves markup in the
document.

#### Scenario: A snippet completes with tab stops

- **WHEN** the user accepts a contributed snippet in a matching file
- **THEN** its text is inserted and the cursor moves through its placeholders

#### Scenario: An unsupported snippet variable does not leak

- **WHEN** a snippet body uses a variable Reado does not support
- **THEN** the variable is substituted or removed, and no placeholder syntax
  appears in the document

#### Scenario: Snippets are scoped to their language

- **WHEN** a snippet declares a language
- **THEN** it is offered only in files of that language

### Requirement: Language configuration contributions

An installed, enabled extension's language configuration SHALL supply, for the
languages it declares, the line and block comment tokens used by comment
toggling and the auto-closing pairs used while typing. A contributed
configuration SHALL NOT override a built-in language pack's own behaviour where
one exists. Bracket matching is out of scope here: the editor already matches
brackets in every file, contributed language or not.

#### Scenario: Comment toggling learns a new language

- **WHEN** an extension contributes language configuration for a file type Reado
  had no comment tokens for
- **THEN** comment toggling works in those files

#### Scenario: Built-ins win

- **WHEN** a contributed configuration covers a language Reado already supports
  with a built-in language pack
- **THEN** the built-in behaviour is unchanged

### Requirement: Search shows only installable extensions

The marketplace SHALL let the user search Open VSX by text and page through
results, and SHALL show only extensions Reado can install. Each result SHALL
carry its name, publisher, description, icon, and whether its publisher
namespace is verified.

#### Scenario: Finding a theme by name

- **WHEN** the user searches for a theme by name
- **THEN** matching installable extensions are listed with enough information to
  identify the right publisher

#### Scenario: A query with nothing installable says so

- **WHEN** a query matches only unsupported extensions
- **THEN** the marketplace reports that nothing installable matched

#### Scenario: Search fails

- **WHEN** the registry cannot be reached during a search
- **THEN** the marketplace reports it quietly and the installed list stays usable

### Requirement: Update and uninstall

Reado SHALL show when an installed extension has a newer published version and
SHALL let the user update it. Uninstalling an extension SHALL remove its
directory and all of its registered contributions, and SHALL be exact — unlike
an externally installed language server, a declarative extension lives entirely
in a directory Reado owns. Disabling SHALL keep the files but register nothing,
and SHALL survive a restart.

#### Scenario: Updating an extension

- **WHEN** an installed extension has a newer version and the user updates it
- **THEN** the new version's contributions replace the old ones and the previous
  version's files are removed

#### Scenario: Uninstall is complete

- **WHEN** the user uninstalls an extension
- **THEN** its directory is gone, none of its contributions remain registered,
  and the interface no longer references it

#### Scenario: A failed update does not lose the working version

- **WHEN** an update fails to download or verify
- **THEN** the previously installed version remains installed and enabled

### Requirement: Grammar contributions

Reado SHALL add TextMate grammars to the contribution whitelist. An installed,
enabled extension's grammars SHALL be registered for the languages and file
types they declare, acquired and confined through the same install path as every
other contribution, and SHALL contribute nothing when the extension is disabled
or uninstalled. Grammar embedding — a grammar that includes another by
reference — SHALL resolve against grammars contributed by installed extensions,
and an unresolved reference SHALL leave the embedded region unhighlighted rather
than failing the file.

#### Scenario: A grammar-only language extension works

- **WHEN** the user installs an extension whose only contribution is a grammar
  and a language declaration, and opens a matching file
- **THEN** the file is highlighted

#### Scenario: Disabling removes highlighting, not the file

- **WHEN** the user disables the extension providing a file's grammar
- **THEN** the file falls back to plain readable text without error

#### Scenario: An unresolved embedded grammar is contained

- **WHEN** a grammar embeds another that no installed extension provides
- **THEN** the embedded regions render unhighlighted and the rest of the file is
  highlighted normally

### Requirement: Bounded tokenization

Grammar tokenization SHALL be bounded by construction, because grammar patterns
arrive from untrusted packages and can backtrack catastrophically. Reado SHALL
enforce a per-line time budget, a maximum line length beyond which a line is not
tokenized, and a work window tied to the visible region, and SHALL abandon
tokenization to plain text rather than block the interface. Abandoning SHALL be
reported quietly and SHALL be attributable to the extension responsible.

#### Scenario: A pathological pattern does not freeze the editor

- **WHEN** a grammar pattern exceeds the per-line time budget
- **THEN** tokenization for that line is abandoned, the editor stays responsive,
  and the file remains readable as text

#### Scenario: Large files stay responsive

- **WHEN** the user opens a file of several thousand lines highlighted by a
  contributed grammar
- **THEN** scrolling and navigation remain responsive, because tokenization is
  limited to the visible region and its lookahead

#### Scenario: Very long lines are left alone

- **WHEN** a line exceeds the maximum tokenized length (a minified bundle, an
  embedded blob)
- **THEN** that line renders as plain text and the rest of the file is
  highlighted

### Requirement: Contributed themes colour by scope

Where a file is highlighted by a contributed grammar, a contributed colour
theme's token rules SHALL be applied by matching the theme's scope selectors
against the grammar's scopes, with the most specific matching rule winning.
Where a file is highlighted by a language pack, Reado SHALL continue to apply the
theme through its highlighting-tag mapping.

#### Scenario: A theme's syntax colours apply exactly

- **WHEN** a contributed theme and a contributed grammar are both active for a
  file
- **THEN** each token takes the colour the theme specifies for its most specific
  matching scope

#### Scenario: A scope the theme does not style

- **WHEN** a token's scopes match no rule in the active theme
- **THEN** it takes the theme's default foreground rather than being left
  unstyled


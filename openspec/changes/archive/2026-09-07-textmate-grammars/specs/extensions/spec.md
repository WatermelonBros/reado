## ADDED Requirements

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

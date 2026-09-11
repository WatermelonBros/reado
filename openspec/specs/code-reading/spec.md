# code-reading Specification

## Purpose
TBD - created by archiving change add-reado-mvp. Update Purpose after archive.
## Requirements
### Requirement: Read-First Code Viewer
Reado SHALL render code in a CodeMirror 6 viewer optimized for reading, with the default view showing only the code (no diff, no inline AI activity).

#### Scenario: Default view is clean code
- **WHEN** the user opens a code file
- **THEN** the file is shown as syntax-highlighted, readable code with no diff or AI overlay by default

### Requirement: Syntax Highlighting

Reado SHALL provide syntax highlighting via CodeMirror/Lezer language packs
across a broad range of languages. Where a file's language has no language
pack and an installed, enabled extension contributes a TextMate grammar for it,
Reado SHALL highlight the file from that grammar. A language pack SHALL always
take precedence over a contributed grammar, so the syntax tree that drives the
outline, focus block, syntax-aware selection and nesting cues is never traded
away for colour.

#### Scenario: Highlight a supported language
- **WHEN** the user opens a file in a language with a CodeMirror language pack
- **THEN** the code is highlighted according to the active theme

#### Scenario: Highlight from a contributed grammar
- **WHEN** the user opens a file whose language has no language pack but has a
  grammar contributed by an installed, enabled extension
- **THEN** the code is highlighted according to the active theme

#### Scenario: A language pack wins over a contributed grammar
- **WHEN** an extension contributes a grammar for a language Reado already has a
  language pack for
- **THEN** the language pack continues to provide highlighting and the syntax
  tree, and the grammar is not used

#### Scenario: Unknown language degrades gracefully
- **WHEN** the user opens a file whose language has neither a language pack nor
  a contributed grammar
- **THEN** the file is shown as plain readable text without error

### Requirement: Large File Performance
Reado SHALL render large files without perceptible lag by virtualizing rendering to visible lines only.

#### Scenario: Open a large file
- **WHEN** the user opens a file of several thousand lines
- **THEN** scrolling and navigation remain responsive

### Requirement: Focus Mode
Reado SHALL provide a focus mode that visually dims code not relevant to the current reading context.

#### Scenario: Enable focus mode
- **WHEN** the user enables focus mode while reading a function
- **THEN** unrelated code is dimmed and the focused region stays prominent

### Requirement: Comfortable Reading Width
Reado SHALL support a comfortable reading width for long-form reading rather than forcing full-viewport line lengths.

#### Scenario: Reading width applied
- **WHEN** comfortable reading width is enabled
- **THEN** content is constrained to a comfortable measure

### Requirement: Breadcrumb and Landing Highlight
When navigating to a comment or symbol, Reado SHALL show a path breadcrumb and briefly highlight the landing line with a fading emphasis.

#### Scenario: Jump to a location
- **WHEN** the user jumps to a comment or definition
- **THEN** a breadcrumb shows the file/symbol path
- **AND** the target line is softly highlighted, then fades

### Requirement: Line Wrap Toggle

Reado SHALL default code line wrapping to off, with a quick toggle to enable it,
and SHALL let the user choose where a wrapped line breaks: at the editor's edge
(the default) or at a fixed column.

#### Scenario: Toggle wrap

- **WHEN** the user toggles line wrap on for a file with long lines
- **THEN** long lines wrap instead of scrolling horizontally

#### Scenario: Wrap at a column

- **WHEN** wrap is on and the user sets the wrap column to 120
- **THEN** lines break at 120 characters however wide the window is

#### Scenario: Column zero means the edge

- **WHEN** the wrap column is 0
- **THEN** lines wrap at the editor's edge, as they always have

#### Scenario: The setting applies to open files

- **WHEN** the wrap column changes while a file is open
- **THEN** that file re-wraps without being reopened

### Requirement: Non-Code File Rendering
Reado SHALL render non-code files with type-appropriate viewers: formatted markdown, images, and foldable JSON, allowing comments where anchoring is meaningful.

#### Scenario: Render markdown
- **WHEN** the user opens a markdown file
- **THEN** it is shown formatted, and comments can be anchored within it

#### Scenario: Render an image
- **WHEN** the user opens an image file
- **THEN** the image is displayed

### Requirement: Optional Manual Editing
Reado SHALL allow manual editing of code while keeping reading as the primary, prioritized experience.

#### Scenario: Make a manual edit
- **WHEN** the user edits a file directly in the viewer
- **THEN** the change is written to the file like a normal editor save

### Requirement: Occurrence Highlight
The editor SHALL subtly highlight every occurrence of the identifier under the
cursor within the current file, using a muted theme colour.

#### Scenario: Highlight on cursor rest
- **WHEN** the cursor is on or beside an identifier
- **THEN** all other occurrences of that identifier in the file are highlighted

#### Scenario: Clear when irrelevant
- **WHEN** the cursor moves off any identifier
- **THEN** no occurrence highlight is shown

### Requirement: Syntax-Aware Selection
The editor SHALL let the user expand and shrink the selection by syntax node.

#### Scenario: Expand selection
- **WHEN** the user invokes "expand selection"
- **THEN** the selection grows to the enclosing syntax node (and shrinks back on
  the inverse command)

### Requirement: Nesting Cues
The editor SHALL show indentation guides and colourize matching bracket pairs,
using quiet theme colours.

#### Scenario: Guides and bracket pairs
- **WHEN** a file with nested blocks is open
- **THEN** indentation guides are visible and matching brackets share a colour

### Requirement: Outline Follows Cursor
The Outline panel SHALL highlight the symbol that contains the cursor.

#### Scenario: Cursor inside a function
- **WHEN** the cursor is inside a function listed in the Outline
- **THEN** that Outline entry is highlighted as the current symbol

### Requirement: Column Selection Mode

Reado SHALL offer a column selection mode that persists until it is turned off.
While it is on, a plain drag in the editor SHALL select a rectangle rather than a
run of text, and the mode SHALL be visible in the status bar. Alt-drag SHALL
select a rectangle whether the mode is on or off.

#### Scenario: Drag selects a rectangle

- **WHEN** column selection mode is on and the user drags across several lines
- **THEN** the selection is a rectangle — one cursor per line, the same columns

#### Scenario: The mode is visible

- **WHEN** column selection mode is on
- **THEN** the status bar shows it, and selecting that indicator turns it off

#### Scenario: The mode survives the file

- **WHEN** the user switches file or reopens the project with the mode on
- **THEN** the mode is still on

### Requirement: Keyboard Column Cursors

Reado SHALL let the user grow a rectangular selection from the keyboard, without
the pointer and without turning column selection mode on.

#### Scenario: Extend the rectangle down

- **WHEN** the user presses the column-cursor-down shortcut
- **THEN** a cursor is added on the line below at the same column, with the
  existing cursors kept

#### Scenario: Widen every cursor

- **WHEN** the user presses the column-cursor-right shortcut with several cursors
- **THEN** every cursor extends its selection by one character


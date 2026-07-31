## ADDED Requirements

### Requirement: Read-First Code Viewer
Reado SHALL render code in a CodeMirror 6 viewer optimized for reading, with the default view showing only the code (no diff, no inline AI activity).

#### Scenario: Default view is clean code
- **WHEN** the user opens a code file
- **THEN** the file is shown as syntax-highlighted, readable code with no diff or AI overlay by default

### Requirement: Syntax Highlighting
Reado SHALL provide syntax highlighting via CodeMirror/Lezer language packs across a broad range of languages.

#### Scenario: Highlight a supported language
- **WHEN** the user opens a file in a language with a CodeMirror language pack
- **THEN** the code is highlighted according to the active theme

#### Scenario: Unknown language degrades gracefully
- **WHEN** the user opens a file whose language has no language pack
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
Reado SHALL default code line wrapping to off, with a quick toggle to enable it.

#### Scenario: Toggle wrap
- **WHEN** the user toggles line wrap on for a file with long lines
- **THEN** long lines wrap instead of scrolling horizontally

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

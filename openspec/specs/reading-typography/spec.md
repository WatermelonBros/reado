# reading-typography Specification

## Purpose
TBD - created by archiving change reading-typography. Update Purpose after archive.
## Requirements
### Requirement: Adjustable letter spacing

Reado SHALL let the reader adjust the letter spacing of the code surface, and
SHALL apply that spacing to every view that renders code.

#### Scenario: Spacing applies across code surfaces

- **WHEN** the reader sets a non-zero letter spacing
- **THEN** the editor, the diff and the other code views all render with it,
  rather than one surface changing while the others stay put

#### Scenario: The default changes nothing

- **WHEN** the reader has never touched the setting
- **THEN** the code renders exactly as it did before the setting existed

#### Scenario: Gutters stay aligned

- **WHEN** letter spacing is increased
- **THEN** the line numbers and gutter marks stay aligned with the lines they
  annotate

### Requirement: A font the reader actually has

Reado SHALL let the reader name any installed monospace font, in addition to
offering presets.

#### Scenario: A font outside the presets

- **WHEN** the reader names an installed font that is not a preset
- **THEN** the code renders in it

#### Scenario: Presets remain the quick path

- **WHEN** no custom font is named
- **THEN** the chosen preset applies


## ADDED Requirements

### Requirement: The diff does not depend on colour alone

Reado SHALL distinguish added from removed lines by a non-colour cue as well as
by colour.

#### Scenario: Read without colour

- **WHEN** the diff is viewed by a reader who cannot distinguish its two hues,
  or in greyscale
- **THEN** added and removed lines remain tellable apart

#### Scenario: The cue is not content

- **WHEN** the reader copies a line from the diff
- **THEN** the copied text does not contain the marker

### Requirement: Colour vision setting

Reado SHALL let the reader declare which colour pairs they cannot distinguish,
and SHALL adjust the colours that carry meaning accordingly.

#### Scenario: Red–green

- **WHEN** the reader selects the red–green mode
- **THEN** the added/removed pair no longer relies on a red-versus-green
  distinction

#### Scenario: It layers over the theme

- **WHEN** the reader has chosen a theme and a colour-vision mode
- **THEN** the theme still applies, with only the meaning-carrying colours
  changed

#### Scenario: The default is unchanged

- **WHEN** the reader has not set a mode
- **THEN** the palette is the theme's own

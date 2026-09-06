## MODIFIED Requirements

### Requirement: Colorblind and Contrast Validation

Each shipped theme SHALL be validated for common color-vision deficiencies and
SHALL meet WCAG AA contrast as a minimum floor.

Themes contributed by installed extensions SHALL be run through the same
validation, and the result SHALL be shown to the user at the point of choosing
one. A contributed theme that fails SHALL remain selectable — it is the user's
editor — but SHALL be labelled with what it fails, so Reado never silently
becomes less legible than the standard it holds itself to.

#### Scenario: Theme passes checks

- **WHEN** a theme is shipped
- **THEN** it meets WCAG AA contrast and remains distinguishable under common
  colorblindness simulations

#### Scenario: A contributed theme is measured

- **WHEN** the user previews a theme contributed by an extension
- **THEN** Reado shows whether it meets the AA contrast floor and remains
  distinguishable under common colorblindness simulations

#### Scenario: A failing contributed theme is labelled, not blocked

- **WHEN** a contributed theme falls below the contrast floor
- **THEN** the user may still select it, and the theme is labelled with the
  check it fails

## ADDED Requirements

### Requirement: Contributed themes participate in every selection mode

A theme contributed by an installed, enabled extension SHALL be selectable
wherever a built-in theme is — as the Manual choice, and as the light or dark
member of the pair used by System and "Trust Reado" modes — and SHALL switch
live like any other theme.

#### Scenario: A contributed theme as the dark half of a pair

- **WHEN** the user picks a contributed dark theme as their dark theme and the
  mode is System
- **THEN** switching the OS appearance switches to that theme, live

#### Scenario: Live switch

- **WHEN** the user selects a contributed theme
- **THEN** the interface updates immediately without a restart

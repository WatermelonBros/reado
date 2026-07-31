## ADDED Requirements

### Requirement: Discoverable existing editor toggles

Reado SHALL present the already-persisted editor preferences — word wrap, sticky
scroll, render whitespace, and focus mode — as controls in the Settings UI, each
reading from and writing to the same store field the View menu uses, so the two
surfaces never disagree and each change applies to the editor immediately.

#### Scenario: Toggling from Settings applies live

- **WHEN** the user enables "Word wrap" in Settings while a file is open
- **THEN** the open editor re-wraps immediately without reopening the file, and
  the change persists across restarts

#### Scenario: Settings and View menu stay in sync

- **WHEN** the user toggles focus mode from the View menu
- **THEN** the corresponding Settings control reflects the new state the next
  time Settings is opened, and vice-versa — both read the one store field

#### Scenario: Change reaches other open windows

- **WHEN** two windows are open on the same machine and the user toggles render
  whitespace in one
- **THEN** the other window applies the same setting via the existing
  cross-window settings sync

### Requirement: Editor font size

Reado SHALL let the user set the editor text size in pixels, apply it live to the
reading surface, and persist it. The value SHALL be constrained to a legible
range; any stored value outside that range SHALL be clamped when read so the
editor is never rendered unreadably small or large.

#### Scenario: Adjusting font size reflows the editor

- **WHEN** the user changes the editor font size
- **THEN** open editors re-render at the new size immediately and the choice
  persists across restarts

#### Scenario: Out-of-range stored value is clamped

- **WHEN** the persisted font size is below the minimum or above the maximum
  (e.g. a hand-edited or corrupted value)
- **THEN** Reado renders at the nearest in-range size instead of the invalid one,
  and the control shows the clamped value

#### Scenario: Default when unset

- **WHEN** the user has never set a font size
- **THEN** the editor uses Reado's default reading size

### Requirement: Line height

Reado SHALL let the user set the editor line height as a unitless multiplier,
apply it live, persist it, and clamp any stored value to a documented range.

#### Scenario: Looser leading applies live

- **WHEN** the user increases line height
- **THEN** the open editor's line spacing increases immediately and the choice
  persists

#### Scenario: Out-of-range line height is clamped

- **WHEN** the persisted line height is outside the allowed range
- **THEN** Reado uses the nearest in-range multiplier

### Requirement: Line numbers

Reado SHALL let the user choose whether the editor shows line numbers, offering
off, absolute, and relative modes, applied live and persisted.

#### Scenario: Hiding line numbers

- **WHEN** the user sets line numbers to off
- **THEN** the editor gutter shows no line numbers and the reading surface
  reclaims that space

#### Scenario: Relative line numbers

- **WHEN** the user sets line numbers to relative
- **THEN** the gutter shows distances from the current line, with the current
  line marked, updating as the caret moves

### Requirement: Active-line emphasis

Reado SHALL let the user control how the line under the caret is emphasised —
none, the gutter only, the line background only, or both — applied live and
persisted.

#### Scenario: No active-line highlight

- **WHEN** the user sets active-line emphasis to off
- **THEN** neither the active line's gutter nor its background is highlighted

#### Scenario: Emphasis follows the caret

- **WHEN** active-line emphasis is set to line and the user moves the caret
- **THEN** the highlighted line background moves with the caret

### Requirement: Indent guides

Reado SHALL let the user show indentation guides — off, on all indentation, or
only the active scope's guide — applied live and persisted, reusing the bundled
indentation-markers extension.

#### Scenario: Active-only indent guides

- **WHEN** the user sets indent guides to active-only and places the caret inside
  a nested block
- **THEN** only the guide for the enclosing scope is emphasised, the rest quiet

### Requirement: Bracket matching

Reado SHALL let the user enable or disable highlighting of the bracket matching
the one at the caret, applied live and persisted.

#### Scenario: Matching bracket highlighted

- **WHEN** bracket matching is enabled and the caret is next to an opening
  bracket
- **THEN** its matching closing bracket is highlighted; disabling the setting
  removes the highlight

### Requirement: Persistence, defaults, and portability

Every editor control added here SHALL persist in the `reado.settings` slice with
a documented default, SHALL apply through the editor's existing per-setting
CodeMirror compartments (no full editor remount), and SHALL be a machine-portable
preference — included in the settings-sync bundle's allow-list and propagated to
other windows by the existing sync — while never carrying project-local state.

#### Scenario: Fresh install uses documented defaults

- **WHEN** the app runs with no persisted settings
- **THEN** each new control reports its documented default and the editor renders
  accordingly

#### Scenario: Preferences travel with the settings bundle

- **WHEN** the user exports a settings bundle after changing these controls and
  imports it on another machine
- **THEN** the imported machine applies the same editor controls

#### Scenario: Applying a control does not reset editor state

- **WHEN** the user changes any of these controls while scrolled into a file with
  a selection
- **THEN** the setting applies without losing the scroll position, selection, or
  undo history

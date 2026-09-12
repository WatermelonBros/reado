# accessibility Specification

## Purpose
TBD - created by archiving change accessibility-announcements. Update Purpose after archive.
## Requirements
### Requirement: A Live Region For State

Reado SHALL carry a live region with two channels: a polite one for state a
sighted reader takes off the screen continuously, and an assertive one for what
would otherwise be missed entirely. The region SHALL be visually hidden but
present in the accessibility tree — a hidden element is not announced at all.

The same message announced twice SHALL be announced twice, because a live region
ignores identical text written into it again.

#### Scenario: Repeating a message

- **WHEN** the same text is announced a second time
- **THEN** it is announced again rather than swallowed as a duplicate

#### Scenario: Something that must not wait

- **WHEN** a message is announced assertively
- **THEN** it interrupts rather than queueing behind what is being read

### Requirement: Announcements Are Opt-In

Reado SHALL announce nothing unless the reader has asked it to, through a setting
that is off by default. Reado SHALL NOT attempt to detect whether a screen reader
is running: it cannot, and guessing wrong either floods a reader who has one or
silences one who does.

The setting SHALL say why it is a choice rather than a detection.

#### Scenario: Off by default

- **WHEN** the setting has never been turned on
- **THEN** nothing is written to the live region, whatever happens in the app

#### Scenario: Turned on

- **WHEN** the reader turns announcements on
- **THEN** the caret's line, diff jumps and run results are announced

### Requirement: The Caret's Line Is Announced

With announcements on, Reado SHALL announce the line the caret moves to: its
number, its text, and the message of any diagnostic on it. A blank line SHALL be
announced as blank rather than as nothing.

Reado SHALL announce on a change of line only — announcing while someone types on
one line is a reader that never stops talking.

#### Scenario: Moving to another line

- **WHEN** the caret moves to a different line
- **THEN** that line's number and text are announced, with any problem on it

#### Scenario: Typing

- **WHEN** the caret stays on one line while its text is edited
- **THEN** nothing is announced

### Requirement: A Diff Is Described, Not Coloured

With announcements on, Reado SHALL say how many changed regions a diff holds when
it opens, and on each jump between regions SHALL say which region of how many,
how many lines it adds and how many it removes, and the line it starts at.

A diff communicates by colour, which is the one thing a screen reader cannot
relay; without this, moving between regions says nothing at all.

#### Scenario: Opening a diff

- **WHEN** a diff opens
- **THEN** the number of changed regions is announced, with how to reach the next

#### Scenario: Jumping to a region

- **WHEN** the reader jumps to the next or previous changed region, by key or by
  control
- **THEN** which region it is, what it adds and removes, and where it is, are
  announced

### Requirement: Audio Cues

Reado SHALL offer optional short tones for the things that are otherwise only a
colour: an error or warning on the line the caret moves to, and whether a
finished test run passed or failed. A problem SHALL sound lower than a success.

Cues SHALL be off by default, SHALL be independent of the announcement setting,
and SHALL fail silently where the platform provides no audio — a cue is an
enhancement, and failing to play one is not something anyone can act on.

#### Scenario: An error under the caret

- **WHEN** the caret moves onto a line carrying an error, with cues on
- **THEN** a low tone plays

#### Scenario: No audio available

- **WHEN** the platform provides no audio context
- **THEN** nothing plays and nothing fails

### Requirement: The Editor Has A Name

Reado SHALL give the editor's text area an accessible name identifying the file
it holds, so that a split showing two files does not announce both as an unnamed
text box.

#### Scenario: Two panes

- **WHEN** two files are open side by side
- **THEN** each editing area is named after its own file


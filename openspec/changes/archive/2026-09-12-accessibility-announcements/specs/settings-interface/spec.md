## ADDED Requirements

### Requirement: Accessibility section carries the announcement controls

The Interface tab's accessibility section SHALL carry a control for
announcements and a control for audio cues, each off by default, each persisted
and searchable from the settings index like every other control.

The announcement control SHALL explain that Reado cannot detect a screen reader,
so that "off" does not read as a defect.

#### Scenario: Finding them

- **WHEN** the user searches the settings for the announcement or cue control
- **THEN** it is found and the search lands on Interface ▸ Accessibility

#### Scenario: They persist

- **WHEN** the user turns announcements on and reopens Reado
- **THEN** announcements are still on

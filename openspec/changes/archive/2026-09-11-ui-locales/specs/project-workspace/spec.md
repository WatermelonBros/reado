## MODIFIED Requirements

### Requirement: Internationalization

Reado SHALL ship with internationalized UI strings supporting English, Italian,
Spanish, French and German, selectable in settings, and SHALL start in the OS
language when it is one of them. Every locale SHALL carry the same set of keys as
English, with the same placeholders.

#### Scenario: Switch UI language

- **WHEN** the user selects a different UI language in settings
- **THEN** the interface strings update to the selected language

#### Scenario: Following the system

- **WHEN** Reado starts for the first time on a machine whose language is one it
  ships
- **THEN** the interface is in that language

#### Scenario: A locale is complete

- **WHEN** a locale file is missing a key, or a string drops a placeholder
- **THEN** the test suite fails

# settings-profiles Specification

## Purpose
TBD - created by archiving change 2026-09-11-settings-profiles. Update Purpose after archive.
## Requirements
### Requirement: Named Profiles

Reado SHALL keep named profiles, each holding a complete configuration —
settings, which extensions are enabled, and keybindings — with exactly one active
at a time. A **Default** profile SHALL always exist and SHALL NOT be deletable.

The user SHALL be able to create a profile from the configuration in use, rename
one, and delete one.

#### Scenario: Creating from what is in use

- **WHEN** the user creates a profile with a name
- **THEN** it holds the configuration currently in use, and becomes the active one

#### Scenario: Default cannot go

- **WHEN** the user tries to delete the Default profile
- **THEN** it is refused, and the profile stays

#### Scenario: Deleting the active profile

- **WHEN** the user deletes the profile in use
- **THEN** Reado switches to Default and applies it

### Requirement: Switching

Switching profiles SHALL save the configuration in use back to the profile it
came from before loading the next, so edits made while a profile was active are
never lost. The active profile SHALL be visible in the status bar, and switchable
from there and from the command palette.

#### Scenario: Edits survive a switch

- **WHEN** the user changes a setting, switches to another profile, and switches
  back
- **THEN** the change is still there

#### Scenario: The switch applies

- **WHEN** the user switches to a profile with a different theme and font size
- **THEN** the editor shows that theme and that font size immediately

#### Scenario: It says which one

- **WHEN** a profile other than Default is active
- **THEN** the status bar names it

### Requirement: Profiles Travel

A profile SHALL be exportable to a file and importable from one, so a
configuration can be moved between machines or handed to someone else. Importing
a profile whose name is taken SHALL ask rather than overwrite.

#### Scenario: Export and import

- **WHEN** a profile is exported and then imported on another machine
- **THEN** a profile with the same name and the same configuration exists there

#### Scenario: A name already taken

- **WHEN** the imported profile's name already exists
- **THEN** Reado asks whether to replace it or keep both

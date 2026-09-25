# host-extension-points Specification

## Purpose
Gives a build that embeds Reado a small set of stable places to add UI, startup
registration, native plugins, and OS-delivered arguments, without modifying core files.
## Requirements
### Requirement: Named UI slots

The app SHALL expose named UI slots — at least `activitybar.account` (bottom of the
activity bar, under Settings) and `settings.footer` (the settings' bottom row, beside
the version) — that render, in registration order, the components registered
for that name. A slot with no registrations SHALL render nothing and take no space.

#### Scenario: Empty slot in the community build

- **WHEN** the community build shows the activity bar and the settings
- **THEN** no slot adds any element, and the layout is identical to the layout
  before slots existed

#### Scenario: Registered component appears

- **WHEN** an embedding build registers a component for `settings.footer` before
  startup
- **THEN** the settings' bottom row shows that component beside the version

### Requirement: Slot placement preview

A development build SHALL, when started with a preview flag, fill every UI slot with a
labelled placeholder naming the slot, so a slot's position can be checked in the
running app. Release builds SHALL NOT contain the preview.

#### Scenario: Previewing slots

- **WHEN** a development build starts with the preview flag set
- **THEN** each slot shows a placeholder with its name

#### Scenario: Not in release

- **WHEN** a release build runs
- **THEN** no placeholder appears, whatever the environment

### Requirement: Slot failures are contained

A component that throws while rendering inside a slot SHALL NOT take down the
surrounding interface; the slot SHALL render nothing for that component and the error
SHALL be logged.

#### Scenario: Throwing slot component

- **WHEN** a registered `activitybar.account` component throws on render
- **THEN** the activity bar still renders and works, and the error appears in the log

### Requirement: Web boot hook

The app's startup SHALL be callable as a function, so that an alternative entry can
register slot components and then start the app. The default entry SHALL call that
function with no registrations, and startup behavior (logging setup, error handlers,
companion window, first render) SHALL be the same through either path.

#### Scenario: Default entry unchanged

- **WHEN** the community build starts
- **THEN** it behaves exactly as before the change

#### Scenario: Registration before first render

- **WHEN** an alternative entry registers a slot component and then starts the app
- **THEN** the component is present on the very first render, with no flash of the
  empty slot

### Requirement: Native builder hook

The native layer SHALL offer an entry that accepts a function receiving the
fully-configured application builder and returning it, applied after the core's own
plugins and before the application runs. The existing entry SHALL remain and SHALL
behave as that entry with an identity function.

#### Scenario: Embedding binary adds a plugin

- **WHEN** an embedding binary calls the hooked entry with a function that adds a
  plugin
- **THEN** the application runs with every core plugin plus the added one, the core's
  single-instance handling still first

### Requirement: Forwarding unconsumed second-instance arguments

When a second launch of the app forwards its arguments to the running instance, the
core SHALL keep opening arguments that are existing files, and SHALL pass every other
argument to handlers registered by an embedding build. With no handler registered,
such arguments SHALL be ignored as today.

#### Scenario: A link opened by the OS

- **WHEN** the OS launches Reado with a `reado://…` argument while Reado is running and
  an embedding build has registered an argument handler
- **THEN** the running instance passes that argument to the handler and does not try
  to open it as a file

#### Scenario: Files still open

- **WHEN** a second launch carries a path to an existing file
- **THEN** the running instance opens that file, as before


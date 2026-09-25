## MODIFIED Requirements

### Requirement: Named UI slots

The app SHALL expose named UI slots — at least `activitybar.account` (bottom of the
activity bar, under Settings), `settings.footer` (the settings' bottom row, beside
the version), `statusbar.left` (the status bar's left group, before the file path)
and `comment.actions` (the comment thread's header, beside its own actions) — that
render, in registration order, the components registered for that name. A slot
with no registrations SHALL render nothing and take no space.

#### Scenario: Empty slot in the community build

- **WHEN** the community build shows the activity bar, the settings, the status bar
  and a comment thread
- **THEN** no slot adds any element, and the layout is identical to the layout
  before slots existed

#### Scenario: Registered component appears

- **WHEN** an embedding build registers a component for `settings.footer` before
  startup
- **THEN** the settings' bottom row shows that component beside the version

#### Scenario: Status bar slot

- **WHEN** an embedding build registers a component for `statusbar.left`
- **THEN** the status bar shows it at the start of its left group, and the file path
  still truncates before the cursor position gives way

## ADDED Requirements

### Requirement: Slots pass context

A slot SHALL be able to pass context to the components registered for it, and
registration SHALL be typed per slot so that a component expecting context cannot
be registered for a slot that provides none. `comment.actions` SHALL pass the id of
the comment the thread shows and the project root it belongs to.

#### Scenario: Comment action knows its comment

- **WHEN** an embedding build registers a component for `comment.actions` and the
  person opens the thread of comment `c1` in project `/p`
- **THEN** the component renders in that thread's header and receives `c1` and `/p`

#### Scenario: Another thread, another comment

- **WHEN** the person closes that thread and opens comment `c2`
- **THEN** the component receives `c2`

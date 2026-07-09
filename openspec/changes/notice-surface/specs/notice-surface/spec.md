## ADDED Requirements

### Requirement: Transient toast stack

Reado SHALL present transient notices as a bottom-centre stack of independent
toasts, each auto-dismissing after a few seconds, newest first, with a hard cap
on how many are visible at once so a burst of events cannot flood the view. Each
toast SHALL be individually dismissible.

#### Scenario: Two failures in quick succession

- **WHEN** two operations fail close together and each raises a notice
- **THEN** both toasts are visible, stacked, and each dismisses on its own timer
  (the second does not erase the first)

#### Scenario: Burst is capped

- **WHEN** more notices are raised than the visible cap
- **THEN** only the most recent up-to-cap toasts are shown; older ones drop off

#### Scenario: Manual dismiss

- **WHEN** the user clicks (or activates) a toast
- **THEN** that toast is removed immediately without affecting the others

### Requirement: Error reporter for lib code

Reado SHALL expose a `notifyError(scope, error)` helper that both records the
error to the diagnostic log and surfaces a concise, human-readable message as an
error toast. The surfaced text SHALL be a friendly message, never a raw exception
or stack dump. A companion `notify(kind, text)` SHALL surface info/success
messages.

#### Scenario: A backend call fails

- **WHEN** a Tauri command rejects in a path that previously swallowed the error
- **THEN** the failure is logged with its scope and an error toast tells the user
  the action failed, in their language

#### Scenario: No raw error leaks to the UI

- **WHEN** the underlying error is a low-level string (path, errno, stderr)
- **THEN** the toast shows a curated message, not the raw text

### Requirement: Silent failure paths report

Reado SHALL route the previously fire-and-forget failure paths (git operations,
watcher start, index rebuild, file save, and agent dispatch) through the notice
surface, so a failure MUST NOT be swallowed by an empty catch handler.

#### Scenario: Save fails

- **WHEN** writing a file to disk fails
- **THEN** the user sees an error indication (the editor's inline save-error
  banner), the raw error is logged for diagnostics, and the file is not silently
  marked clean

#### Scenario: Agent not installed

- **WHEN** the user launches an agent whose binary is not on PATH
- **THEN** a notice explains the agent isn't installed (this existing behaviour is
  preserved through the unified surface)

### Requirement: Motion respects reduce-motion

Toasts SHALL animate in and out with a short, calm transition, and SHALL honour
the reduce-motion setting by falling back to an instant show/hide.

#### Scenario: Reduce-motion on

- **WHEN** reduce-motion is active
- **THEN** toasts appear and disappear without a slide/fade transition

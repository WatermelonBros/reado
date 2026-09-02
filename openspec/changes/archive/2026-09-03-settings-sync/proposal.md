## Why

Reado already persists settings and extension state locally with zustand
`persist` (`reado.settings`, `reado.workspace`, the disabled-ids in
`reado.extensions`), and those slices sync across windows on one machine via the
browser `storage` event. But a user with two machines — a laptop and a desktop —
re-does their whole setup by hand on each: theme and reading aids, editor
preferences, which language-server extensions are enabled. There is no
read-first, calm way to carry a setup from one machine to the next.

This is a deliberately small, honest first step. Rather than mandate a sync
backend (an account, a server, a provider lock-in) we add an **explicit
export/import of a portable settings bundle** to a file — fully in the user's
control, no secrets, no project-local state. It fits Reado's principles:
explicit triggers (the user chooses Export / Import; nothing syncs silently),
honest surfaces (the bundle and the UI state plainly what is and isn't carried),
and restraint (a file, not a service). A networked sync backend is left as a
future, out-of-scope note that this bundle format is designed to enable.

## What Changes

- A **portable settings bundle**: a versioned JSON document (schema version +
  Reado app version + export timestamp) containing exactly the cross-machine
  slices — global settings (theme/mode, fonts, reading aids, chrome toggles,
  autosave, sounds), enabled/disabled extensions and language servers, and a
  keymap section reserved for when keybindings become user-editable. Defined in
  a new `src/lib/settings-sync.ts` (`buildBundle`, `applyBundle`,
  `parseBundle`).
- **Export** to a file: a Settings action ("Export settings…") and a Command
  Center command serialise the bundle and save it via a Tauri save dialog
  (e.g. `reado-settings.json`).
- **Import + apply** from a file: an "Import settings…" action opens a file,
  validates the bundle, shows a plain summary of what will change, and on
  confirmation applies it into `useSettings` and `useExtensions` (which, being
  persisted, propagate to other windows on that machine as today).
- **Honest scoping in the UI and the format**: the bundle carries only
  machine-portable preferences. It explicitly **excludes** secrets (none are
  stored today; the format forbids them) and **project-local state** — per-
  project `.reado/`, recent projects (`reado.recents`), restored sessions
  (`reado.sessions`), and any absolute filesystem paths. The Settings UI states
  what syncs and what does not.
- **Validation & versioning**: import rejects a malformed or wrong-`kind`
  document with a clear message, ignores unknown forward-compatible fields, and
  refuses a bundle whose schema version is newer than this build understands
  rather than applying it partially.
- Settings UI copy added to `src/i18n/locales/en.json` and `it.json`.

## Capabilities

### Added Capabilities
- `settings-sync`: export the user's portable settings/preferences/enabled-
  extensions to a versioned bundle file and import + apply one on another
  machine, with explicit scoping that never includes secrets or project-local
  state.

## Out of Scope

- A hosted/networked **sync backend** (account, server, provider) and automatic
  background sync. The bundle format is shaped to enable it later; choosing a
  provider is explicitly deferred.
- Syncing **project-local state**: per-project `.reado/`, recent projects,
  restored tab sessions, branch/window layout, or anything containing absolute
  paths.
- A user-editable **keymap** itself — Reado has no editable keybindings yet; the
  bundle reserves a keymap section so it carries them once they exist, but
  building the keymap editor is not part of this change.
- Merge/conflict resolution between two bundles (import is apply-over, last
  write wins for the chosen slices).

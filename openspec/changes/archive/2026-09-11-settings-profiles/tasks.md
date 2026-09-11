## 1. The model

- [x] 1.1 `useProfiles`: named bundles + the active id, persisted. Default seeded
      and undeletable.
- [x] 1.2 Capture and apply reuse the `settingsSync` bundle, so there is one
      description of "a configuration" and not two.
- [x] 1.3 Switching saves-then-loads.

## 2. UI

- [x] 2.1 Status-bar indicator that names the active profile and switches on click.
- [x] 2.2 Palette commands: switch, create from current, rename, delete.
- [x] 2.3 Export / import through the existing bundle file flow, asking on a
      name collision.

## 3. Verify

- [x] 3.1 Unit tests: create-from-current, save-on-switch, delete-active falls to
      Default, Default undeletable, import collision.
- [x] 3.2 i18n for every shipped locale.
- [x] 3.3 CHANGELOG entry under `[Unreleased]`.

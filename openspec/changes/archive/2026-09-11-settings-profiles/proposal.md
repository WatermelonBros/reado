## Why

One person's editor is several editors. Reading Rust wants different settings
from writing TypeScript; a demo wants a big font, no inlay hints and a quiet
theme; screen sharing wants none of your extensions. Today all of that is one
global configuration, so switching means changing a dozen settings by hand and
changing them back after.

`settingsSync` can already export and import the whole configuration as a bundle,
which is most of the machinery — what is missing is keeping more than one and
switching between them in a click.

## What Changes

- Named profiles, each holding its own settings, enabled/disabled extensions and
  keybindings. One is active at a time.
- Create a profile from the current configuration, switch to one, rename and
  delete. The profile in use is visible in the status bar and switchable there.
- Switching writes back what you changed before it loads the next, so a profile
  is never silently rolled back.
- A profile may be exported to a file and imported on another machine, through
  the bundle format that already exists.
- Deleting the active profile, or the last one, falls back to a **Default**
  profile that cannot be removed.

## Capabilities

### Added Capabilities

- `settings-profiles`: named, switchable configurations.

## 1. Profiles

- [x] 1.1 `terminalProfiles: string[]` — `Name = command args` lines, the shape
      the keybindings and nesting rules already use (the settings store holds
      strings, and a line stays diffable and pasteable) — plus
      `defaultTerminalProfile: string`. No per-profile environment: nothing asked
      for it yet, and a line is the wrong place to put one.
- [x] 1.2 Migration: the existing `terminalShell` / `terminalShellArgs` become the
      seed of the default profile; both settings keep working.
- [x] 1.3 Settings → Terminal: the lines field edits them; the default is named
      beside it. No profile list means "the login shell", exactly as now.

## 2. Opening

- [x] 2.1 `add(cwd?, profileId?)` carries the profile through to `pty_spawn`.
- [x] 2.2 The `+` button gains a dropdown (the arrow opens the list; the button
      itself keeps opening the default), listing the profiles.
- [x] 2.3 A profile-opened terminal is titled with the profile's name, and its
      number is still unique (`Node REPL`, `Node REPL 2`).
- [x] 2.4 Backend unchanged: `pty_spawn` already took a shell and its arguments,
      so a profile is what the frontend passes into the door that existed.

## 3. Run selection

- [x] 3.1 Command + keybinding: send the selection (or the current line) to the
      focused terminal, opening one if none is.
- [x] 3.2 Multi-line selections are sent as they are — bracketed paste is the PTY's
      business, not ours.

## 4. Verify

- [x] 4.1 Unit tests: a profile's command reaches the spawn call, titles are
      unique per profile, the migration seeds the default from the old settings,
      and the run-selection command sends the selection then a newline (and the
      current line when nothing is selected).
- [x] 4.2 i18n EN + IT (+ the locales this release adds).
- [x] 4.3 CHANGELOG entry under `[Unreleased]`.

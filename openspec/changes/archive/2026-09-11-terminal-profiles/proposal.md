## Why

The integrated terminal runs one shell — the one named in settings, or the login
shell. Every tab is that same shell. Anyone who works with more than one runtime
(a container shell, a Node REPL, `bash` because a script only works there, a shell
with different environment variables) has to type the command by hand in every new
terminal, every session.

And the other half of the same gap: a selection in the editor cannot be sent to
the terminal. Copy, focus, paste — for something every editor has a command for.

## What Changes

- **Named terminal profiles**: a list in settings, each with a name, a command,
  arguments, and optional environment variables. The `+` button's dropdown lists
  them; choosing one opens a terminal running it, named after the profile.
- **A default profile** per platform, seeded from the shell setting that exists
  today, so nothing changes for someone who never opens the list.
- **Run Selected Text in Terminal** (⇧⌘Enter and the palette): sends the editor's
  selection — or, with no selection, the current line — to the focused terminal,
  followed by a newline.

## Capabilities

### Modified Capabilities

- `integrated-terminal`: terminals can be opened from named profiles, and the
  editor's selection can be run in the focused terminal.

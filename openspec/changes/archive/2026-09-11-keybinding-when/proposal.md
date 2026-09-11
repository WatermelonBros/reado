## Why

`keybindings.ts` is a flat map from combo to command. A key means one thing
everywhere, so every new shortcut has to find a combination that is free
*globally* — and `buildCodeExtensions.ts` carries comments explaining which keys
were deliberately left alone because the terminal or the editor needed them.

That is backwards. ⌘K means one thing in the editor and another in a terminal,
and the only way to say so is a condition on the binding. VS Code spells it
`when`; without it Reado's keymap can only get more crowded.

## What Changes

- A binding may carry a `when` clause: `Mod+K = clearTerminal when terminalFocus`.
  The same combo may appear more than once with different conditions; the first
  whose condition holds wins, and an unconditional binding is the fallback.
- A small context vocabulary, evaluated from what is actually on screen:
  `editorFocus`, `terminalFocus`, `inputFocus`, `paletteOpen`, `dialogOpen`,
  `editorHasSelection`, `sidebarFocus`. Conditions may be negated (`!inputFocus`)
  and joined with `&&`.
- The keybindings editor shows and edits the clause, and an unknown context name
  is reported rather than silently never matching.

## Capabilities

### Added Capabilities

- `keybindings`: conditional bindings and the context vocabulary they read.

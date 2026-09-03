## Why

Roughly 8% of men cannot reliably distinguish red from green. Reado is a code
*review* tool, and its central surface — the diff — says "added" in green and
"removed" in red, with nothing else to tell them apart.

Worse, it isn't even Reado's green and red. The unified merge view is
unstyled, so it renders `@codemirror/merge`'s built-in `#22bb22` / `#ee4433`
regardless of theme. Those two hues are the textbook worst case for
deuteranopia and protanopia, and they ignore the palette every other surface
follows.

The rest of the app mostly gets this right by accident: Source Control pairs
each status colour with a letter (`M`, `A`, `D`, `!`), and comment types carry
their name in the thread. The diff is the one place where colour is the *only*
carrier of a binary distinction the reader has to make on every line.

Two fixes, and they are independent:

- A **non-colour cue** in the diff — `+` and `−` — which helps every kind of
  colour vision deficiency at once, survives a greyscale screenshot, and is
  worth having whether or not anyone turns a setting on.
- A **colour-vision setting**, so a reader can say which pairs they can't
  separate and have the palette answer. Red–green (deuteranopia, protanopia)
  wants blue/orange; blue–yellow (tritanopia) wants something else again. No
  single palette serves all of them, which is exactly why it is a choice and
  not a fixed "accessible mode".

## What Changes

- **theming** (extended):
  - `--diff-add` / `--diff-del` tokens, defined per theme, and a merge-view
    style that uses them — so the diff follows Reado's palette at all, before
    anything about colour vision.
  - A **colour vision** setting: normal (default), red–green, blue–yellow. It
    layers over the active theme rather than replacing it, so someone can have
    sepia *and* a red–green-safe diff.
  - Retinted tokens under each mode for the places where colour carries meaning
    on its own: the diff, and the error/warning distinction.
  - **`+` / `−` markers in the diff**, unconditionally. The distinction stops
    depending on colour for everyone.

Out of scope: re-tuning syntax highlighting per colour-vision mode — syntax
colour is a many-way distinction where no token is load-bearing on its own, and
it deserves its own design pass rather than a hue rotation; the terminal's ANSI
palette, which belongs to the programs drawing in it.

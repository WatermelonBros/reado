## Why

Reado has pieces of accessibility — a colour-vision layer, reduce-motion, toasts
that announce themselves, tooltips that are also accessible names. What it has
none of is the channel that carries *state*: where the caret is, what is on that
line, what a diff actually changed. A sighted reader gets all of that from the
screen, continuously and for free. Someone using a screen reader gets silence.

The diff is the sharpest case. It communicates entirely by colour, and colour is
the one thing a screen reader cannot relay — so Alt+Down moves a caret and says
nothing about why.

This is also the only gap in the parity audit that decides *who can use* Reado,
rather than how pleasant it is.

## What Changes

- **A live region**, off-screen and always mounted, with a polite channel for
  state and an assertive one for what would otherwise be missed.
- **The caret's line announced** when it moves to a new line — its number, its
  text, and any diagnostic sitting on it — but not while typing on one line.
- **The diff described**: how many regions changed when it opens, and on each
  jump which region of how many, how many lines it adds and removes, and where.
- **Audio cues**, optional: an error under the caret, and a finished test run.
- **The editor's text area named** after the file it holds, so two split panes
  are told apart rather than both announcing "edit text".
- Both channels **off by default**, under Settings ▸ Interface ▸ Accessibility.

## Capabilities

### Added Capabilities

- `accessibility`: announcements, audio cues, and the accessible names that make
  them make sense.

### Modified Capabilities

- `settings-interface`: two controls in the accessibility section.

## Impact

- New `src/lib/a11y.ts` and `src/components/molecules/Announcer.tsx`.
- `CodeView` (caret line + cue), `DiffView` (open + per-jump description),
  `buildCodeExtensions` (`aria-label` on the content), `testing.ts` (run result).
- Two settings, five locales, and an index entry each so they are searchable.

# 10 — Command Palette

Cmd+P files, Cmd+K commands, Cmd+Shift+F search. Entry: `Palette.tsx`, `usePalette`.

**Cases: 30.**

---

### TC-PAL-0001 — Fuzzy file finder opens
**As a** user, **when I** open the file finder, **I expect** a query field.
- **Result:** PASS

### TC-PAL-0002 — Fuzzy matching
**As a** user, **when I** type part of a filename, **I expect** ranked matches.
- **Result:** PASS

### TC-PAL-0003 — Open a file from finder
**As a** user, **when I** pick a result (Enter), **I expect** it opened, palette closed.
- **Result:** PASS

### TC-PAL-0004 — Command mode opens
**As a** user, **when I** open commands (Cmd+K), **I expect** the command list.
- **Result:** PASS

### TC-PAL-0005 — Command list populated
**As a** user, **when I** open command mode, **I expect** all actions with shortcuts (52).
- **Result:** PASS

### TC-PAL-0006 — Command filtering
**As a** user, **when I** type in command mode, **I expect** the list filtered.
- **Result:** TODO

### TC-PAL-0007 — Run a command
**As a** user, **when I** pick a command, **I expect** it executed, palette closed.
- **Result:** TODO

### TC-PAL-0008 — Search mode
**As a** user, **when I** open search from the palette, **I expect** the project search.
- **Result:** TODO

### TC-PAL-0009 — Escape closes
**As a** user, **when I** press Escape, **I expect** the palette closes without acting.
- **Result:** PASS

### TC-PAL-0010 — Palette overlay at zoom (visual)
**As a** user, **when I** open the palette at zoom 2, **I expect** it must not scale up and overflow off-screen.
- **Result:** FAIL → BUG-4

### TC-PAL-0011 — No console errors
**As a** user, **when I** use the palette, **I expect** no uncaught errors.
- **Result:** PASS

### TC-PAL-0012 — File finder: exact filename
**As a** user, **when I** search files by exact filename, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0013 — File finder: partial fuzzy
**As a** user, **when I** search files by partial fuzzy, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0014 — File finder: path segment
**As a** user, **when I** search files by path segment, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0015 — File finder: wrong case
**As a** user, **when I** search files by wrong case, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0016 — File finder: nonexistent
**As a** user, **when I** search files by nonexistent, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0017 — File finder: extension only
**As a** user, **when I** search files by extension only, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0018 — File finder: two words
**As a** user, **when I** search files by two words, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0019 — File finder: empty query
**As a** user, **when I** search files by empty query, **I expect** correct ranked matches or empty.
- **Result:** TODO

### TC-PAL-0020 — Run a comment command
**As a** user, **when I** pick a comment command from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0021 — Run a git command
**As a** user, **when I** pick a git command from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0022 — Run a navigation command
**As a** user, **when I** pick a navigation command from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0023 — Run a view-toggle
**As a** user, **when I** pick a view-toggle from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0024 — Run an AI command
**As a** user, **when I** pick an AI command from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0025 — Run a theme/settings command
**As a** user, **when I** pick a theme/settings command from the palette, **I expect** it runs and the palette closes.
- **Result:** TODO

### TC-PAL-0026 — Palette at zoom 0.8
**As a** user, **when I** open each palette mode at zoom 0.8, **I expect** the overlay anchored to the viewport, correctly sized, not clipped.
- **Result:** PASS

### TC-PAL-0027 — Palette at zoom 1.0
**As a** user, **when I** open each palette mode at zoom 1.0, **I expect** the overlay anchored to the viewport, correctly sized, not clipped.
- **Result:** PASS

### TC-PAL-0028 — Palette at zoom 1.25
**As a** user, **when I** open each palette mode at zoom 1.25, **I expect** the overlay anchored to the viewport, correctly sized, not clipped.
- **Result:** PASS

### TC-PAL-0029 — Palette at zoom 1.5
**As a** user, **when I** open each palette mode at zoom 1.5, **I expect** the overlay anchored to the viewport, correctly sized, not clipped.
- **Result:** FAIL → BUG-4

### TC-PAL-0030 — Palette at zoom 2.0
**As a** user, **when I** open each palette mode at zoom 2.0, **I expect** the overlay anchored to the viewport, correctly sized, not clipped.
- **Result:** FAIL → BUG-4

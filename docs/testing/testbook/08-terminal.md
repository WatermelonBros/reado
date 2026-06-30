# 8 — Terminal / PTY

Integrated terminals (xterm.js + real PTY). Entry: `Terminal.tsx`; `pty_*`.

**Cases: 55.**

---

### TC-TERM-0001 — Open spawns a shell
**As a** user, **when I** open the terminal, **I expect** a login shell with a prompt.
- **Result:** PASS

### TC-TERM-0002 — Correct cwd
**As a** user, **when I** spawn the shell, **I expect** it cwd'd to the project root.
- **Result:** PASS

### TC-TERM-0003 — Run a command, see output
**As a** user, **when I** run `echo HELLO`, **I expect** the command echoed and output printed.
- **Result:** PASS

### TC-TERM-0004 — Add a second terminal
**As a** user, **when I** add a terminal, **I expect** a new session, focused.
- **Result:** PASS

### TC-TERM-0005 — Independent sessions
**As a** user, **when I** run a command in the new terminal, **I expect** it runs in its own PTY.
- **Result:** PASS

### TC-TERM-0006 — Remove a terminal
**As a** user, **when I** close a terminal, **I expect** the session gone, PTY killed.
- **Result:** PASS

### TC-TERM-0007 — Toggle panel
**As a** user, **when I** toggle the terminal, **I expect** show/hide; opening with no tabs creates the first.
- **Result:** PASS

### TC-TERM-0008 — Path resolution backend
**As a** user, **when I** print a project path, **I expect** it resolvable to the file.
- **Result:** PASS

### TC-TERM-0009 — Click a path opens it
**As a** user, **when I** click a path in output, **I expect** the file opens in the editor.
- **Result:** MANUAL (xterm link)

### TC-TERM-0010 — URLs open in browser
**As a** user, **when I** click a URL, **I expect** it opens externally.
- **Result:** MANUAL

### TC-TERM-0011 — Cmd+F searches scrollback
**As a** user, **when I** press Cmd+F in the terminal, **I expect** a scrollback search.
- **Result:** TODO

### TC-TERM-0012 — Copy/paste shortcuts
**As a** user, **when I** Cmd+C / Cmd+V, **I expect** copy/paste with selection.
- **Result:** TODO

### TC-TERM-0013 — Resize reflows
**As a** user, **when I** resize the panel, **I expect** PTY cols/rows refit.
- **Result:** TODO

### TC-TERM-0014 — Default shell
**As a** user, **when I** spawn a terminal, **I expect** the user's login shell.
- **Result:** PASS

### TC-TERM-0015 — Split panes (groups)
**As a** user, **when I** split a terminal, **I expect** two panes sharing a group.
- **Result:** TODO

### TC-TERM-0016 — No console errors
**As a** user, **when I** open/run/add/remove, **I expect** no uncaught errors.
- **Result:** PASS

### TC-TERM-0017 — Run: echo
**As a** user, **when I** run echo, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0018 — Run: ls -la
**As a** user, **when I** run ls -la, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0019 — Run: a long-running command (sleep)
**As a** user, **when I** run a long-running command (sleep), **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0020 — Run: a command that errors
**As a** user, **when I** run a command that errors, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0021 — Run: an interactive TUI (vim)
**As a** user, **when I** run an interactive TUI (vim), **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0022 — Run: a command printing ANSI colors
**As a** user, **when I** run a command printing ANSI colors, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0023 — Run: a command printing a file path
**As a** user, **when I** run a command printing a file path, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0024 — Run: a command printing a URL
**As a** user, **when I** run a command printing a URL, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0025 — Run: clear
**As a** user, **when I** run clear, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0026 — Run: a 10k-line output
**As a** user, **when I** run a 10k-line output, **I expect** correct rendering, scrollback and no freeze.
- **Result:** TODO

### TC-TERM-0027 — 1 terminals
**As a** user, **when I** open 1 terminals, **I expect** tabs/groups manage them, each with its own PTY.
- **Result:** TODO

### TC-TERM-0028 — 2 terminals
**As a** user, **when I** open 2 terminals, **I expect** tabs/groups manage them, each with its own PTY.
- **Result:** TODO

### TC-TERM-0029 — 4 terminals
**As a** user, **when I** open 4 terminals, **I expect** tabs/groups manage them, each with its own PTY.
- **Result:** TODO

### TC-TERM-0030 — 8 terminals
**As a** user, **when I** open 8 terminals, **I expect** tabs/groups manage them, each with its own PTY.
- **Result:** TODO

### TC-TERM-0031 — Terminal at zoom 0.8
**As a** user, **when I** use the terminal at zoom 0.8, **I expect** xterm rows scale and refit without clipping.
- **Result:** TODO

### TC-TERM-0032 — Terminal at zoom 1.0
**As a** user, **when I** use the terminal at zoom 1.0, **I expect** xterm rows scale and refit without clipping.
- **Result:** TODO

### TC-TERM-0033 — Terminal at zoom 1.25
**As a** user, **when I** use the terminal at zoom 1.25, **I expect** xterm rows scale and refit without clipping.
- **Result:** TODO

### TC-TERM-0034 — Terminal at zoom 1.5
**As a** user, **when I** use the terminal at zoom 1.5, **I expect** xterm rows scale and refit without clipping.
- **Result:** TODO

### TC-TERM-0035 — Terminal at zoom 2.0
**As a** user, **when I** use the terminal at zoom 2.0, **I expect** xterm rows scale and refit without clipping.
- **Result:** TODO

### TC-TERM-0036 — job control (Ctrl+Z/fg) (terminal 1)
**As a** user, **when I** exercise job control (Ctrl+Z/fg) in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0037 — job control (Ctrl+Z/fg) (terminal 2)
**As a** user, **when I** exercise job control (Ctrl+Z/fg) in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0038 — signal handling (Ctrl+C) (terminal 1)
**As a** user, **when I** exercise signal handling (Ctrl+C) in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0039 — signal handling (Ctrl+C) (terminal 2)
**As a** user, **when I** exercise signal handling (Ctrl+C) in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0040 — tab completion (terminal 1)
**As a** user, **when I** exercise tab completion in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0041 — tab completion (terminal 2)
**As a** user, **when I** exercise tab completion in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0042 — history navigation (terminal 1)
**As a** user, **when I** exercise history navigation in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0043 — history navigation (terminal 2)
**As a** user, **when I** exercise history navigation in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0044 — wide unicode glyphs (terminal 1)
**As a** user, **when I** exercise wide unicode glyphs in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0045 — wide unicode glyphs (terminal 2)
**As a** user, **when I** exercise wide unicode glyphs in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0046 — 256-color output (terminal 1)
**As a** user, **when I** exercise 256-color output in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0047 — 256-color output (terminal 2)
**As a** user, **when I** exercise 256-color output in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0048 — carriage-return progress bars (terminal 1)
**As a** user, **when I** exercise carriage-return progress bars in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0049 — carriage-return progress bars (terminal 2)
**As a** user, **when I** exercise carriage-return progress bars in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0050 — alternate screen (less/vim) (terminal 1)
**As a** user, **when I** exercise alternate screen (less/vim) in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0051 — alternate screen (less/vim) (terminal 2)
**As a** user, **when I** exercise alternate screen (less/vim) in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0052 — very fast output (terminal 1)
**As a** user, **when I** exercise very fast output in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0053 — very fast output (terminal 2)
**As a** user, **when I** exercise very fast output in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0054 — prompt with git status (terminal 1)
**As a** user, **when I** exercise prompt with git status in terminal 1, **I expect** correct, glitch-free rendering.
- **Result:** TODO

### TC-TERM-0055 — prompt with git status (terminal 2)
**As a** user, **when I** exercise prompt with git status in terminal 2, **I expect** correct, glitch-free rendering.
- **Result:** TODO

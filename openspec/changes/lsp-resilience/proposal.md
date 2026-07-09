## Why

Reado runs language servers as a "dumb pipe": the backend spawns the process and
forwards stdout/stdin, the CodeMirror client owns the protocol. Two gaps make a
broken server the hardest thing in the app to diagnose or recover from:

1. **stderr is discarded** (`Stdio::null()`), so when a server misconfigures or
   crashes on startup there is *no* record of why — the log file is blind to the
   one thing that would explain it.
2. **A crash is silent.** When the server process dies, the backend's read loop
   just ends; the frontend's cached connection keeps pointing at a dead pipe, so
   completions/diagnostics/hover quietly stop working with no signal to the user
   and no recovery until a full reload.

## What Changes

- **lsp-resilience** (capability):
  - **Capture stderr**: pipe the server's stderr and log it (line by line,
    truncated, redaction-aware) so a failing server leaves a diagnostic trail.
  - **Signal exit**: when a server's output stream ends (the process is gone),
    the backend emits a per-connection exit event.
  - **Recover on the frontend**: on that exit, drop the dead cached connection so
    the next file interaction reconnects a fresh server, and surface a single,
    calm notice that the language server for that language stopped (deduplicated
    so a flapping server can't spam). Diagnostics from the dead server are cleared.
  - Intentional stops (page hide, HMR dispose, explicit stop) do **not** raise the
    crash notice.
- **i18n**: `en.json` + `it.json`.

Out of scope: automatic re-`initialize` with re-opening every document in place
(the lazy reconnect on next interaction covers recovery without that complexity);
installing missing servers (the extensions marketplace already does that);
per-server initialization-options plumbing.

## Capabilities

### Added Capabilities

- **lsp-resilience** — capture language-server stderr to the log, detect a server
  exit, and recover by dropping the dead connection (reconnect on next use) while
  telling the user once that the server stopped — so a crashed server is
  diagnosable and no longer silently breaks code intelligence.

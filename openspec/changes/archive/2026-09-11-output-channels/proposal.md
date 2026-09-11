## Why

When a language server doesn't start, Reado tells you it didn't start. Everything
that would say *why* — the handshake, the server's own stderr, the IPC failure
underneath — goes into a rolling log file in the OS application-support directory.
Diagnosing anything therefore means leaving the app, finding a JSON-lines file,
and reading it with something else.

VS Code's answer is the Output panel: the same records, in the app, one channel
per source, chosen from a dropdown.

## What Changes

- An **Output** tool panel, alongside Problems and Timeline, showing the records
  Reado is producing right now: timestamp, level, message, fields.
- A channel selector over the record's target — `lsp`, `ipc`, `terminal`, `git`,
  `app`, … — built from the targets actually seen, so it never lists an empty
  channel and never needs a registry to maintain.
- A level filter and a text filter, "follow" (pin to the newest record) and copy,
  because a log you cannot narrow is the file you were avoiding.
- **Language server output is a channel.** The backend already captures each
  server's stderr; it is forwarded as records on a per-server channel, which is
  the one thing that makes a server that refuses to start diagnosable from inside
  the app.
- The buffer is in memory and bounded (2000 records); the file remains the record
  of what happened, this is the view of what is happening.

## Capabilities

### Added Capabilities

- `log-access`: the app's own log records are readable inside the app, by channel.

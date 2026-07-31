## Why

Reado's code intelligence is "home-made": a regex + light-AST index powers Go to
Definition and a text-based Find References. It's approximate — references match
homonyms, there are no types on hover, no real diagnostics. For a tool whose
whole point is *reading* code, true semantic understanding is the biggest
missing capability. The Language Server Protocol (LSP) is how editors get it:
external per-language servers (rust-analyzer, typescript-language-server,
solidity-ls, …) answer semantic questions over a standard protocol.

This is a large, phased subsystem, not a one-afternoon feature — scoped here so
it can be built incrementally and value lands early (hover + diagnostics +
precise navigation before completion/rename).

## What Changes

- Reado runs **language servers** as external processes (managed by the Rust
  backend over stdio), auto-started per (language, project) when a matching file
  opens. Servers must be installed on the user's machine (like the agents);
  Reado detects them and degrades gracefully when absent (the existing
  index-based navigation remains the fallback).
- A CodeMirror **LSP client** surfaces, read-first first:
  - **Hover**: type + documentation for the symbol under the pointer.
  - **Diagnostics**: errors/warnings inline (quiet, theme-coloured).
  - **Precise Go to Definition / References** (replacing the approximate index
    when a server is available).
  - **Document symbols** feeding the Outline and Workspace Symbols.
- Later phases (lower priority for a read-first tool): completion, signature
  help, rename, code actions.
- Config: a per-language server table (command + file types), with sensible
  defaults for TypeScript/JavaScript, Rust, and Solidity; user-overridable.

## Capabilities

### Added Capabilities
- `language-intelligence`: LSP integration — server lifecycle (Rust), a
  CodeMirror client, and the read-first features (hover, diagnostics, precise
  definition/references, document symbols), with graceful fallback to the
  existing index.

## Phasing

1. **Server lifecycle + diagnostics + hover** (prove the pipe end-to-end on one
   language, e.g. TypeScript).
2. **Precise definition/references + document symbols** (wire into existing
   navigation/outline; fall back to the index when no server).
3. **More languages** (Rust, Solidity) via config.
4. **Optional write-side**: completion, signature help, rename, code actions.

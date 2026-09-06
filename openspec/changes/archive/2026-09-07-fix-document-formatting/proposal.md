## Why

Format Document exists (`Shift+Alt+F`, palette, native menu) but **format on
save does not** — saving only applies the two hygiene toggles (trim trailing
whitespace, final newline) in `CodeView.saveFile`. Users reasonably assume the
editor formats on save, and today it silently doesn't.

Worse, the formatter is picked by a hardcoded extension table
(`src-tauri/src/format.rs`) that falls back to a **global** binary when the
project has no local one:

```rust
let biome = local_bin(root, "biome").unwrap_or_else(|| "biome".into());
```

So in a Prettier project without a local Biome, Reado runs whatever `biome` is
on the user's PATH, with Biome defaults, ignoring `.prettierrc`. A user who has
Biome installed globally for one project gets every other web project silently
reformatted in the wrong style. That is a data-integrity bug, not a preference
one: it rewrites the whole file.

The fix is not more table entries. It is: **let the project decide.** A project
declares its formatter (config file, dev dependency) and, for most languages,
already runs a language server that formats with the project's own rules.

## What Changes

- **Evidence-based formatter selection.** A CLI formatter becomes a candidate
  only when the project declares it — a config file it owns, or a dependency in
  the project manifest. No declaration, no candidate. The global-PATH fallback
  for ambiguous ecosystems (a project could plausibly use Biome *or* Prettier)
  is removed; unambiguous single-formatter toolchains (rustfmt, gofmt) keep
  resolving on PATH as today.
- **Language server first.** When a server is already running for the file and
  advertises `documentFormattingProvider`, Reado formats through
  `textDocument/formatting` before trying any CLI. This reuses the existing LSP
  pipe (`src-tauri/src/lsp.rs`, `@codemirror/lsp-client`) and inherits the
  project's own rustfmt/gofmt/rubocop configuration for free.
- **Format on save**, off by default, as an editor setting alongside the
  existing hygiene toggles. It never blocks or fails a save.
- **Format selection is inspectable.** The result reports which formatter ran,
  and "no formatter for this project" is a distinguishable outcome from "the
  formatter ran and changed nothing".

## Capabilities

### Added Capabilities

- `document-formatting`: how Reado chooses and runs a formatter for the active
  document — project-declared CLI formatters, language-server formatting, the
  manual Format Document command, and the opt-in format-on-save.

## Out of Scope

- Formatters as extension manifests (next change: `formatter-extensions`).
- Range/selection formatting and format-on-type.
- Bundling or auto-installing any formatter binary.

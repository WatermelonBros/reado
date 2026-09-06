## Why

After `fix-document-formatting`, formatter knowledge is correct but still
hardcoded in Rust: adding a formatter means editing `format.rs`, and the
detection rules that decide "does this project use Biome or Prettier" live in
compiled code. That is the same shape the language servers had before the
extension system — and the same fix applies.

It also leaves the last gap: a project whose formatter Reado does not know
about, or which needs a non-obvious invocation, has no escape hatch. There is no
way for a user to say "in *this* repo, format with *this* command".

Formatters deliberately stay a **curated** extension kind. A formatter manifest
names a program Reado will spawn, so it must come from a trusted source, exactly
like `language-server`. This is also why formatters can never come from Open VSX
later: VS Code formatter extensions are JavaScript, and Reado does not run
extension code.

## What Changes

- **A `formatter` extension kind**, curated, alongside `language-server`. A
  manifest declares the file types it serves, the detection rules that prove the
  project uses it, the stdin/stdout invocation, and per-platform install
  instructions — the same manifest anatomy the language servers already use.
- **The Rust table becomes manifests.** `candidates_for` stops encoding
  formatter knowledge and instead ranks the enabled, detected formatter
  extensions. The spawn allowlist stays in Rust, keyed on extension id, so a
  manifest still cannot name an arbitrary command.
- **The marketplace grows a Formatters section**, with the same install /
  enable / disable / detection behaviour as language servers, plus a per
  extension indication of whether the *current project* declares it.
- **A per-project override**: the user can pin which formatter Reado uses for a
  file type in the current project, overriding detection, or turn formatting off
  for that project entirely. Stored per project, not globally.

## Capabilities

### Modified Capabilities

- `extensions`: adds `formatter` as a second curated extension kind, with
  project-detection rules as a manifest contribution.
- `document-formatting`: formatter selection is driven by enabled formatter
  extensions and an optional per-project override, rather than a compiled table.

## Out of Scope

- Linters as extensions (diagnostics already arrive via LSP; a `linter` kind can
  reuse this shape later if a real need appears).
- Any formatter sourced from Open VSX — those are code extensions by nature.

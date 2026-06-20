# Contributing to Reado

Thanks for your interest in Reado! This is an open-source, read-first code IDE,
and contributions of all kinds are welcome.

## Ground rules

- **English everywhere.** Code, comments, commit messages and documentation are
  written in English. The UI is internationalized (currently Italian + English).
- **Specs are the source of truth.** Reado is developed spec-first with
  [OpenSpec](https://github.com/Fission-AI/OpenSpec). Before building a feature,
  read the relevant capability under
  [`openspec/changes/add-reado-mvp/specs`](openspec/changes/add-reado-mvp/specs).
  Each scenario is an acceptance test.
- **Design matters.** Reado is a tool for reading code, so the UI must be calm,
  precise and trustworthy. Follow the design guidelines in
  [`.impeccable.md`](.impeccable.md) and the color research in
  [`docs/research`](docs/research).

## Getting started

```bash
pnpm install
pnpm tauri dev
```

See the [README](README.md#development) for prerequisites and the full list of
checks.

## Before opening a pull request

Run the checks locally — CI runs the same ones:

```bash
pnpm typecheck
pnpm build
cargo fmt   --manifest-path src-tauri/Cargo.toml --all
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path src-tauri/Cargo.toml
```

## Project layout

```
src/                React + TypeScript frontend
  components/       UI components (Tailwind CSS 4 + Ark UI primitives)
  lib/              state (zustand), Tauri API wrappers, hooks
  i18n/             translations
  styles/           design tokens (OKLCH themes) + Tailwind entry/theme
src-tauri/          Rust backend (Tauri command wrappers, PTY, watcher, search)
crates/reado-core/  shared annotation store (comment model + on-disk format)
crates/reado-cli/   the `reado` CLI (the agent's stable contract)
openspec/           specifications and change proposals
docs/               research and design notes
```

The comment store logic lives in `reado-core` and is shared by the desktop app
and the `reado` CLI, so the on-disk format and mutation logic exist in exactly
one place.

Styling uses Tailwind CSS 4. The OKLCH theme tokens live in
`src/styles/tokens.css` (switched by `data-theme`) and are mapped into Tailwind's
theme in `src/styles/app.css` via `@theme inline`, so semantic utilities like
`bg-surface` and `text-muted` stay theme-reactive.

## Commit messages

Keep them clear and imperative ("Add orphans panel", not "added stuff"). Group
related changes; keep diffs focused.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

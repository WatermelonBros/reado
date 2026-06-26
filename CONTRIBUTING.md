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

The simplest path uses [Task](https://taskfile.dev) (a small task runner). Install
it once — `brew install go-task`, `apt install go-task` (or its
[other installers](https://taskfile.dev/installation/)) — then:

```bash
task setup   # install JS deps + build the reado CLI sidecar (first-time only)
task dev     # run the desktop app in dev mode
```

Run `task` with no arguments to list every task (`setup`, `dev`, `build`,
`lint`, `test`, `check`, `cli`, `clean`).

> **Why `setup` builds a "sidecar".** The desktop app shells out to the `reado`
> CLI (the agent's stable contract), which Tauri bundles as an **external binary**
> (`externalBin` in `src-tauri/tauri.conf.json`). `tauri dev` does **not** compile
> it, so a fresh clone fails on the first `tauri dev` with a missing-binary error
> until the CLI is built once. `task setup`/`task dev` build it for you (via
> `scripts/bundle-cli.sh`, which compiles `crates/reado-cli` into
> `src-tauri/binaries/reado-cli-<target-triple>`).

### Without Task

The tasks are thin wrappers — you can run the same commands by hand. The one
thing to remember is to build the CLI sidecar before the first dev run:

```bash
pnpm install
bash scripts/bundle-cli.sh   # build the reado CLI sidecar (first-time only)
pnpm tauri dev
```

`pnpm tauri:dev` and `pnpm tauri:build` do the sidecar step for you.

See the [README](README.md#development) for prerequisites.

## Before opening a pull request

Run the full gate locally — CI runs the same checks:

```bash
task check    # lint (types + rustfmt + clippy) and test, across all crates
```

Or by hand — the checks cover all three Rust crates (`reado-core`, `reado-cli`,
`src-tauri`) and the frontend:

```bash
pnpm typecheck
pnpm test
for c in crates/reado-core crates/reado-cli src-tauri; do
  cargo fmt    --manifest-path "$c/Cargo.toml" --all --check
  cargo clippy --manifest-path "$c/Cargo.toml" --all-targets -- -D warnings
  cargo test   --manifest-path "$c/Cargo.toml"
done
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

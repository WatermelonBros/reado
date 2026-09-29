# Contributing to Reado

Thanks for your interest in Reado! This is an open-source, read-first code IDE,
and contributions of all kinds are welcome.

## Ground rules

- **English everywhere.** Code, comments, commit messages and documentation are
  written in English. The UI itself ships in English, Italian, Spanish, French
  and German.
- **Specs are the source of truth.** Reado is developed spec-first with
  [OpenSpec](https://github.com/Fission-AI/OpenSpec). Before building a feature,
  read the relevant capability under [`openspec/specs`](openspec/specs); changes
  in flight live in [`openspec/changes`](openspec/changes). Each scenario is an
  acceptance test.
- **Design matters.** Reado is a tool for reading code, so the UI must be calm,
  precise and trustworthy. Follow the design guidelines in
  [`.impeccable.md`](.impeccable.md) and the color research in
  [`docs/research`](docs/research).

## Getting started

Prerequisites: [Node.js](https://nodejs.org) 22+, [pnpm](https://pnpm.io), the
[Rust toolchain](https://rustup.rs), and the
[Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.
[ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) on your `PATH` makes
full-text search faster; without it Reado falls back to a built-in scanner.

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

`pnpm tauri:dev` and `pnpm tauri:build` do the sidecar step for you;
`pnpm tauri build` produces a native installer for the current platform.

> **Running a dev build next to the installed app.** Reado is single-instance per
> bundle identifier, so `tauri dev` quietly hands off to an installed Reado that
> is already open. Give the dev build its own identifier (and its own data dir):
>
> ```bash
> bash scripts/bundle-cli.sh && npx tauri dev --config '{"identifier":"com.reado.dev"}'
> ```

## Before opening a pull request

Run the full gate locally — CI runs the same checks:

```bash
task check    # lint (Biome + types + rustfmt + clippy) and test, across all crates
```

Or by hand — the checks cover all three Rust crates (`reado-core`, `reado-cli`,
`src-tauri`) and the frontend:

```bash
pnpm lint          # Biome: formatting + lint (`pnpm lint:fix` applies the fixes)
pnpm typecheck
pnpm test
for c in crates/reado-core crates/reado-cli src-tauri; do
  cargo fmt    --manifest-path "$c/Cargo.toml" --all --check
  cargo clippy --manifest-path "$c/Cargo.toml" --all-targets -- -D warnings
  cargo test   --manifest-path "$c/Cargo.toml"
done
```

## Conventions

- **Formatting is Biome's job** ([`biome.jsonc`](biome.jsonc)): no semicolons,
  double quotes, 100 columns, organised imports. Don't hand-format — run
  `pnpm lint:fix`. CI fails on a single diagnostic.
- **Imports use the `@/…` alias** for anything outside a file's own directory
  (`@/lib/api`, `@/components/atoms/Button`); a sibling stays relative.
- **Build UI on [Ark UI](https://ark-ui.com)** and the shared atoms
  (`Button`, `IconButton`, `Tooltip`, …) rather than hand-rolled markup. Anything
  that floats over the app portals to `document.body` — see
  [`CLAUDE.md`](CLAUDE.md) for why.
- **Every UI string goes through i18n.** English
  ([`src/i18n/locales/en.json`](src/i18n/locales/en.json)) is the source of truth
  and types every key, so a typo'd key doesn't compile; add the same key to the
  other locales. A new language is one more JSON file there plus an entry in
  `LOCALES` (`src/i18n/index.ts`).
- **Every user-facing change goes in [`CHANGELOG.md`](CHANGELOG.md)** under
  `[Unreleased]` (`Added` / `Changed` / `Fixed`) in the same pull request — the
  GitHub release notes are built from it.

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
scripts/uidriver/   drives the real dev app from a script (UI tests, demos)
scripts/demo/       records demo videos of the real app (the README/site footage)
docs/               research, design notes and media
```

The comment store logic lives in `reado-core` and is shared by the desktop app
and the `reado` CLI, so the on-disk format and mutation logic exist in exactly
one place.

Styling uses Tailwind CSS 4. The OKLCH theme tokens live in
`src/styles/tokens.css` (switched by `data-theme`) and are mapped into Tailwind's
theme in `src/styles/app.css` via `@theme inline`, so semantic utilities like
`bg-surface` and `text-muted` stay theme-reactive.

## Open core and the official build

Everything in this repository is MIT and is the whole app you get when you build
it yourself. The official binaries on the Releases page are built from this code
plus a few closed modules for paid features that need our servers (accounts,
cloud sync, team features). Those modules plug in through a handful of extension
points — `boot()` in `src/boot.tsx`, the UI slots in `src/lib/slots.ts`, and
`run_with` / `register_arg_handler` in `src-tauri/src/lib.rs` — and never patch
this code. In a build from this repository the slots stay empty.

Pull requests for anything that works locally are welcome here. Features that
depend on a hosted service (sign-in, cloud storage, relays) belong to the official
build, so please open an issue before starting one.

## Demo footage

The video in the README and on the website is the real app, recorded — not a
mock. [`scripts/demo`](scripts/demo) drives a dev build through the UI driver on a
throwaway fixture project (`scripts/demo/fixtures/make-shop.sh`), with a scripted
stand-in agent answering Reado's real prompts through the real `reado` CLI, and
captures the window with ffmpeg:

```bash
node scripts/demo/run.mjs scripts/demo/scenarios/tour.mjs            # rehearse
node scripts/demo/run.mjs scripts/demo/scenarios/tour.mjs --record   # record → docs/media/
```

It needs `ffmpeg` and the Screen Recording permission; the full workflow is in
[`.claude/skills/record-demo/SKILL.md`](.claude/skills/record-demo/SKILL.md).

## Commit messages

Conventional, scoped and imperative: `feat(review): …`, `fix(browser): …`,
`changelog: …`. Say what changed for the user, not which files moved. Group
related changes; keep diffs focused.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

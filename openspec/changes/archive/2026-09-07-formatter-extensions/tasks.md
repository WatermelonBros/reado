> Depends on `fix-document-formatting`. Moves the (now correct) formatter
> knowledge out of compiled code and adds the escape hatch.

## 1. Manifest model

- [x] 1.1 `FormatterExt` in `src/lib/extensions.ts`: id, name, description,
      `fileTypes`, `languageIds`, `invocation` (args template with the file path
      placeholder), `detect` (config globs + manifest dependency/config keys),
      `preference`, `install`, `requires`.
- [x] 1.2 Widen the extension model to carry `kind` explicitly and to ignore
      unknown kinds, as the extensions spec already requires.
- [x] 1.3 Port the bundled formatters (Biome, Prettier, rustfmt, gofmt, Ruff,
      Black, RuboCop, shfmt) from `format.rs` into manifests, preserving the
      preference order pinned by the existing `orders_candidates_by_preference`
      test.

## 2. Backend

- [x] 2.1 Keep the spawn allowlist in Rust keyed on extension id; `format_file`
      accepts an extension id + resolved args, not a free-form program.
- [x] 2.2 Evidence evaluation: a command that answers, for a project root, which
      formatter ids are detected (config glob match, dependency/config key in the
      project manifest). Cached per root, invalidated on config-file change via
      the existing watcher.
- [x] 2.3 Tests: allowlist rejects an id/program mismatch; detection matches
      config files and manifest keys; cache invalidates on change.

## 3. Selection

- [x] 3.1 `candidates_for` replaced by a ranking over enabled + detected
      formatter extensions.
- [x] 3.2 Disabled extensions contribute nothing (mirrors `serverFor`).
- [x] 3.3 Tests: disabled extension is skipped; preference ordering holds; no
      evidence → no candidate.

## 4. Per-project override

- [x] 4.1 Persisted per-root override map: file type → extension id or `off`.
- [x] 4.2 Override outranks detection and language-server formatting.
- [x] 4.3 Surface: a control in the marketplace's formatter entry and in the
      editor's format affordance for the active file's type.
- [x] 4.4 Tests: pin, `off`, and per-root isolation.

## 5. Marketplace

- [x] 5.1 Formatters section, grouped alongside language servers, with the same
      install / enable / disable / detection affordances.
- [x] 5.2 Each formatter shows whether the open project declares it.

## 6. Verify

- [x] 6.1 Live: a Biome repo, a Prettier repo, and a Python repo each format with
      their own tool with no per-project configuration by the user.
- [x] 6.2 Live: pinning Prettier in a Biome repo takes effect and does not leak
      to other repos.
- [x] 6.3 `pnpm lint`, typecheck, `cargo test`, build green.

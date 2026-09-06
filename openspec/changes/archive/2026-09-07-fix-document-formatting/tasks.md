> Small and self-contained: it fixes a live data-integrity bug (a global Biome
> reformatting Prettier projects) and ships the setting users assume exists.

## 1. Selection (Rust, `src-tauri/src/format.rs`)

- [x] 1.1 Add project-evidence detection: config-file globs and manifest
      dependency keys per formatter (Biome: `biome.json`/`biome.jsonc` or a
      `@biomejs/biome` dependency; Prettier: `.prettierrc*`, `prettier.config.*`,
      a `prettier` key or dependency in `package.json`; Ruff/Black: `ruff.toml`,
      `[tool.ruff]`/`[tool.black]` in `pyproject.toml`; RuboCop: `.rubocop.yml`).
- [x] 1.2 `candidates_for` emits an ambiguous-ecosystem candidate only with
      evidence; drop the bare-name global fallback for those. Keep PATH
      resolution for single-formatter toolchains (rustfmt, gofmt, shfmt).
- [x] 1.3 Return a structured result (formatter name + `changed` flag) instead of
      a bare string, so "already formatted" and "none declared" are distinct.
- [x] 1.4 Bound the formatter run with a timeout; kill the child on expiry.
- [x] 1.5 Tests: evidence gating (Prettier project + global Biome → Prettier),
      no-evidence → empty candidates, local-bin preference preserved, ordering
      preserved when both are declared.

## 2. Language-server formatting (frontend)

- [x] 2.1 Read `documentFormattingProvider` from the running server's
      capabilities for the active file (`src/lib/lsp.ts`).
- [x] 2.2 `formatDocument` tries `textDocument/formatting` first and applies the
      returned `TextEdit[]`; falls through to `format_file` on decline, error, or
      missing capability.
- [x] 2.3 Tests: server formats → no CLI invoked; server without the capability →
      CLI path taken and no error surfaced.

## 3. Format on save

- [x] 3.1 `formatOnSave` setting + Settings UI control next to the existing
      hygiene toggles.
- [x] 3.2 `CodeView.saveFile` awaits formatting before writing; hygiene applies
      to the formatted text; never runs when `pinned`.
- [x] 3.3 Guards: save always proceeds on formatter failure/timeout; discard the
      result if the document version changed while formatting.
- [x] 3.4 Tests: enabled saves formatted text; failure still saves; concurrent
      edit discards the stale format; pinned buffers untouched.

## 4. Reporting

- [x] 4.1 Manual Format Document surfaces "already formatted (via X)" and "no
      formatter declared for this project" as distinct, non-error notices.

## 5. Verify

- [~] 5.1 Live check in this repo (Biome declared) and in a Prettier project with
      a global Biome installed — each formats with its own tool.
- [x] 5.2 `pnpm lint`, typecheck, `cargo test`, build green.

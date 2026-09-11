## 1. The format

- [x] 1.1 `{ "folders": [{ "path": "." }, { "path": "../api" }] }` — VS Code's
      shape, because there is no reason to invent another and a reader may know
      that one.
- [x] 1.2 Serialize: paths relative to the file's directory when they can be
      expressed that way, absolute otherwise.
- [x] 1.3 Parse: resolve against the file's directory, drop entries that are not
      strings, tolerate a trailing comment-free superset (plain JSON only).

## 2. Open and save

- [x] 2.1 `openWorkspaceFile(path)`: read, resolve, open the first folder as the
      project root and the rest as extra roots; the file's path rides in the
      window's hash (`ws=`), the same way the project path does.
- [x] 2.2 `saveWorkspaceAs()`: file dialog defaulting to
      `<primary folder name>.reado-workspace`.
- [x] 2.3 Adding/removing a folder writes to the workspace file when the window was
      opened from one, and to `.reado/workspace.json` when it was not.
- [x] 2.4 A named folder that no longer exists is reported and skipped — never a
      silent half-open workspace.

## 3. Opened from the OS

- [x] 3.1 `open_from_args` / the file-open handler: a `.reado-workspace` argument
      opens the workspace instead of the text file.
- [x] 3.2 Declare the extension as a document type Reado handles in the bundle
      configuration, so double-click works on an installed build.

## 4. Menus

- [x] 4.1 File → Open Workspace…, File → Save Workspace As… (native menu + palette
      + i18n EN + IT and the locales this release adds).

## 5. Verify

- [x] 5.1 Unit tests: round-trip relative and absolute folders, resolution against
      the file's directory, a missing folder is skipped and reported, writes go to
      the workspace file when one is open and to `.reado/` when not.
- [x] 5.2 CHANGELOG entry under `[Unreleased]`.

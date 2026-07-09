# Tasks — Reading coverage

## 1. Logic (`src/lib/coverage.ts`)

- [x] 1.1 Pure `computeCoverage(files, read, changed)` → overall {read,total,pct},
      per-top-level-folder rows (read/total, largest first, root bucket), and the
      changed-since-read list (intersected with the live file set).

## 2. Tool registration

- [x] 2.1 Add `"coverage"` to the `Tool` union (`store.ts`).
- [x] 2.2 ActivityBar: always-available tool with an icon + label.
- [x] 2.3 ProjectView: `PANEL_TITLE` entry + render `<CoveragePanel />`.

## 3. Panel (`src/components/organisms/CoveragePanel.tsx`)

- [x] 3.1 Fetch `listFiles` (re-fetch on `treeNonce`); subscribe to read-progress.
- [x] 3.2 Overall header (pct + bar), folder rows (bars), changed-since-read list.
- [x] 3.3 Calm bar-grow motion, reduce-motion safe; honest empty state; a11y.

## 4. i18n

- [x] 4.1 `coverage.*` keys in `en.json` + `it.json`.

## 5. Tests

- [x] 5.1 `coverage.uitest.ts`: overall count, folder grouping/order, root bucket,
      changed list intersection, empty state.

## 6. Verify

- [x] 6.1 `pnpm typecheck && pnpm test`; impeccable + reduce-motion pass on the panel.

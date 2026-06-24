## 1. Index build & storage (Rust)

- [ ] 1.1 Add `src-tauri/src/semantic.rs`; register it in the Tauri module/command list.
- [ ] 1.2 Chunk the project by symbol/file — reuse the symbol index where available, fall back to file/window chunks; record path, line range, and a content hash per chunk.
- [ ] 1.3 Embed each chunk through a provider-agnostic embedding interface (local or external backend chosen at implementation time).
- [ ] 1.4 Persist vectors + chunk metadata under `.reado/semantic.sqlite` (gitignored), mirroring the rebuildable-cache pattern in `src-tauri/src/index.rs`.
- [ ] 1.5 Store index metadata: last-built timestamp, embedding model/dimension, and the file fingerprints the build covered.

## 2. Build / refresh / freshness (Rust)

- [ ] 2.1 Expose an explicit "build/refresh index" command (never auto-triggered silently).
- [ ] 2.2 Implement incremental refresh: re-embed only chunks whose content hash / mtime changed; drop chunks for deleted files.
- [ ] 2.3 Expose an index-status command returning state (absent / building / built / stale) plus last-built time and counts.
- [ ] 2.4 Compute staleness by comparing current project file fingerprints against the build's recorded fingerprints.

## 3. Query (Rust)

- [ ] 3.1 Add a query command that embeds the natural-language query and returns top-k chunks by vector similarity.
- [ ] 3.2 Shape results like existing search rows (path, line range, snippet) so the frontend can navigate them with existing logic; cap result count for responsiveness.

## 4. Frontend integration

- [ ] 4.1 Add `src/lib/semantic.ts` wrapping the build/refresh, status, and query commands.
- [ ] 4.2 Add a `semantic` mode/tool entry where needed in `src/lib/store.ts`.
- [ ] 4.3 Extend `src/components/organisms/SearchPanel.tsx` with a semantic mode: query input, ranked results with snippets, click-to-open at location (reuse existing result→editor navigation).
- [ ] 4.4 Surface index state (absent / building / built / stale) and an explicit "Build / Refresh index" action; never present a stale answer as current.
- [ ] 4.5 Add empty/error/loading states consistent with text search.

## 5. i18n & polish

- [ ] 5.1 Add EN+IT strings for semantic mode, build/refresh, freshness, and empty/error states (`src/i18n/locales/en.json|it.json`).
- [ ] 5.2 Use semantic OKLCH tokens (`bg-surface`, `border-line`, `text-ink/muted`, `accent`); verify WCAG AA contrast and keyboard navigation of results.

## 6. Verify

- [ ] 6.1 typecheck + cargo check + build green.

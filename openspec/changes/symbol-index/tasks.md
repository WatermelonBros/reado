# Tasks — Symbol index

## 1. Index (`src-tauri/src/symbols.rs`)

- [x] 1.1 `SymbolCache` state: `Mutex<HashMap<PathBuf,(SystemTime, Vec<DefRecord>)>>`.
- [x] 1.2 One combined extraction (compiled once) producing per-line `DefRecord`
      {name, score, kind, line, text} for keyword / assignment / call sites.
- [x] 1.3 `records_for(cache, path)`: mtime hit → clone; miss → read, extract,
      insert (bounded: clear past cap, skip files over a size threshold).
- [x] 1.4 Rewrite `list_symbols` (score-3 keyword records) and `find_definition`
      (records filtered by name, ranked) on top of the index; keep caps + camelCase.

## 2. Registration (`src-tauri/src/lib.rs`)

- [x] 2.1 `.manage(symbols::SymbolCache::default())`; both commands take the State.

## 3. Tests

- [x] 3.1 Keep the existing behaviour tests (lists symbols, ranks decls above
      calls, rejects non-identifiers) green through a fresh cache.
- [x] 3.2 Add: a cached second call returns identical results; an edited file
      (mtime bump) refreshes.

## 4. Verify

- [x] 4.1 `cargo fmt/clippy/test` on src-tauri.

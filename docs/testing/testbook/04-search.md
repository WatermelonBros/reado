# 4 — Search & Replace

Project-wide ripgrep search + literal replace. Entry: `SearchPanel.tsx`.

**Cases: 63.**

---

### TC-SEARCH-0001 — Open search panel
**As a** user, **when I** click "Cerca nel progetto…", **I expect** a query field and empty results.
- **Result:** PASS

### TC-SEARCH-0002 — Find matches
**As a** user, **when I** type a ≥2-char query, **I expect** matching lines with path:line.
- **Result:** PASS

### TC-SEARCH-0003 — Debounced search
**As a** user, **when I** type quickly, **I expect** the search runs after a pause.
- **Result:** PASS

### TC-SEARCH-0004 — Minimum query length
**As a** user, **when I** type a single character, **I expect** no search runs.
- **Result:** PASS

### TC-SEARCH-0005 — No-results message
**As a** user, **when I** query something that matches nothing, **I expect** a clear no-results message.
- **Result:** PASS

### TC-SEARCH-0006 — Open a result
**As a** user, **when I** click a result, **I expect** the file opens at that line.
- **Result:** PASS

### TC-SEARCH-0007 — Replace-all two-step confirm
**As a** user, **when I** click "Sostituisci tutto", **I expect** a confirm ("Conferma sostituzione") before any change.
- **Result:** PASS

### TC-SEARCH-0008 — Confirm replace changes files
**As a** user, **when I** confirm the replace, **I expect** every literal occurrence replaced + a count.
- **Result:** PASS

### TC-SEARCH-0009 — Replace disabled with no matches
**As a** user, **when I** have no matches, **I expect** "Sostituisci tutto" disabled.
- **Result:** PASS

### TC-SEARCH-0010 — Results refresh after replace
**As a** user, **when I** complete a replace, **I expect** the results list refreshes.
- **Result:** PASS

### TC-SEARCH-0011 — ripgrep missing handled
**As a** user, **when I** search without ripgrep, **I expect** a clear ripgrep-missing message.
- **Result:** TODO

### TC-SEARCH-0012 — Literal special chars
**As a** user, **when I** search `${name}` / `.*`, **I expect** literal matching, not regex.
- **Result:** TODO

### TC-SEARCH-0013 — Replace preserves surroundings
**As a** user, **when I** replace a token, **I expect** only the literal replaced, code intact.
- **Result:** PASS

### TC-SEARCH-0014 — Ignored paths excluded
**As a** user, **when I** search the project, **I expect** node_modules/.git excluded by default.
- **Result:** TODO

### TC-SEARCH-0015 — No console errors
**As a** user, **when I** search/replace, **I expect** no uncaught errors.
- **Result:** PASS

### TC-SEARCH-0016 — Query: a common word
**As a** user, **when I** search for a common word, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0017 — Query: a rare word
**As a** user, **when I** search for a rare word, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0018 — Query: a multi-word phrase
**As a** user, **when I** search for a multi-word phrase, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0019 — Query: leading/trailing spaces
**As a** user, **when I** search for leading/trailing spaces, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0020 — Query: a 1-char query
**As a** user, **when I** search for a 1-char query, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0021 — Query: a 200-char query
**As a** user, **when I** search for a 200-char query, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0022 — Query: an emoji
**As a** user, **when I** search for an emoji, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0023 — Query: a regex-special string
**As a** user, **when I** search for a regex-special string, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0024 — Query: a path-like string
**As a** user, **when I** search for a path-like string, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0025 — Query: a number
**As a** user, **when I** search for a number, **I expect** correct literal results or a graceful no-result.
- **Result:** TODO

### TC-SEARCH-0026 — 0 matches
**As a** user, **when I** run a query that yields 0 matches, **I expect** the list renders/virtualizes and stays responsive.
- **Result:** TODO

### TC-SEARCH-0027 — 1 matches
**As a** user, **when I** run a query that yields 1 matches, **I expect** the list renders/virtualizes and stays responsive.
- **Result:** TODO

### TC-SEARCH-0028 — 50 matches
**As a** user, **when I** run a query that yields 50 matches, **I expect** the list renders/virtualizes and stays responsive.
- **Result:** TODO

### TC-SEARCH-0029 — 1000 matches
**As a** user, **when I** run a query that yields 1000 matches, **I expect** the list renders/virtualizes and stays responsive.
- **Result:** TODO

### TC-SEARCH-0030 — Search panel at zoom 0.8
**As a** user, **when I** use search at zoom 0.8, **I expect** inputs, results and buttons scale without clipping.
- **Result:** TODO

### TC-SEARCH-0031 — Search panel at zoom 1.0
**As a** user, **when I** use search at zoom 1.0, **I expect** inputs, results and buttons scale without clipping.
- **Result:** TODO

### TC-SEARCH-0032 — Search panel at zoom 1.25
**As a** user, **when I** use search at zoom 1.25, **I expect** inputs, results and buttons scale without clipping.
- **Result:** TODO

### TC-SEARCH-0033 — Search panel at zoom 1.5
**As a** user, **when I** use search at zoom 1.5, **I expect** inputs, results and buttons scale without clipping.
- **Result:** TODO

### TC-SEARCH-0034 — Search panel at zoom 2.0
**As a** user, **when I** use search at zoom 2.0, **I expect** inputs, results and buttons scale without clipping.
- **Result:** TODO

### TC-SEARCH-0035 — Search results under reado-dark
**As a** user, **when I** view results in reado-dark, **I expect** match highlights legible.
- **Result:** TODO

### TC-SEARCH-0036 — Search results under reado-light
**As a** user, **when I** view results in reado-light, **I expect** match highlights legible.
- **Result:** TODO

### TC-SEARCH-0037 — Search results under reado-sepia
**As a** user, **when I** view results in reado-sepia, **I expect** match highlights legible.
- **Result:** TODO

### TC-SEARCH-0038 — Search results under reado-high-contrast
**As a** user, **when I** view results in reado-high-contrast, **I expect** match highlights legible.
- **Result:** TODO

### TC-SEARCH-0039 — a keyword in whole project
**As a** user, **when I** search a keyword across whole project, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0040 — a keyword in current file
**As a** user, **when I** search a keyword across current file, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0041 — a keyword in a subfolder
**As a** user, **when I** search a keyword across a subfolder, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0042 — a keyword in tracked files only
**As a** user, **when I** search a keyword across tracked files only, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0043 — a keyword in excluding ignored
**As a** user, **when I** search a keyword across excluding ignored, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0044 — a phrase in whole project
**As a** user, **when I** search a phrase across whole project, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0045 — a phrase in current file
**As a** user, **when I** search a phrase across current file, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0046 — a phrase in a subfolder
**As a** user, **when I** search a phrase across a subfolder, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0047 — a phrase in tracked files only
**As a** user, **when I** search a phrase across tracked files only, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0048 — a phrase in excluding ignored
**As a** user, **when I** search a phrase across excluding ignored, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0049 — a path fragment in whole project
**As a** user, **when I** search a path fragment across whole project, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0050 — a path fragment in current file
**As a** user, **when I** search a path fragment across current file, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0051 — a path fragment in a subfolder
**As a** user, **when I** search a path fragment across a subfolder, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0052 — a path fragment in tracked files only
**As a** user, **when I** search a path fragment across tracked files only, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0053 — a path fragment in excluding ignored
**As a** user, **when I** search a path fragment across excluding ignored, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0054 — a symbol name in whole project
**As a** user, **when I** search a symbol name across whole project, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0055 — a symbol name in current file
**As a** user, **when I** search a symbol name across current file, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0056 — a symbol name in a subfolder
**As a** user, **when I** search a symbol name across a subfolder, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0057 — a symbol name in tracked files only
**As a** user, **when I** search a symbol name across tracked files only, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0058 — a symbol name in excluding ignored
**As a** user, **when I** search a symbol name across excluding ignored, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0059 — a special-char string in whole project
**As a** user, **when I** search a special-char string across whole project, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0060 — a special-char string in current file
**As a** user, **when I** search a special-char string across current file, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0061 — a special-char string in a subfolder
**As a** user, **when I** search a special-char string across a subfolder, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0062 — a special-char string in tracked files only
**As a** user, **when I** search a special-char string across tracked files only, **I expect** correct scoped results.
- **Result:** TODO

### TC-SEARCH-0063 — a special-char string in excluding ignored
**As a** user, **when I** search a special-char string across excluding ignored, **I expect** correct scoped results.
- **Result:** TODO

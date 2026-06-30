# 9 — LSP (Outline / Problems / Hierarchy)

Language features. Outline is Rust-based (LSP-free); Problems/Hierarchy use a language server. Entry: `OutlinePanel.tsx`, `ProblemsPanel.tsx`, `HierarchyPanel.tsx`, `lsp.ts`.

**Cases: 93.**

---

### TC-LSP-0001 — Outline lists symbols (LSP-free)
**As a** user, **when I** open a file + Outline, **I expect** its symbols listed.
- **Result:** PASS

### TC-LSP-0002 — Outline navigation
**As a** user, **when I** click an outline symbol, **I expect** the editor jumps to it.
- **Result:** TODO

### TC-LSP-0003 — Diagnostics for a broken file
**As a** user, **when I** open a file with errors, **I expect** diagnostics from the server.
- **Result:** PASS

### TC-LSP-0004 — Problems panel groups by file
**As a** user, **when I** open Problems, **I expect** errors/warnings/info with counts + lines.
- **Result:** PASS

### TC-LSP-0005 — Diagnostic severities
**As a** user, **when I** view diagnostics, **I expect** correct error/warn/info mapping.
- **Result:** PASS

### TC-LSP-0006 — Problems navigation
**As a** user, **when I** click a problem, **I expect** the editor jumps to the line.
- **Result:** TODO

### TC-LSP-0007 — Diagnostics clear on fix
**As a** user, **when I** fix the error, **I expect** the diagnostic clears.
- **Result:** TODO

### TC-LSP-0008 — Hierarchy state healthy
**As a** user, **when I** open Hierarchy on a supported file, **I expect** not flagged unsupported.
- **Result:** PASS

### TC-LSP-0009 — Call hierarchy
**As a** user, **when I** request call hierarchy on a function, **I expect** callers/callees.
- **Result:** TODO

### TC-LSP-0010 — Type hierarchy
**As a** user, **when I** request type hierarchy, **I expect** super/sub types.
- **Result:** TODO

### TC-LSP-0011 — Graceful when no server
**As a** user, **when I** open a type with no server, **I expect** Outline still works, others degrade gracefully.
- **Result:** PARTIAL

### TC-LSP-0012 — didOpen across reload
**As a** user, **when I** reload with a file open then reopen, **I expect** no didOpen already-open error.
- **Result:** PASS → BUG-2 fixed

### TC-LSP-0013 — No console errors
**As a** user, **when I** use outline/problems, **I expect** no uncaught errors.
- **Result:** PASS

### TC-LSP-0014 — hover in JavaScript
**As a** user, **when I** use hover in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0015 — go-to-definition in JavaScript
**As a** user, **when I** use go-to-definition in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0016 — find-references in JavaScript
**As a** user, **when I** use find-references in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0017 — rename symbol in JavaScript
**As a** user, **when I** use rename symbol in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0018 — completion in JavaScript
**As a** user, **when I** use completion in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0019 — signature help in JavaScript
**As a** user, **when I** use signature help in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0020 — diagnostics in JavaScript
**As a** user, **when I** use diagnostics in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0021 — document symbols in JavaScript
**As a** user, **when I** use document symbols in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0022 — formatting in JavaScript
**As a** user, **when I** use formatting in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0023 — code actions in JavaScript
**As a** user, **when I** use code actions in a JavaScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0024 — hover in TypeScript
**As a** user, **when I** use hover in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0025 — go-to-definition in TypeScript
**As a** user, **when I** use go-to-definition in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0026 — find-references in TypeScript
**As a** user, **when I** use find-references in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0027 — rename symbol in TypeScript
**As a** user, **when I** use rename symbol in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0028 — completion in TypeScript
**As a** user, **when I** use completion in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0029 — signature help in TypeScript
**As a** user, **when I** use signature help in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0030 — diagnostics in TypeScript
**As a** user, **when I** use diagnostics in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0031 — document symbols in TypeScript
**As a** user, **when I** use document symbols in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0032 — formatting in TypeScript
**As a** user, **when I** use formatting in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0033 — code actions in TypeScript
**As a** user, **when I** use code actions in a TypeScript file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0034 — hover in Python
**As a** user, **when I** use hover in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0035 — go-to-definition in Python
**As a** user, **when I** use go-to-definition in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0036 — find-references in Python
**As a** user, **when I** use find-references in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0037 — rename symbol in Python
**As a** user, **when I** use rename symbol in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0038 — completion in Python
**As a** user, **when I** use completion in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0039 — signature help in Python
**As a** user, **when I** use signature help in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0040 — diagnostics in Python
**As a** user, **when I** use diagnostics in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0041 — document symbols in Python
**As a** user, **when I** use document symbols in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0042 — formatting in Python
**As a** user, **when I** use formatting in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0043 — code actions in Python
**As a** user, **when I** use code actions in a Python file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0044 — hover in Rust
**As a** user, **when I** use hover in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0045 — go-to-definition in Rust
**As a** user, **when I** use go-to-definition in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0046 — find-references in Rust
**As a** user, **when I** use find-references in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0047 — rename symbol in Rust
**As a** user, **when I** use rename symbol in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0048 — completion in Rust
**As a** user, **when I** use completion in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0049 — signature help in Rust
**As a** user, **when I** use signature help in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0050 — diagnostics in Rust
**As a** user, **when I** use diagnostics in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0051 — document symbols in Rust
**As a** user, **when I** use document symbols in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0052 — formatting in Rust
**As a** user, **when I** use formatting in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0053 — code actions in Rust
**As a** user, **when I** use code actions in a Rust file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0054 — hover in JSON
**As a** user, **when I** use hover in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0055 — go-to-definition in JSON
**As a** user, **when I** use go-to-definition in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0056 — find-references in JSON
**As a** user, **when I** use find-references in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0057 — rename symbol in JSON
**As a** user, **when I** use rename symbol in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0058 — completion in JSON
**As a** user, **when I** use completion in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0059 — signature help in JSON
**As a** user, **when I** use signature help in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0060 — diagnostics in JSON
**As a** user, **when I** use diagnostics in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0061 — document symbols in JSON
**As a** user, **when I** use document symbols in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0062 — formatting in JSON
**As a** user, **when I** use formatting in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0063 — code actions in JSON
**As a** user, **when I** use code actions in a JSON file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0064 — hover in CSS
**As a** user, **when I** use hover in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0065 — go-to-definition in CSS
**As a** user, **when I** use go-to-definition in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0066 — find-references in CSS
**As a** user, **when I** use find-references in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0067 — rename symbol in CSS
**As a** user, **when I** use rename symbol in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0068 — completion in CSS
**As a** user, **when I** use completion in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0069 — signature help in CSS
**As a** user, **when I** use signature help in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0070 — diagnostics in CSS
**As a** user, **when I** use diagnostics in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0071 — document symbols in CSS
**As a** user, **when I** use document symbols in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0072 — formatting in CSS
**As a** user, **when I** use formatting in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0073 — code actions in CSS
**As a** user, **when I** use code actions in a CSS file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0074 — hover in HTML
**As a** user, **when I** use hover in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0075 — go-to-definition in HTML
**As a** user, **when I** use go-to-definition in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0076 — find-references in HTML
**As a** user, **when I** use find-references in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0077 — rename symbol in HTML
**As a** user, **when I** use rename symbol in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0078 — completion in HTML
**As a** user, **when I** use completion in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0079 — signature help in HTML
**As a** user, **when I** use signature help in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0080 — diagnostics in HTML
**As a** user, **when I** use diagnostics in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0081 — document symbols in HTML
**As a** user, **when I** use document symbols in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0082 — formatting in HTML
**As a** user, **when I** use formatting in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0083 — code actions in HTML
**As a** user, **when I** use code actions in a HTML file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0084 — hover in Go
**As a** user, **when I** use hover in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0085 — go-to-definition in Go
**As a** user, **when I** use go-to-definition in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0086 — find-references in Go
**As a** user, **when I** use find-references in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0087 — rename symbol in Go
**As a** user, **when I** use rename symbol in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0088 — completion in Go
**As a** user, **when I** use completion in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0089 — signature help in Go
**As a** user, **when I** use signature help in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0090 — diagnostics in Go
**As a** user, **when I** use diagnostics in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0091 — document symbols in Go
**As a** user, **when I** use document symbols in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0092 — formatting in Go
**As a** user, **when I** use formatting in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

### TC-LSP-0093 — code actions in Go
**As a** user, **when I** use code actions in a Go file, **I expect** the LSP feature works or degrades gracefully if no server.
- **Result:** TODO

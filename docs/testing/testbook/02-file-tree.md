# 2 — File Tree

The file browser. Entry: `FileTree.tsx`. Activity-bar buttons are icon-only — target by `aria-label`; they toggle the sidebar when already active.

**Cases: 133.**

---

### TC-TREE-0001 — expand a collapsed folder
**As a** user, **when I** expand a collapsed folder, **I expect** it expands and reveals children (aria-expanded → true).
- **Result:** PASS

### TC-TREE-0002 — collapse an expanded folder
**As a** user, **when I** collapse an expanded folder, **I expect** it collapses.
- **Result:** PASS

### TC-TREE-0003 — click "Comprimi tutte le cartelle"
**As a** user, **when I** click "Comprimi tutte le cartelle", **I expect** every expanded folder collapses.
- **Result:** PASS

### TC-TREE-0004 — toggle "Mostra file nascosti e ignorati"
**As a** user, **when I** toggle "Mostra file nascosti e ignorati", **I expect** .git/.gitignore and ignored paths appear; toggling again hides them.
- **Result:** PASS

### TC-TREE-0005 — Open a JavaScript file
**As a** user, **when I** click a JavaScript file (.js), **I expect** CodeMirror with JS highlighting.
- **Result:** PASS

### TC-TREE-0006 — Open a TypeScript file
**As a** user, **when I** click a TypeScript file (.ts), **I expect** CodeMirror with TS highlighting.
- **Result:** TODO

### TC-TREE-0007 — Open a Python file
**As a** user, **when I** click a Python file (.py), **I expect** CodeMirror with Python highlighting.
- **Result:** PASS

### TC-TREE-0008 — Open a Markdown file
**As a** user, **when I** click a Markdown file (.md), **I expect** DocsView formatted preview.
- **Result:** PASS

### TC-TREE-0009 — Open a JSON file
**As a** user, **when I** click a JSON file (.json), **I expect** CodeMirror with JSON highlighting.
- **Result:** TODO

### TC-TREE-0010 — Open an SVG file
**As a** user, **when I** click an SVG file (.svg), **I expect** image preview (with an Open-as-text option).
- **Result:** TODO

### TC-TREE-0011 — Open a PNG image
**As a** user, **when I** click a PNG image (.png), **I expect** image preview.
- **Result:** PASS

### TC-TREE-0012 — Open a binary file
**As a** user, **when I** click a binary file (.bin), **I expect** a binary placeholder with the byte size.
- **Result:** PASS

### TC-TREE-0013 — Open a large file (2000+ lines)
**As a** user, **when I** click a large file (2000+ lines) (.txt), **I expect** virtualized CodeMirror, no freeze.
- **Result:** TODO

### TC-TREE-0014 — Open a file whose name has spaces & #hash
**As a** user, **when I** click a file whose name has spaces & #hash (.txt), **I expect** the file opens correctly.
- **Result:** TODO

### TC-TREE-0015 — Open an empty file
**As a** user, **when I** click an empty file (.txt), **I expect** an empty editor, no error.
- **Result:** TODO

### TC-TREE-0016 — File context-menu: Commenta il file
**As a** user, **when I** right-click a file and choose "Commenta il file", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0017 — File context-menu: Chiedi un audit all'AI
**As a** user, **when I** right-click a file and choose "Chiedi un audit all'AI", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0018 — File context-menu: Apri di fianco
**As a** user, **when I** right-click a file and choose "Apri di fianco", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0019 — File context-menu: Segna come letto
**As a** user, **when I** right-click a file and choose "Segna come letto", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0020 — File context-menu: Modifica sorgente (md/svg)
**As a** user, **when I** right-click a file and choose "Modifica sorgente (md/svg)", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0021 — File context-menu: Commenta il progetto
**As a** user, **when I** right-click a file and choose "Commenta il progetto", **I expect** the matching action to run.
- **Result:** PASS (items present)

### TC-TREE-0022 — Folder context-menu: Commenta la cartella
**As a** user, **when I** right-click a folder and choose "Commenta la cartella", **I expect** the matching action to run.
- **Result:** PASS

### TC-TREE-0023 — Folder context-menu: Chiedi un audit all'AI
**As a** user, **when I** right-click a folder and choose "Chiedi un audit all'AI", **I expect** the matching action to run.
- **Result:** PASS

### TC-TREE-0024 — Folder context-menu: Commenta il progetto
**As a** user, **when I** right-click a folder and choose "Commenta il progetto", **I expect** the matching action to run.
- **Result:** PASS

### TC-TREE-0025 — Nested folders deep
**As a** user, **when I** expand src/deep/nested, **I expect** each level reveals down to the leaf.
- **Result:** PASS

### TC-TREE-0026 — Watcher: new file appears
**As a** user, **when I** create a file on disk, **I expect** it appears in the tree with no manual refresh.
- **Result:** PASS

### TC-TREE-0027 — Watcher: deleted file disappears
**As a** user, **when I** delete a file on disk, **I expect** it disappears from the tree.
- **Result:** TODO

### TC-TREE-0028 — Watcher: renamed file
**As a** user, **when I** rename a file on disk, **I expect** the tree updates to the new name.
- **Result:** TODO

### TC-TREE-0029 — Drag-drop move/rename
**As a** user, **when I** drag a file onto a folder, **I expect** it moved there (move_path) and the tree updates.
- **Result:** MANUAL

### TC-TREE-0030 — Drag external files in
**As a** user, **when I** drop files from Finder onto a folder, **I expect** they are copied in (import_paths).
- **Result:** MANUAL

### TC-TREE-0031 — Open to side (split)
**As a** user, **when I** choose "Apri di fianco", **I expect** a second editor pane beside the current one.
- **Result:** PASS

### TC-TREE-0032 — Mark read toggles
**As a** user, **when I** choose "Segna come letto", **I expect** it marks read; menu then offers "Segna come non letto".
- **Result:** PASS

### TC-TREE-0033 — Tabs persist during tree use
**As a** user, **when I** browse/expand the tree, **I expect** open editor tabs stay open.
- **Result:** PASS

### TC-TREE-0034 — No console errors browsing
**As a** user, **when I** open/expand/collapse files, **I expect** no uncaught errors.
- **Result:** PASS

### TC-TREE-0035 — a JavaScript file row under reado-dark
**As a** user, **when I** view a JavaScript file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0036 — a JavaScript file row under reado-light
**As a** user, **when I** view a JavaScript file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0037 — a JavaScript file row under reado-sepia
**As a** user, **when I** view a JavaScript file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0038 — a JavaScript file row under reado-high-contrast
**As a** user, **when I** view a JavaScript file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0039 — a TypeScript file row under reado-dark
**As a** user, **when I** view a TypeScript file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0040 — a TypeScript file row under reado-light
**As a** user, **when I** view a TypeScript file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0041 — a TypeScript file row under reado-sepia
**As a** user, **when I** view a TypeScript file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0042 — a TypeScript file row under reado-high-contrast
**As a** user, **when I** view a TypeScript file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0043 — a Python file row under reado-dark
**As a** user, **when I** view a Python file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0044 — a Python file row under reado-light
**As a** user, **when I** view a Python file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0045 — a Python file row under reado-sepia
**As a** user, **when I** view a Python file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0046 — a Python file row under reado-high-contrast
**As a** user, **when I** view a Python file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0047 — a Markdown file row under reado-dark
**As a** user, **when I** view a Markdown file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0048 — a Markdown file row under reado-light
**As a** user, **when I** view a Markdown file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0049 — a Markdown file row under reado-sepia
**As a** user, **when I** view a Markdown file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0050 — a Markdown file row under reado-high-contrast
**As a** user, **when I** view a Markdown file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0051 — a JSON file row under reado-dark
**As a** user, **when I** view a JSON file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0052 — a JSON file row under reado-light
**As a** user, **when I** view a JSON file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0053 — a JSON file row under reado-sepia
**As a** user, **when I** view a JSON file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0054 — a JSON file row under reado-high-contrast
**As a** user, **when I** view a JSON file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0055 — an SVG file row under reado-dark
**As a** user, **when I** view an SVG file in the tree with reado-dark, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0056 — an SVG file row under reado-light
**As a** user, **when I** view an SVG file in the tree with reado-light, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0057 — an SVG file row under reado-sepia
**As a** user, **when I** view an SVG file in the tree with reado-sepia, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0058 — an SVG file row under reado-high-contrast
**As a** user, **when I** view an SVG file in the tree with reado-high-contrast, **I expect** the icon/label legible with correct contrast.
- **Result:** TODO

### TC-TREE-0059 — File tree at zoom 0.8
**As a** user, **when I** view the file tree at zoom 0.8, **I expect** rows, indents and icons scale cleanly without clipping.
- **Result:** TODO

### TC-TREE-0060 — File tree at zoom 1.0
**As a** user, **when I** view the file tree at zoom 1.0, **I expect** rows, indents and icons scale cleanly without clipping.
- **Result:** TODO

### TC-TREE-0061 — File tree at zoom 1.25
**As a** user, **when I** view the file tree at zoom 1.25, **I expect** rows, indents and icons scale cleanly without clipping.
- **Result:** TODO

### TC-TREE-0062 — File tree at zoom 1.5
**As a** user, **when I** view the file tree at zoom 1.5, **I expect** rows, indents and icons scale cleanly without clipping.
- **Result:** TODO

### TC-TREE-0063 — File tree at zoom 2.0
**As a** user, **when I** view the file tree at zoom 2.0, **I expect** rows, indents and icons scale cleanly without clipping.
- **Result:** TODO

### TC-TREE-0064 — Tree with 1 files
**As a** user, **when I** open a project of 1 files, **I expect** the tree stays responsive (fuzzy finder caps large lists).
- **Pre:** 1-file project
- **Result:** TODO

### TC-TREE-0065 — Tree with 50 files
**As a** user, **when I** open a project of 50 files, **I expect** the tree stays responsive (fuzzy finder caps large lists).
- **Pre:** 50-file project
- **Result:** TODO

### TC-TREE-0066 — Tree with 500 files
**As a** user, **when I** open a project of 500 files, **I expect** the tree stays responsive (fuzzy finder caps large lists).
- **Pre:** 500-file project
- **Result:** TODO

### TC-TREE-0067 — Tree with 5000 files
**As a** user, **when I** open a project of 5000 files, **I expect** the tree stays responsive (fuzzy finder caps large lists).
- **Pre:** 5000-file project
- **Result:** TODO

### TC-TREE-0068 — single-click to open: a JavaScript file
**As a** user, **when I** single-click to open a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0069 — keyboard-select: a JavaScript file
**As a** user, **when I** keyboard-select a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0070 — mark read: a JavaScript file
**As a** user, **when I** mark read a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0071 — comment on: a JavaScript file
**As a** user, **when I** comment on a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0072 — open to side: a JavaScript file
**As a** user, **when I** open to side a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0073 — reveal in tree: a JavaScript file
**As a** user, **when I** reveal in tree a JavaScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0074 — single-click to open: a TypeScript file
**As a** user, **when I** single-click to open a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0075 — keyboard-select: a TypeScript file
**As a** user, **when I** keyboard-select a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0076 — mark read: a TypeScript file
**As a** user, **when I** mark read a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0077 — comment on: a TypeScript file
**As a** user, **when I** comment on a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0078 — open to side: a TypeScript file
**As a** user, **when I** open to side a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0079 — reveal in tree: a TypeScript file
**As a** user, **when I** reveal in tree a TypeScript file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0080 — single-click to open: a Python file
**As a** user, **when I** single-click to open a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0081 — keyboard-select: a Python file
**As a** user, **when I** keyboard-select a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0082 — mark read: a Python file
**As a** user, **when I** mark read a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0083 — comment on: a Python file
**As a** user, **when I** comment on a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0084 — open to side: a Python file
**As a** user, **when I** open to side a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0085 — reveal in tree: a Python file
**As a** user, **when I** reveal in tree a Python file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0086 — single-click to open: a Markdown file
**As a** user, **when I** single-click to open a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0087 — keyboard-select: a Markdown file
**As a** user, **when I** keyboard-select a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0088 — mark read: a Markdown file
**As a** user, **when I** mark read a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0089 — comment on: a Markdown file
**As a** user, **when I** comment on a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0090 — open to side: a Markdown file
**As a** user, **when I** open to side a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0091 — reveal in tree: a Markdown file
**As a** user, **when I** reveal in tree a Markdown file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0092 — single-click to open: a JSON file
**As a** user, **when I** single-click to open a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0093 — keyboard-select: a JSON file
**As a** user, **when I** keyboard-select a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0094 — mark read: a JSON file
**As a** user, **when I** mark read a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0095 — comment on: a JSON file
**As a** user, **when I** comment on a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0096 — open to side: a JSON file
**As a** user, **when I** open to side a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0097 — reveal in tree: a JSON file
**As a** user, **when I** reveal in tree a JSON file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0098 — single-click to open: an SVG file
**As a** user, **when I** single-click to open an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0099 — keyboard-select: an SVG file
**As a** user, **when I** keyboard-select an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0100 — mark read: an SVG file
**As a** user, **when I** mark read an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0101 — comment on: an SVG file
**As a** user, **when I** comment on an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0102 — open to side: an SVG file
**As a** user, **when I** open to side an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0103 — reveal in tree: an SVG file
**As a** user, **when I** reveal in tree an SVG file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0104 — single-click to open: a PNG image
**As a** user, **when I** single-click to open a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0105 — keyboard-select: a PNG image
**As a** user, **when I** keyboard-select a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0106 — mark read: a PNG image
**As a** user, **when I** mark read a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0107 — comment on: a PNG image
**As a** user, **when I** comment on a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0108 — open to side: a PNG image
**As a** user, **when I** open to side a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0109 — reveal in tree: a PNG image
**As a** user, **when I** reveal in tree a PNG image, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0110 — single-click to open: a binary file
**As a** user, **when I** single-click to open a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0111 — keyboard-select: a binary file
**As a** user, **when I** keyboard-select a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0112 — mark read: a binary file
**As a** user, **when I** mark read a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0113 — comment on: a binary file
**As a** user, **when I** comment on a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0114 — open to side: a binary file
**As a** user, **when I** open to side a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0115 — reveal in tree: a binary file
**As a** user, **when I** reveal in tree a binary file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0116 — single-click to open: a large file (2000+ lines)
**As a** user, **when I** single-click to open a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0117 — keyboard-select: a large file (2000+ lines)
**As a** user, **when I** keyboard-select a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0118 — mark read: a large file (2000+ lines)
**As a** user, **when I** mark read a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0119 — comment on: a large file (2000+ lines)
**As a** user, **when I** comment on a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0120 — open to side: a large file (2000+ lines)
**As a** user, **when I** open to side a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0121 — reveal in tree: a large file (2000+ lines)
**As a** user, **when I** reveal in tree a large file (2000+ lines), **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0122 — single-click to open: a file whose name has spaces & #hash
**As a** user, **when I** single-click to open a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0123 — keyboard-select: a file whose name has spaces & #hash
**As a** user, **when I** keyboard-select a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0124 — mark read: a file whose name has spaces & #hash
**As a** user, **when I** mark read a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0125 — comment on: a file whose name has spaces & #hash
**As a** user, **when I** comment on a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0126 — open to side: a file whose name has spaces & #hash
**As a** user, **when I** open to side a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0127 — reveal in tree: a file whose name has spaces & #hash
**As a** user, **when I** reveal in tree a file whose name has spaces & #hash, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0128 — single-click to open: an empty file
**As a** user, **when I** single-click to open an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0129 — keyboard-select: an empty file
**As a** user, **when I** keyboard-select an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0130 — mark read: an empty file
**As a** user, **when I** mark read an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0131 — comment on: an empty file
**As a** user, **when I** comment on an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0132 — open to side: an empty file
**As a** user, **when I** open to side an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

### TC-TREE-0133 — reveal in tree: an empty file
**As a** user, **when I** reveal in tree an empty file, **I expect** the action applies correctly for that file type.
- **Result:** TODO

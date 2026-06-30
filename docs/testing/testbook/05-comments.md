# 5 — Comments / Annotations

Durable, AI-resolvable comments anchored to code. `.reado/comments/*.md` + SQLite. Entry: `CommentComposer.tsx`, `CommentsPanel.tsx`, `crates/reado-core`.

**Cases: 84.**

---

### TC-CMT-0001 — Open composer (Cmd+Shift+M)
**As a** user, **when I** select lines and press Cmd+Shift+M, **I expect** an inline composer near the selection.
- **Result:** PASS

### TC-CMT-0002 — Type picker
**As a** user, **when I** open the composer, **I expect** Bug/Refactor/Performance/Domanda/Nota choices.
- **Result:** PASS

### TC-CMT-0003 — Create a comment
**As a** user, **when I** pick a type, write a body, submit, **I expect** the comment created on the range.
- **Result:** PASS

### TC-CMT-0004 — Durable .md artifact
**As a** user, **when I** create a comment, **I expect** a .reado/comments/<id>.md with full frontmatter.
- **Result:** PASS

### TC-CMT-0005 — SQLite index updated
**As a** user, **when I** create a comment, **I expect** the index.sqlite updated.
- **Result:** PASS

### TC-CMT-0006 — Shows in panel
**As a** user, **when I** open the Comments panel, **I expect** the comment listed with type + body.
- **Result:** PASS

### TC-CMT-0007 — Gutter marker
**As a** user, **when I** have a comment on a line, **I expect** a gutter marker on it.
- **Result:** PASS

### TC-CMT-0008 — Open-task badge
**As a** user, **when I** have open task comments, **I expect** a count reflected in the UI.
- **Result:** PASS

### TC-CMT-0009 — Re-anchor follows shifted code
**As a** user, **when I** shift code above a comment, **I expect** the comment follows to new line numbers.
- **Result:** PASS

### TC-CMT-0010 — Orphan when code deleted
**As a** user, **when I** delete the anchored code, **I expect** the comment flagged orphan (not moved to a sibling).
- **Result:** PASS → BUG-3 fixed

### TC-CMT-0011 — Orphans panel
**As a** user, **when I** have orphaned comments, **I expect** them listed for re-anchoring.
- **Result:** TODO

### TC-CMT-0012 — Manual re-anchor
**As a** user, **when I** re-anchor an orphan to a new range, **I expect** set_anchor binds it, clears orphan.
- **Result:** TODO

### TC-CMT-0013 — Reply
**As a** user, **when I** reply to a comment, **I expect** the message appended + persisted.
- **Result:** PASS

### TC-CMT-0014 — Delete
**As a** user, **when I** delete a comment, **I expect** it gone from list and .md removed.
- **Result:** PASS

### TC-CMT-0015 — History view
**As a** user, **when I** switch to History, **I expect** resolved/archived comments.
- **Result:** TODO

### TC-CMT-0016 — No console errors
**As a** user, **when I** create/transition/reply/delete, **I expect** no uncaught errors.
- **Result:** PASS

### TC-CMT-0017 — Create bug comment, range scope
**As a** user, **when I** create a bug comment with range scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0018 — Create bug comment, file scope
**As a** user, **when I** create a bug comment with file scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0019 — Create bug comment, project scope
**As a** user, **when I** create a bug comment with project scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0020 — Create refactor comment, range scope
**As a** user, **when I** create a refactor comment with range scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0021 — Create refactor comment, file scope
**As a** user, **when I** create a refactor comment with file scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0022 — Create refactor comment, project scope
**As a** user, **when I** create a refactor comment with project scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0023 — Create performance comment, range scope
**As a** user, **when I** create a performance comment with range scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0024 — Create performance comment, file scope
**As a** user, **when I** create a performance comment with file scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0025 — Create performance comment, project scope
**As a** user, **when I** create a performance comment with project scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0026 — Create question/Domanda comment, range scope
**As a** user, **when I** create a question/Domanda comment with range scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0027 — Create question/Domanda comment, file scope
**As a** user, **when I** create a question/Domanda comment with file scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0028 — Create question/Domanda comment, project scope
**As a** user, **when I** create a question/Domanda comment with project scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0029 — Create note/Nota comment, range scope
**As a** user, **when I** create a note/Nota comment with range scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0030 — Create note/Nota comment, file scope
**As a** user, **when I** create a note/Nota comment with file scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0031 — Create note/Nota comment, project scope
**As a** user, **when I** create a note/Nota comment with project scope, **I expect** it persisted with the right type/kind/scope.
- **Result:** TODO

### TC-CMT-0032 — State open → in-progress
**As a** user, **when I** move a comment from open to in-progress, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0033 — State open → done
**As a** user, **when I** move a comment from open to done, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0034 — State open → discarded
**As a** user, **when I** move a comment from open to discarded, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0035 — State in-progress → open
**As a** user, **when I** move a comment from in-progress to open, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0036 — State in-progress → done
**As a** user, **when I** move a comment from in-progress to done, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0037 — State in-progress → discarded
**As a** user, **when I** move a comment from in-progress to discarded, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0038 — State done → open
**As a** user, **when I** move a comment from done to open, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0039 — State done → in-progress
**As a** user, **when I** move a comment from done to in-progress, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0040 — State done → discarded
**As a** user, **when I** move a comment from done to discarded, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0041 — State discarded → open
**As a** user, **when I** move a comment from discarded to open, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0042 — State discarded → in-progress
**As a** user, **when I** move a comment from discarded to in-progress, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0043 — State discarded → done
**As a** user, **when I** move a comment from discarded to done, **I expect** the new state persisted.
- **Result:** PASS (data layer)

### TC-CMT-0044 — Re-anchor: insert lines above
**As a** user, **when I** insert lines above under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0045 — Re-anchor: insert lines below
**As a** user, **when I** insert lines below under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0046 — Re-anchor: edit the snippet slightly
**As a** user, **when I** edit the snippet slightly under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0047 — Re-anchor: delete the snippet entirely
**As a** user, **when I** delete the snippet entirely under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0048 — Re-anchor: move the file
**As a** user, **when I** move the file under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0049 — Re-anchor: rename the file
**As a** user, **when I** rename the file under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0050 — Re-anchor: duplicate the snippet elsewhere
**As a** user, **when I** duplicate the snippet elsewhere under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0051 — Re-anchor: reformat the file
**As a** user, **when I** reformat the file under an anchored comment, **I expect** the comment follows correctly or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0052 — Comment thread under reado-dark
**As a** user, **when I** view a thread in reado-dark, **I expect** type colors and text legible.
- **Result:** TODO

### TC-CMT-0053 — Comment thread under reado-light
**As a** user, **when I** view a thread in reado-light, **I expect** type colors and text legible.
- **Result:** TODO

### TC-CMT-0054 — Comment thread under reado-sepia
**As a** user, **when I** view a thread in reado-sepia, **I expect** type colors and text legible.
- **Result:** TODO

### TC-CMT-0055 — Comment thread under reado-high-contrast
**As a** user, **when I** view a thread in reado-high-contrast, **I expect** type colors and text legible.
- **Result:** TODO

### TC-CMT-0056 — Composer at zoom 0.8
**As a** user, **when I** open the composer at zoom 0.8, **I expect** it anchors near the selection without clipping.
- **Result:** TODO

### TC-CMT-0057 — Composer at zoom 1.0
**As a** user, **when I** open the composer at zoom 1.0, **I expect** it anchors near the selection without clipping.
- **Result:** TODO

### TC-CMT-0058 — Composer at zoom 1.25
**As a** user, **when I** open the composer at zoom 1.25, **I expect** it anchors near the selection without clipping.
- **Result:** TODO

### TC-CMT-0059 — Composer at zoom 1.5
**As a** user, **when I** open the composer at zoom 1.5, **I expect** it anchors near the selection without clipping.
- **Result:** TODO

### TC-CMT-0060 — Composer at zoom 2.0
**As a** user, **when I** open the composer at zoom 2.0, **I expect** it anchors near the selection without clipping.
- **Result:** TODO

### TC-CMT-0061 — Re-anchor (a JavaScript file): shift code above
**As a** user, **when I** shift code above for a comment in a JavaScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0062 — Re-anchor (a JavaScript file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in a JavaScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0063 — Re-anchor (a JavaScript file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in a JavaScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0064 — Re-anchor (a JavaScript file): rename the file
**As a** user, **when I** rename the file for a comment in a JavaScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0065 — Re-anchor (a TypeScript file): shift code above
**As a** user, **when I** shift code above for a comment in a TypeScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0066 — Re-anchor (a TypeScript file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in a TypeScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0067 — Re-anchor (a TypeScript file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in a TypeScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0068 — Re-anchor (a TypeScript file): rename the file
**As a** user, **when I** rename the file for a comment in a TypeScript file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0069 — Re-anchor (a Python file): shift code above
**As a** user, **when I** shift code above for a comment in a Python file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0070 — Re-anchor (a Python file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in a Python file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0071 — Re-anchor (a Python file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in a Python file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0072 — Re-anchor (a Python file): rename the file
**As a** user, **when I** rename the file for a comment in a Python file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0073 — Re-anchor (a Markdown file): shift code above
**As a** user, **when I** shift code above for a comment in a Markdown file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0074 — Re-anchor (a Markdown file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in a Markdown file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0075 — Re-anchor (a Markdown file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in a Markdown file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0076 — Re-anchor (a Markdown file): rename the file
**As a** user, **when I** rename the file for a comment in a Markdown file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0077 — Re-anchor (a JSON file): shift code above
**As a** user, **when I** shift code above for a comment in a JSON file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0078 — Re-anchor (a JSON file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in a JSON file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0079 — Re-anchor (a JSON file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in a JSON file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0080 — Re-anchor (a JSON file): rename the file
**As a** user, **when I** rename the file for a comment in a JSON file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0081 — Re-anchor (an SVG file): shift code above
**As a** user, **when I** shift code above for a comment in an SVG file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0082 — Re-anchor (an SVG file): edit the snippet
**As a** user, **when I** edit the snippet for a comment in an SVG file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0083 — Re-anchor (an SVG file): delete the snippet
**As a** user, **when I** delete the snippet for a comment in an SVG file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

### TC-CMT-0084 — Re-anchor (an SVG file): rename the file
**As a** user, **when I** rename the file for a comment in an SVG file, **I expect** the comment follows or orphans — never silently mis-anchors.
- **Result:** TODO

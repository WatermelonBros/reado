/**
 * Re-indent pasted text to where it lands (VS Code's `editor.formatOnPaste`).
 *
 * Code copied from a browser, a chat or another file arrives carrying the
 * indentation it had *there*. Reado formats on save, which is no help while you
 * are writing — this is the other moment, and it is the one people feel.
 *
 * Deliberately the *indentation service*, not the formatter: a paste must not
 * reformat the rest of the document, must not wait on a server round trip, and
 * must land in one undo step. The block keeps its own internal shape; only the
 * level it sits at changes.
 */
import { getIndentation, indentString } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { useSettings } from "./store"

/** The width, in columns, of a line's leading whitespace. */
function leadingColumns(line: string, tabSize: number): number {
  let cols = 0
  for (const ch of line) {
    if (ch === " ") cols++
    else if (ch === "\t") cols += tabSize - (cols % tabSize)
    else break
  }
  return cols
}

/** Drop `cols` columns of leading whitespace, keeping any remainder. */
function dropColumns(line: string, cols: number, tabSize: number): string {
  let seen = 0
  let i = 0
  while (i < line.length && seen < cols) {
    const ch = line[i]
    if (ch === " ") seen++
    else if (ch === "\t") seen += tabSize - (seen % tabSize)
    else break
    i++
  }
  return line.slice(i)
}

/**
 * The pasted text, re-indented for `pos`, or null when there is nothing to do.
 *
 * Null is returned — meaning "paste it as it is" — for a single-line paste and
 * for a paste that lands mid-line: dropping a word into the middle of an
 * expression is not an indentation question.
 */
export function reindentPaste(state: EditorState, pos: number, text: string): string | null {
  const lines = text.split("\n")
  if (lines.length < 2) return null
  const line = state.doc.lineAt(pos)
  const beforeOnLine = state.doc.sliceString(line.from, pos)
  if (beforeOnLine.trim()) return null
  const want = getIndentation(state, line.from)
  if (want == null) return null

  const tabSize = state.tabSize
  // The block's own base level: the least-indented line that has anything on
  // it. The first line is excluded — the copy started wherever it started, so
  // its leading whitespace was left behind in the source.
  const bodies = lines.slice(1).filter((l) => l.trim())
  const base = bodies.length
    ? Math.min(...bodies.map((l) => leadingColumns(l, tabSize)))
    : leadingColumns(lines[0], tabSize)

  const unit = indentString(state, want)
  const indented = lines.map((l, i) => {
    if (i === 0) return l.trim() ? dropColumns(l, leadingColumns(l, tabSize), tabSize) : l
    if (!l.trim()) return ""
    const extra = leadingColumns(l, tabSize) - base
    return indentString(state, want + Math.max(0, extra)) + dropColumns(l, base + extra, tabSize)
  })
  // The first line inherits whatever indentation is already before the cursor,
  // so it is only prefixed when the cursor sits at the very start of the line.
  if (pos === line.from) indented[0] = indented[0] ? unit + indented[0] : indented[0]
  const out = indented.join("\n")
  return out === text ? null : out
}

/**
 * The paste handler. Returns true when it has handled the paste itself, which
 * is what keeps the insertion and its re-indentation in one transaction — and
 * therefore one undo step.
 */
export const formatOnPaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (!useSettings.getState().formatOnPaste || view.state.readOnly) return false
    const text = event.clipboardData?.getData("text/plain")
    if (!text) return false
    const sel = view.state.selection.main
    const fixed = reindentPaste(view.state, sel.from, text)
    if (fixed == null) return false
    event.preventDefault()
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: fixed },
      selection: { anchor: sel.from + fixed.length },
      userEvent: "input.paste",
    })
    return true
  },
})

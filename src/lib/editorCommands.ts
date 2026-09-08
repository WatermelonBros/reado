/**
 * Small editing commands VS Code has and CodeMirror doesn't ship.
 *
 * They are plain `Command`s (not `runOnView` wrappers) so they can be bound in
 * the editor's own keymap and act on the *focused* pane — the menu wrappers in
 * `lib/docInfo.ts` run the same functions through the active view.
 */
import { insertNewlineAndIndent } from "@codemirror/commands"
import { EditorSelection } from "@codemirror/state"
import type { Command, EditorView } from "@codemirror/view"

/** Open a new, indented line below the cursor's line and go there (⌘↵). */
export const insertLineBelow: Command = (view) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  view.dispatch({ selection: EditorSelection.cursor(line.to) })
  return insertNewlineAndIndent(view)
}

/** Open a new, indented line above the cursor's line and go there (⌘⇧↵). */
export const insertLineAbove: Command = (view) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  if (line.number === 1) {
    view.dispatch({ changes: { from: 0, insert: "\n" }, selection: EditorSelection.cursor(0) })
    return true
  }
  // Land at the end of the previous line and open below it: that way the new
  // line is indented by the same rule as any other Enter, instead of inheriting
  // column 0 from a naive insert at the line start.
  view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(line.number - 1).to) })
  return insertNewlineAndIndent(view)
}

/** Replace each multi-line selection with a cursor at the end of every spanned
 *  line (VS Code's "Add Cursors to Line Ends", ⇧⌥I). */
export const cursorsToLineEnds: Command = (view) => {
  const { state } = view
  const cursors = []
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    const last = state.doc.lineAt(r.to).number
    if (last > first) {
      for (let n = first; n <= last; n++) cursors.push(EditorSelection.cursor(state.doc.line(n).to))
    } else {
      cursors.push(EditorSelection.cursor(r.head))
    }
  }
  view.dispatch({ selection: EditorSelection.create(cursors) })
  return true
}

/** Duplicate each non-empty selection in place, after itself. */
export const duplicateSelectionCmd: Command = (view) => {
  const changes = view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => ({ from: r.to, insert: view.state.sliceDoc(r.from, r.to) }))
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

/** Apply `fn` to every non-empty selection, or to the caret's line when the
 *  selection is empty — the shape VS Code's case/line transforms use. */
function mapSelections(view: EditorView, fn: (text: string) => string): boolean {
  const { state } = view
  const changes = []
  for (const r of state.selection.ranges) {
    const { from, to } = r.empty ? state.doc.lineAt(r.head) : r
    if (from === to) continue
    const text = state.sliceDoc(from, to)
    const next = fn(text)
    if (next !== text) changes.push({ from, to, insert: next })
  }
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

/** Upper-case the selection (or the caret's line). */
export const upperCase: Command = (view) => mapSelections(view, (s) => s.toUpperCase())

/** Lower-case the selection (or the caret's line). */
export const lowerCase: Command = (view) => mapSelections(view, (s) => s.toLowerCase())

/** Title-case the selection: capitalise the first letter of every word and
 *  lower-case the rest, leaving separators alone. */
export const titleCase: Command = (view) =>
  mapSelections(view, (s) =>
    s.replace(/\p{L}[\p{L}\p{N}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  )

/** The whole lines each selection touches, as one span. With an empty
 *  selection the whole document is the span — "sort the file", the way VS Code
 *  reads a cursor-only sort. */
function lineSpan(view: EditorView): { from: number; to: number; lines: string[] } {
  const { state } = view
  const r = state.selection.main
  const wholeDoc = state.selection.ranges.every((x) => x.empty)
  const from = wholeDoc ? 0 : state.doc.lineAt(r.from).from
  const to = wholeDoc ? state.doc.length : state.doc.lineAt(r.to).to
  return { from, to, lines: state.sliceDoc(from, to).split("\n") }
}

function replaceLines(view: EditorView, from: number, to: number, lines: string[]): boolean {
  const insert = lines.join("\n")
  if (insert === view.state.sliceDoc(from, to)) return false
  view.dispatch({ changes: { from, to, insert } })
  return true
}

/** Sort the selected lines (or the document) with a locale-aware compare. */
export const sortLines =
  (dir: 1 | -1): Command =>
  (view) => {
    const { from, to, lines } = lineSpan(view)
    const sorted = [...lines].sort((a, b) => dir * a.localeCompare(b))
    return replaceLines(view, from, to, sorted)
  }

/** Drop repeated lines from the selection (or the document), keeping the first
 *  occurrence of each in place. */
export const deleteDuplicateLines: Command = (view) => {
  const { from, to, lines } = lineSpan(view)
  const seen = new Set<string>()
  const kept: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    kept.push(line)
  }
  return replaceLines(view, from, to, kept)
}

/** Pull the next line onto the current one, collapsing the join to a single
 *  space (⌃J). Over a selection, joins every line it spans. */
export const joinLines: Command = (view) => {
  const { state } = view
  const changes = []
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    // A caret joins the next line onto its own; a range joins everything it spans.
    const last = Math.max(first + 1, state.doc.lineAt(r.to).number)
    for (let n = first; n < last && n < state.doc.lines; n++) {
      const line = state.doc.line(n)
      const next = state.doc.line(n + 1)
      changes.push({
        from: line.to,
        to: next.from + (next.text.match(/^\s*/)?.[0].length ?? 0),
        // Don't invent a space when either side is empty.
        insert: line.text.trim() && next.text.trim() ? " " : "",
      })
    }
  }
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

/** Strip trailing spaces/tabs from every line (the on-demand twin of the
 *  trim-on-save setting). */
export const trimTrailingWhitespace: Command = (view) => {
  const changes = []
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n)
    const trailing = line.text.length - line.text.replace(/[ \t]+$/, "").length
    if (trailing) changes.push({ from: line.to - trailing, to: line.to })
  }
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

/** Re-indent every line's leading whitespace to `unit`, keeping the depth it
 *  already has. `width` is how many spaces one level was worth. */
export function convertIndentation(
  view: EditorView,
  to: "spaces" | "tabs",
  width: number,
): boolean {
  const changes = []
  for (let n = 1; n <= view.state.doc.lines; n++) {
    const line = view.state.doc.line(n)
    const lead = line.text.match(/^[ \t]*/)?.[0] ?? ""
    if (!lead) continue
    // Count in columns, so a mixed line converts by what it looks like.
    let cols = 0
    for (const ch of lead) cols += ch === "\t" ? width - (cols % width) : 1
    const depth = Math.floor(cols / width)
    const rest = cols % width
    const next = (to === "tabs" ? "\t".repeat(depth) : " ".repeat(depth * width)) + " ".repeat(rest)
    if (next !== lead) changes.push({ from: line.from, to: line.from + lead.length, insert: next })
  }
  if (!changes.length) return false
  view.dispatch({ changes })
  return true
}

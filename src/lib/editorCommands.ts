/**
 * Small editing commands VS Code has and CodeMirror doesn't ship.
 *
 * They are plain `Command`s (not `runOnView` wrappers) so they can be bound in
 * the editor's own keymap and act on the *focused* pane — the menu wrappers in
 * `lib/docInfo.ts` run the same functions through the active view.
 */
import { insertNewlineAndIndent } from "@codemirror/commands"
import { EditorSelection } from "@codemirror/state"
import type { Command } from "@codemirror/view"

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

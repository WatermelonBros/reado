/**
 * Inline change markers for PR review: highlight the lines a PR touched right in
 * the reliable code view (which keeps syntax highlighting and the comment
 * gutter), instead of dropping to a separate merge view.
 *
 * The ranges are head-side line numbers from `git_diff_lines` (base...head).
 */

import { RangeSetBuilder } from "@codemirror/state"
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view"

const changedLine = Decoration.line({ class: "cm-pr-changed" })

/** A decoration extension marking each changed line. Empty ranges → no-op. */
export function changedLinesHighlight(ranges: Array<[number, number]>) {
  const marked = new Set<number>()
  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) marked.add(n)
  }
  if (marked.size === 0) return []
  return EditorView.decorations.of((view): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>()
    const total = view.state.doc.lines
    for (let n = 1; n <= total; n++) {
      if (marked.has(n))
        builder.add(view.state.doc.line(n).from, view.state.doc.line(n).from, changedLine)
    }
    return builder.finish()
  })
}

/** A thin bar in the gutter, coloured by the theme. No glyph, no number: the
 *  question it answers is "did I touch this line", which is a yes/no. */
class ChangeMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div")
    el.className = "reado-diff-mark"
    return el
  }
}

const CHANGE_MARKER = new ChangeMarker()

/**
 * The diff gutter: mark every line that differs from the last commit.
 *
 * Ranges come from `git_working_diff_lines` (working tree vs HEAD) — not the
 * two-ref `git_diff_lines` above, which answers a different question: this is
 * about what *you* have changed and not committed.
 */
export function diffGutter(ranges: Array<[number, number]>) {
  const marked = new Set<number>()
  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) marked.add(n)
  }
  if (marked.size === 0) return []
  return gutter({
    class: "reado-diff-gutter",
    lineMarker: (view, block) =>
      marked.has(view.state.doc.lineAt(block.from).number) ? CHANGE_MARKER : null,
    // The set only changes when we rebuild it from fresh ranges.
    lineMarkerChange: () => false,
  })
}

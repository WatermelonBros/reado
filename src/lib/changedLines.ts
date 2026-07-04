/**
 * Inline change markers for PR review: highlight the lines a PR touched right in
 * the reliable code view (which keeps syntax highlighting and the comment
 * gutter), instead of dropping to a separate merge view.
 *
 * The ranges are head-side line numbers from `git_diff_lines` (base...head).
 */
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const changedLine = Decoration.line({ class: "cm-pr-changed" });

/** A decoration extension marking each changed line. Empty ranges → no-op. */
export function changedLinesHighlight(ranges: Array<[number, number]>) {
  const marked = new Set<number>();
  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) marked.add(n);
  }
  if (marked.size === 0) return [];
  return EditorView.decorations.of((view): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const total = view.state.doc.lines;
    for (let n = 1; n <= total; n++) {
      if (marked.has(n)) builder.add(view.state.doc.line(n).from, view.state.doc.line(n).from, changedLine);
    }
    return builder.finish();
  });
}

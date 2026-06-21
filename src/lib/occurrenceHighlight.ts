/**
 * Highlight every occurrence of the identifier under the cursor — a quiet
 * reading aid (see where a symbol is used without searching).
 *
 * Efficiency: only the visible ranges are scanned, and the decoration set is
 * rebuilt only when the selection, document, or viewport actually changes.
 */
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const occurrence = Decoration.mark({ class: "cm-occurrence" });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function build(view: EditorView): DecorationSet {
  const sel = view.state.selection.main;
  const word = view.state.wordAt(sel.head);
  // Only when the cursor sits on a word and there's no broad selection.
  if (!word || (!sel.empty && (sel.from !== word.from || sel.to !== word.to))) {
    return Decoration.none;
  }
  const name = view.state.doc.sliceString(word.from, word.to);
  if (name.length < 2) return Decoration.none;

  const re = new RegExp(`\\b${escapeRe(name)}\\b`, "g");
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      builder.add(from + m.index, from + m.index + name.length, occurrence);
    }
  }
  return builder.finish();
}

export const occurrenceHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.selectionSet || u.docChanged || u.viewportChanged) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

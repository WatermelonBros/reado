/**
 * CodeMirror gutter that marks lines carrying comments.
 *
 * A marker shows a quiet dot in Reado's out-of-palette marker colour; when more
 * than one comment shares a line it shows the count instead. Clicking a marker
 * invokes `onClick` with the line's comment ids so the thread can open.
 *
 * The extension is rebuilt (via a compartment) whenever the file's comments
 * change, so it always reflects the current anchors.
 */
import { gutter, GutterMarker, EditorView } from "@codemirror/view";
import { RangeSet } from "@codemirror/state";

/** Comment ids grouped by their (1-based) anchored line, with whether every
 * comment on that line is resolved (so the marker can show a "done" dot). */
export type LineComments = Map<number, { ids: string[]; done: boolean }>;

class CommentGutterMarker extends GutterMarker {
  constructor(
    private readonly count: number,
    private readonly done: boolean,
  ) {
    super();
  }
  override toDOM() {
    const el = document.createElement("span");
    el.className = `reado-gutter-marker${this.done ? " reado-gutter-marker--done" : ""}`;
    el.textContent = this.count > 1 ? String(this.count) : "";
    el.title = `${this.count} comment${this.count > 1 ? "s" : ""}${
      this.done ? " (resolved)" : ""
    }`;
    return el;
  }
}

/** Build the gutter extension for the given line→comments map. */
export function commentGutter(
  lines: LineComments,
  onClick: (lineNumber: number, ids: string[]) => void,
) {
  return gutter({
    class: "reado-comment-gutter",
    markers(view: EditorView) {
      if (lines.size === 0) return RangeSet.empty;
      const doc = view.state.doc;
      const ranges = [...lines.entries()]
        .filter(([line]) => line >= 1 && line <= doc.lines)
        .sort((a, b) => a[0] - b[0])
        .map(([line, { ids, done }]) =>
          new CommentGutterMarker(ids.length, done).range(doc.line(line).from),
        );
      return RangeSet.of(ranges);
    },
    domEventHandlers: {
      mousedown(view, block) {
        const line = view.state.doc.lineAt(block.from).number;
        const entry = lines.get(line);
        if (entry && entry.ids.length) {
          onClick(line, entry.ids);
          return true;
        }
        return false;
      },
    },
  });
}

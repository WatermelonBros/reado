/**
 * CodeMirror gutter that marks bookmarked lines with a quiet pin.
 *
 * Distinct from the comment gutter (which shows a marker dot / count): bookmarks
 * are a navigation aid, not annotations. Clicking the gutter on a line toggles a
 * bookmark there. Rebuilt via a compartment when the file's bookmarks change.
 */
import { gutter, GutterMarker, EditorView } from "@codemirror/view";
import { RangeSet } from "@codemirror/state";

class BookmarkMarker extends GutterMarker {
  override toDOM() {
    const el = document.createElement("span");
    el.className = "reado-bookmark-marker";
    // A small filled pin glyph; styling/colour comes from app.css.
    el.textContent = "▍";
    return el;
  }
}

/** Build the bookmark gutter for the given set of (1-based) bookmarked lines. */
export function bookmarkGutter(lines: Set<number>, onToggle: (line: number) => void) {
  return gutter({
    class: "reado-bookmark-gutter",
    markers(view: EditorView) {
      if (lines.size === 0) return RangeSet.empty;
      const doc = view.state.doc;
      const ranges = [...lines]
        .filter((line) => line >= 1 && line <= doc.lines)
        .sort((a, b) => a - b)
        .map((line) => new BookmarkMarker().range(doc.line(line).from));
      return RangeSet.of(ranges);
    },
    domEventHandlers: {
      mousedown(view, block) {
        onToggle(view.state.doc.lineAt(block.from).number);
        return true;
      },
    },
  });
}

/**
 * CodeMirror gutter that puts a run arrow on every line that declares a test,
 * tinted by how that test last went.
 *
 * The Test Explorer lists them; this is the same list where they are written,
 * which is where you are standing when you want to run one. Clicking the arrow
 * runs that test alone.
 */

import { RangeSet } from "@codemirror/state"
import { type EditorView, GutterMarker, gutter } from "@codemirror/view"
import type { TestStatus } from "./testing"

class TestMarker extends GutterMarker {
  constructor(private readonly status: TestStatus | undefined) {
    super()
  }
  override toDOM() {
    const el = document.createElement("span")
    // The status rides as a data attribute so the colour is app.css's business,
    // not this module's.
    el.className = "reado-test-marker"
    if (this.status) el.dataset.status = this.status
    el.textContent = "▶"
    return el
  }
}

/** Build the gutter for a file's test lines (1-based) and their verdicts. */
export function testGutter(
  lines: Map<number, TestStatus | undefined>,
  onRun: (line: number) => void,
) {
  return gutter({
    class: "reado-test-gutter",
    markers(view: EditorView) {
      if (lines.size === 0) return RangeSet.empty
      const doc = view.state.doc
      const ranges = [...lines.entries()]
        .filter(([line]) => line >= 1 && line <= doc.lines)
        .sort((a, b) => a[0] - b[0])
        .map(([line, status]) => new TestMarker(status).range(doc.line(line).from))
      return RangeSet.of(ranges)
    },
    domEventHandlers: {
      mousedown(view, block) {
        const line = view.state.doc.lineAt(block.from).number
        if (!lines.has(line)) return false
        onRun(line)
        return true
      },
    },
  })
}

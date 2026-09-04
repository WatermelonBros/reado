// The bookmark gutter: a quiet pin on bookmarked lines, and a click target that
// toggles one. Distinct from the comment gutter — bookmarks are navigation, not
// annotation.
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"
import { bookmarkGutter } from "@/lib/bookmarkGutter"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

/** Mount an editor whose gutter marks `lines`. */
function mount(lines: number[], onToggle = vi.fn()) {
  view = new EditorView({
    doc: "one\ntwo\nthree\nfour",
    extensions: [bookmarkGutter(new Set(lines), onToggle)],
    parent: document.body,
  })
  return { view, onToggle }
}

const pins = (v: EditorView) => v.dom.querySelectorAll(".reado-bookmark-marker")

describe("bookmarkGutter", () => {
  it("pins each bookmarked line", () => {
    const { view: v } = mount([1, 3])
    expect(pins(v)).toHaveLength(2)
  })

  it("draws nothing when the file has no bookmarks", () => {
    const { view: v } = mount([])
    expect(pins(v)).toHaveLength(0)
  })

  it("ignores a bookmark past the end of the file — the file may have shrunk", () => {
    const { view: v } = mount([2, 99, 0, -1])
    expect(pins(v)).toHaveLength(1)
  })

  it("toggles the line the clicked block belongs to", () => {
    const { view: v, onToggle } = mount([1])
    const cell = v.dom.querySelector(".reado-bookmark-gutter .cm-gutterElement") as HTMLElement
    // happy-dom lays nothing out, so every pointer resolves to the first block
    // and a hardcoded `onToggle(1)` would pass. Point the lookup at line 3.
    const third = v.state.doc.line(3).from
    vi.spyOn(v, "lineBlockAtHeight").mockReturnValue(v.lineBlockAt(third))
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(onToggle).toHaveBeenCalledWith(3)
  })
})

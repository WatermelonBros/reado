// The comment gutter: a marker on each commented line, and a click target that
// opens that line's thread. Distinct from the bookmark gutter — comments carry
// a count and a resolved state.
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"
import { commentGutter, type LineComments } from "@/lib/commentGutter"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

const entry = (ids: string[], done = false) => ({ ids, done })

/** Mount an editor whose gutter marks `lines`. */
function mount(lines: LineComments, onClick = vi.fn()) {
  view = new EditorView({
    doc: "one\ntwo\nthree\nfour",
    extensions: [commentGutter(lines, onClick)],
    parent: document.body,
  })
  return { view, onClick }
}

const markers = (v: EditorView) => v.dom.querySelectorAll(".reado-gutter-marker")

describe("commentGutter", () => {
  it("marks each commented line", () => {
    const { view: v } = mount(new Map([[1, entry(["c1"])]]))
    expect(markers(v)).toHaveLength(1)
  })

  it("builds its ranges in document order, whatever order the map is in", () => {
    // `RangeSet.of` requires sorted ranges and throws otherwise, so an
    // out-of-order map takes the whole code view down with it. Comments happen
    // to arrive from disk in file order today, which is why nothing noticed.
    const out = new Map([
      [3, entry(["c3"])],
      [1, entry(["c1"])],
      [2, entry(["c2"])],
    ])
    expect(() => mount(out)).not.toThrow()
    expect(markers(view as EditorView)).toHaveLength(3)
  })

  it("shows a count only once a line carries more than one comment", () => {
    const { view: v } = mount(
      new Map([
        [1, entry(["c1"])],
        [2, entry(["c2", "c3"])],
      ]),
    )
    const text = [...markers(v)].map((m) => m.textContent)
    expect(text).toEqual(["", "2"])
  })

  it("marks a resolved line differently, and says so in the hover", () => {
    const { view: v } = mount(new Map([[1, entry(["c1"], true)]]))
    const marker = markers(v)[0] as HTMLElement
    expect(marker.className).toContain("reado-gutter-marker--done")
    expect(marker.title).toBe("1 comment (resolved)")
  })

  it("ignores a comment anchored past the end of the file — it may have shrunk", () => {
    const { view: v } = mount(
      new Map([
        [1, entry(["c1"])],
        [99, entry(["gone"])],
        [0, entry(["bad"])],
      ]),
    )
    expect(markers(v)).toHaveLength(1)
  })

  it("hands the clicked line's comment ids to the caller", () => {
    const { view: v, onClick } = mount(new Map([[1, entry(["c1", "c2"])]]))
    const cell = v.dom.querySelector(".reado-comment-gutter .cm-gutterElement") as HTMLElement
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(onClick).toHaveBeenCalledWith(1, ["c1", "c2"])
  })
})

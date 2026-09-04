// The slim ruler down the scrollbar: one tick per thing worth scrolling to.
import { unifiedMergeView } from "@codemirror/merge"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import { diffRuler, overviewRuler } from "@/lib/overviewRuler"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

const ticks = (v: EditorView) => [...v.dom.querySelectorAll<HTMLElement>(".cm-overviewRuler-tick")]

/** The plugin first draws from `requestMeasure`, which happy-dom never flushes.
 *  Any effect-bearing transaction drives the same render through `update`
 *  synchronously — and unlike a doc edit it leaves the diff alone. */
const draw = (v: EditorView) => {
  v.dispatch({ effects: EditorView.scrollIntoView(0) })
  return v
}

describe("overviewRuler", () => {
  it("draws a tick per mark, at its line's fraction of the document", () => {
    const doc = "one\ntwo\nthree\nfour"
    view = new EditorView({
      doc,
      extensions: [
        overviewRuler((v) => [
          { pos: 0, color: "red" },
          { pos: v.state.doc.line(3).from, color: "blue" },
        ]),
      ],
      parent: document.body,
    })
    const t = ticks(draw(view))
    expect(t).toHaveLength(2)
    expect(t[0].style.background).toBe("red")
    expect(t[1].style.background).toBe("blue")
    // The first line sits at the top; the third is further down.
    expect(Number.parseFloat(t[0].style.top)).toBe(0)
    expect(Number.parseFloat(t[1].style.top)).toBeGreaterThan(0)
  })

  it("hides itself when there is nothing to mark", () => {
    view = new EditorView({
      doc: "one\ntwo",
      extensions: [overviewRuler(() => [])],
      parent: document.body,
    })
    const ruler = draw(view).dom.querySelector<HTMLElement>(".cm-overviewRuler")
    expect(ruler?.style.display).toBe("none")
    expect(ticks(view)).toHaveLength(0)
  })
})

describe("diffRuler", () => {
  it("marks every changed chunk, at a real position", () => {
    // `lineBlockAt` throws a RangeError for a position past the document, which
    // would take the whole view plugin down. The `Math.min(c.fromB, end)` clamp
    // in `diffRuler` guards that; note that no diff @codemirror/merge currently
    // produces actually reaches it, so this pins the marks rather than the clamp.
    const original = "one\ntwo\nthree\nfour\n"
    view = new EditorView({
      doc: "one\nCHANGED\nthree\n",
      extensions: [unifiedMergeView({ original, mergeControls: false }), diffRuler],
      parent: document.body,
    })
    const t = ticks(draw(view))
    expect(t.length).toBeGreaterThan(0)
    for (const tick of t) {
      const top = Number.parseFloat(tick.style.top)
      expect(Number.isNaN(top)).toBe(false)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top).toBeLessThanOrEqual(100)
      expect(tick.style.background).toContain("--accent")
    }
  })

  it("draws nothing when the two sides agree", () => {
    view = new EditorView({
      doc: "same\n",
      extensions: [unifiedMergeView({ original: "same\n", mergeControls: false }), diffRuler],
      parent: document.body,
    })
    expect(ticks(draw(view))).toHaveLength(0)
  })
})

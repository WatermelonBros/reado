// Browser test: the run arrow beside a test declaration sits on that line — its
// vertical centre on the line's centre — at the editor's font sizes and line
// heights. The arrow is set smaller than the code, and `--code-line-height` is a
// multiplier, so a line height taken from the arrow's own font once made its row
// shorter than the code's and left it riding high.

import { EditorState } from "@codemirror/state"
import { EditorView, GutterMarker, gutter, lineNumbers } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import { readoAppearance } from "@/lib/codemirror"
import { testGutter } from "@/lib/testGutter"

let host: HTMLElement | null = null
afterEach(() => host?.remove())

class Blame extends GutterMarker {
  override toDOM() {
    const el = document.createElement("span")
    el.className = "reado-blame"
    el.textContent = "ana · 2d"
    return el
  }
}

const centre = (r: DOMRect) => r.top + r.height / 2

describe.each([
  { fontSize: 13, lineHeight: 1.65 },
  { fontSize: 16, lineHeight: 2 },
  { fontSize: 11, lineHeight: 1.3 },
])("at $fontSize px, line height $lineHeight", ({ fontSize, lineHeight }) => {
  it("puts the arrow on the test's line", async () => {
    host = document.createElement("div")
    // What CodeView sets on its host; the app theme reads it.
    host.style.cssText = `--code-font-size:${fontSize}px;--code-line-height:${lineHeight}`
    document.body.append(host)
    const doc = [
      "import { it } from 'vitest'",
      "",
      "it('adds', () => {",
      "  expect(1).toBe(1)",
      "})",
    ]
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: doc.join("\n"),
        extensions: [
          readoAppearance,
          lineNumbers(),
          testGutter(new Map([[3, undefined]]), () => {}),
          // The blame column: smaller text in a gutter, the same trap.
          gutter({
            class: "reado-blame-gutter",
            lineMarker: (_v, line) =>
              _v.state.doc.lineAt(line.from).number === 3 ? new Blame() : null,
          }),
        ],
      }),
    })
    // Let CodeMirror measure its lines and size the gutters to them.
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
    const marker = host.querySelector(".reado-test-marker") as HTMLElement
    const line = host.querySelectorAll(".cm-line")[2] as HTMLElement
    expect(marker).not.toBeNull()
    const blame = host.querySelector(".reado-blame") as HTMLElement
    expect(
      Math.abs(centre(blame.getBoundingClientRect()) - centre(line.getBoundingClientRect())),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(centre(marker.getBoundingClientRect()) - centre(line.getBoundingClientRect())),
    ).toBeLessThanOrEqual(1)
    view.destroy()
  })
})

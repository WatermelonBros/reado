// The swatch beside each colour literal, and the click that asks for a picker.
import { EditorSelection } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"
import { colorSwatches, type SwatchHit, swatchesInRanges } from "@/lib/colorSwatch"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

function mount(doc: string, onPick: (hit: SwatchHit) => void = vi.fn()) {
  view = new EditorView({ doc, extensions: [colorSwatches(onPick)], parent: document.body })
  return view
}

const swatches = (v: EditorView) => [...v.dom.querySelectorAll<HTMLElement>(".reado-color-swatch")]

describe("colorSwatches", () => {
  it("paints one swatch per literal, with that literal as its colour", () => {
    const v = mount("--a: #d94f4f;\n--b: rgb(1, 2, 3);")
    // The literal is valid CSS, so the browser paints it — no conversion here.
    expect(swatches(v).map((s) => s.style.getPropertyValue("--swatch"))).toEqual([
      "#d94f4f",
      "rgb(1, 2, 3)",
    ])
  })

  it("draws nothing for a document with no colours", () => {
    expect(swatches(mount("const x = 1\nconst y = 2"))).toHaveLength(0)
  })

  it("hands the click the literal's range, so a picker can rewrite exactly it", () => {
    const onPick = vi.fn()
    const doc = "--a: #d94f4f;"
    const v = mount(doc, onPick)
    swatches(v)[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    const hit = onPick.mock.lastCall?.[0] as SwatchHit
    expect(doc.slice(hit.from, hit.to)).toBe("#d94f4f")
    expect(hit.format).toBe("hex")
    expect(hit.text).toBe("#d94f4f")
  })

  it("reports the notation that was clicked, so the rewrite keeps the dialect", () => {
    const onPick = vi.fn()
    const doc = "--a: #d94f4f;\n--b: oklch(0.74 0.11 260);\n--c: hsl(0, 50%, 50%);"
    const v = mount(doc, onPick)
    const click = (i: number) =>
      swatches(v)[i].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    const lastFormat = () => (onPick.mock.lastCall?.[0] as SwatchHit | undefined)?.format
    click(1)
    expect(lastFormat()).toBe("oklch")
    click(2)
    expect(lastFormat()).toBe("hsl")
  })

  it("reports the range of the literal it was clicked on, not the first one", () => {
    const onPick = vi.fn()
    const doc = "--a: #d94f4f;\n--b: #00ff00;"
    const v = mount(doc, onPick)
    swatches(v)[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    const hit = onPick.mock.lastCall?.[0] as SwatchHit
    expect(doc.slice(hit.from, hit.to)).toBe("#00ff00")
  })

  it("doesn't move the caret — the swatch is a control, not text", () => {
    const v = mount("--a: #d94f4f;")
    v.dispatch({ selection: EditorSelection.cursor(0) })
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    swatches(v)[0].dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(v.state.selection.main.head).toBe(0)
  })

  it("follows an edit: the swatch tracks the colour's new value", () => {
    const v = mount("--a: #d94f4f;")
    v.dispatch({ changes: { from: 5, to: 12, insert: "#00ff00" } })
    expect(swatches(v).map((s) => s.style.getPropertyValue("--swatch"))).toEqual(["#00ff00"])
  })

  it("drops the swatch when the colour stops being one", () => {
    const v = mount("--a: #d94f4f;")
    v.dispatch({ changes: { from: 5, to: 12, insert: "inherit" } })
    expect(swatches(v)).toHaveLength(0)
  })
})

describe("swatchesInRanges", () => {
  const doc = (text: string) => ({
    sliceString: (from: number, to: number) => text.slice(from, to),
  })

  it("reports document offsets, not offsets within the scanned range", () => {
    // The plugin scans the *visible* ranges, which in a long file start well
    // past zero — happy-dom always reports one range from 0, so this is the
    // only place the offsetting can be caught.
    const text = `${"\n".repeat(100)}--a: #d94f4f;`
    const found = swatchesInRanges(doc(text), [{ from: 100, to: text.length }])
    expect(found).toHaveLength(1)
    expect(text.slice(found[0].from, found[0].to)).toBe("#d94f4f")
  })

  it("collects across several ranges", () => {
    const text = "#111111 ......... #222222"
    const found = swatchesInRanges(doc(text), [
      { from: 0, to: 7 },
      { from: 18, to: text.length },
    ])
    expect(found.map((f) => f.text)).toEqual(["#111111", "#222222"])
    expect(text.slice(found[1].from, found[1].to)).toBe("#222222")
  })
})

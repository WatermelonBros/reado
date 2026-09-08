// Folding to a level. Depth is measured by indentation column, not by syntax
// nesting: that is the definition a reader already has in their eye, it works
// without a grammar, and it agrees with what the fold gutter offers.
import {
  foldable,
  foldedRanges,
  foldGutter,
  LanguageDescription,
  type LanguageSupport,
} from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { foldToLevel } from "@/lib/foldLevels"
import { languages } from "@/lib/languages"

let js: LanguageSupport
beforeAll(async () => {
  const desc = LanguageDescription.matchFilename(languages, "a.js")
  if (!desc) throw new Error("no JavaScript language pack")
  js = await desc.load()
})

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

const DOC = `function outer() {
  if (a) {
    inner()
  }
}
function second() {
  body()
}
`

function mount(doc = DOC) {
  view = new EditorView({
    doc,
    parent: document.createElement("div"),
    extensions: [js, foldGutter()],
  })
  return view
}

/** The 1-based start lines of everything currently folded. */
function foldedAt(v: EditorView): number[] {
  const lines: number[] = []
  foldedRanges(v.state).between(0, v.state.doc.length, (from) => {
    lines.push(v.state.doc.lineAt(from).number)
  })
  return lines.sort((a, b) => a - b)
}

describe("foldToLevel", () => {
  it("folds only the outermost scopes at level 1", () => {
    const v = mount()
    expect(foldToLevel(1)(v)).toBe(true)
    // Both top-level functions, and nothing nested inside them.
    expect(foldedAt(v)).toEqual([1, 6])
  })

  it("folds the inner scopes too at level 2", () => {
    const v = mount()
    foldToLevel(2)(v)
    // The `if` inside the first function; the outer ones stay open, which is
    // what makes "show me one level deeper" mean anything.
    expect(foldedAt(v)).toEqual([2])
  })

  it("re-opens when a shallower level is asked for", () => {
    // Without the unfold first, levels would only ever collapse further and
    // going back up would be impossible.
    const v = mount()
    foldToLevel(2)(v)
    foldToLevel(1)(v)
    expect(foldedAt(v)).toEqual([1, 6])
  })

  it("reports nothing to do past the deepest level in the file", () => {
    const v = mount()
    expect(foldToLevel(9)(v)).toBe(false)
  })

  it("reports nothing to do in a file with no foldable ranges", () => {
    const v = mount("just one line\n")
    expect(foldable(v.state, 0, v.state.doc.line(1).to)).toBeNull()
    expect(foldToLevel(1)(v)).toBe(false)
  })

  it("measures depth in columns, so tabs and spaces agree", () => {
    // The same structure indented with tabs must fold at the same levels.
    const tabbed = "function outer() {\n\tif (a) {\n\t\tinner()\n\t}\n}\n"
    const v = mount(tabbed)
    foldToLevel(1)(v)
    expect(foldedAt(v)).toEqual([1])
    foldToLevel(2)(v)
    expect(foldedAt(v)).toEqual([2])
  })
})

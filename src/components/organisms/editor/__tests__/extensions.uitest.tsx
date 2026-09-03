// The editor's shared extensions: the transient highlight fields, go-to-definition
// resolution, and the settings-driven extension builders.
import { EditorSelection, EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const findDefinition = vi.fn<
  (root: string, name: string) => Promise<Array<{ path: string; line: number }>>
>(async () => [])
const resolveImport = vi.fn(async (..._a: unknown[]) => null as string | null)
vi.mock("../../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/api")>()),
  findDefinition: (root: string, name: string) => findDefinition(root, name),
  resolveImport: (...a: unknown[]) => resolveImport(...a),
}))
const lspLocate = vi.fn((..._a: unknown[]) => false)
vi.mock("../../../../lib/lsp", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/lsp")>()),
  lspLocate: (...a: unknown[]) => lspLocate(...a),
}))

import { Compartment } from "@codemirror/state"
import {
  activeLineExt,
  blockField,
  buildFocusDeco,
  editableExtension,
  filePathFacet,
  findReferencesAt,
  focusBlockField,
  focusExtension,
  goToDefinitionAt,
  goToImplementationAt,
  goToTypeDefinitionAt,
  gotoDefinitionHandlers,
  human,
  indentGuidesExt,
  isMarkdown,
  landingField,
  lineNumbersExt,
  linkField,
  rulerExt,
  setBlock,
  setLanding,
  setLink,
  useReconfigure,
} from "@/components/organisms/editor/extensions"
import { useProject, useWorkspace } from "@/lib/store"

let view: EditorView | undefined

/** An editor over `doc` with the given extensions, mounted for real. */
function mount(doc: string, extensions: Extension) {
  view = new EditorView({
    state: EditorState.create({ doc, extensions }),
    parent: document.body,
  })
  return view
}

/** How many decorations a decoration field currently holds. */
const decoCount = (v: EditorView, field: typeof landingField) => v.state.field(field).size

beforeEach(() => {
  vi.clearAllMocks()
  lspLocate.mockReturnValue(false)
  useProject.setState({ root: "/repo", active: "/repo/src/a.ts", open: vi.fn() })
  useWorkspace.setState({ searchFor: vi.fn() })
})
afterEach(() => {
  view?.destroy()
  view = undefined
})

describe("human", () => {
  it("scales bytes to the largest unit that fits", () => {
    expect(human(512)).toBe("512 B")
    expect(human(2048)).toBe("2.0 KB")
    expect(human(5 * 1024 * 1024)).toBe("5.0 MB")
    expect(human(3 * 1024 ** 3)).toBe("3.0 GB")
  })

  it("drops the decimal once the number is big enough to not need it", () => {
    expect(human(15 * 1024)).toBe("15 KB")
  })

  it("stops at GB rather than inventing a unit", () => {
    expect(human(5000 * 1024 ** 3)).toContain("GB")
  })
})

describe("isMarkdown", () => {
  it("covers the markdown extensions, case-insensitively", () => {
    for (const p of ["a.md", "a.markdown", "a.MDX", "/deep/README.md"]) {
      expect(isMarkdown(p)).toBe(true)
    }
  })

  it("is false for anything else", () => {
    for (const p of ["a.ts", "a.mdx.ts", "mdfile", "a.md.bak"]) expect(isMarkdown(p)).toBe(false)
  })
})

describe("the landing-line highlight", () => {
  it("lights the requested line, and only that one", () => {
    const v = mount("a\nb\nc", [landingField])
    v.dispatch({ effects: setLanding.of(2) })
    expect(decoCount(v, landingField)).toBe(1)
  })

  it("clamps past the end of the document", () => {
    const v = mount("a\nb", [landingField])
    v.dispatch({ effects: setLanding.of(99) })
    expect(decoCount(v, landingField)).toBe(1)
    // Clamped to the *last* line — clamping to line 1 would also draw one.
    expect(v.state.field(landingField).iter().from).toBe(v.state.doc.line(2).from)
  })

  it("clears on null", () => {
    const v = mount("a\nb", [landingField])
    v.dispatch({ effects: setLanding.of(1) })
    v.dispatch({ effects: setLanding.of(null) })
    expect(decoCount(v, landingField)).toBe(0)
  })
})

describe("the anchored-block highlight", () => {
  it("lights every line of the open thread's block", () => {
    const v = mount("a\nb\nc\nd", [blockField])
    v.dispatch({ effects: setBlock.of({ from: 2, to: 4 }) })
    expect(decoCount(v, blockField)).toBe(3)
    v.dispatch({ effects: setBlock.of(null) })
    expect(decoCount(v, blockField)).toBe(0)
  })
})

describe("the modifier-hover link underline", () => {
  it("underlines the hovered word and clears again", () => {
    const v = mount("const value = 1", [linkField])
    v.dispatch({ effects: setLink.of({ from: 6, to: 11 }) })
    expect(decoCount(v, linkField)).toBe(1)
    v.dispatch({ effects: setLink.of(null) })
    expect(decoCount(v, linkField)).toBe(0)
  })
})

describe("goToDefinitionAt", () => {
  it("opens a relative import at the path it resolves to", async () => {
    resolveImport.mockResolvedValue("/repo/src/b.ts")
    const v = mount('import x from "./b"', [filePathFacet.of("/repo/src/a.ts")])
    goToDefinitionAt(v, 16) // inside "./b"
    await vi.waitFor(() =>
      expect(resolveImport).toHaveBeenCalledWith("/repo", "/repo/src/a.ts", "./b"),
    )
    await vi.waitFor(() =>
      expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/b.ts"),
    )
  })

  it("falls back to the active file when the view carries no path", async () => {
    const v = mount('import x from "../c"', [])
    goToDefinitionAt(v, 17)
    await vi.waitFor(() =>
      expect(resolveImport).toHaveBeenCalledWith("/repo", "/repo/src/a.ts", "../c"),
    )
  })

  it("prefers the language server when one is attached", () => {
    lspLocate.mockReturnValue(true)
    const v = mount("const value = 1", [])
    goToDefinitionAt(v, 8)
    expect(findDefinition).not.toHaveBeenCalled()
  })

  it("falls back to the symbol index with no server", async () => {
    findDefinition.mockResolvedValue([{ path: "/repo/src/b.ts", line: 9 }])
    const v = mount("const value = 1", [])
    goToDefinitionAt(v, 8)
    await vi.waitFor(() => expect(findDefinition).toHaveBeenCalledWith("/repo", "value"))
    await vi.waitFor(() =>
      expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/b.ts", 9),
    )
  })

  it("does nothing off a word", () => {
    const v = mount("   ", [])
    goToDefinitionAt(v, 1)
    expect(findDefinition).not.toHaveBeenCalled()
  })

  it("treats a bare package name as an identifier, not a path", async () => {
    const v = mount('import x from "react"', [])
    goToDefinitionAt(v, 16)
    expect(resolveImport).not.toHaveBeenCalled()
    // …and it *is* looked up as a symbol, which is the other half of the name.
    await vi.waitFor(() => expect(findDefinition).toHaveBeenCalledWith("/repo", "react"))
  })
})

describe("stringLiteralAt (via goToDefinitionAt)", () => {
  it("handles single, double and backtick quotes", async () => {
    for (const src of ["import x from './b'", 'import x from "./b"', "const p = `./b`"]) {
      resolveImport.mockClear()
      const v = mount(src, [])
      goToDefinitionAt(v, src.indexOf("./b") + 1)
      await vi.waitFor(() =>
        expect(resolveImport).toHaveBeenCalledWith("/repo", expect.any(String), "./b"),
      )
      v.destroy()
    }
  })
})

describe("findReferencesAt", () => {
  it("searches the workspace for the word at the caret", () => {
    const v = mount("const wanted = 1", [])
    v.dispatch({ selection: EditorSelection.cursor(8) })
    expect(findReferencesAt(v)).toBe(true)
    expect(useWorkspace.getState().searchFor).toHaveBeenCalledWith("wanted")
  })

  it("reports no-op when the caret isn't on a word", () => {
    const v = mount("   ", [])
    expect(findReferencesAt(v)).toBe(false)
  })
})

describe("focus mode", () => {
  it("lights the block enclosing the caret, and nothing when off", () => {
    const src = "function f() {\n  const x = 1\n}\nconst y = 2\n"
    const state = EditorState.create({ doc: src, selection: { anchor: src.indexOf("const x") } })
    // The three lines of `f()`, not the whole four-line document.
    expect(buildFocusDeco(state).size).toBe(3)
    expect(focusExtension(false)).toEqual([])
    expect(focusExtension(true)).not.toEqual([])
  })
})

describe("the settings-driven extensions", () => {
  it("editable mirrors manual-editing mode", () => {
    const ro = mount("x", editableExtension(false))
    expect(ro.state.readOnly).toBe(true)
    ro.destroy()
    view = undefined
    const rw = mount("x", editableExtension(true))
    expect(rw.state.readOnly).toBe(false)
  })

  /** The numbers the gutter is actually showing, in order. */
  const gutterNumbers = (v: EditorView) =>
    [...v.dom.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
      .slice(1) // the first element is CodeMirror's width spacer, not a line
      .map((n) => n.textContent ?? "")
      .filter(Boolean)

  it("line numbers: off, absolute, or relative to the caret", () => {
    expect(lineNumbersExt("off")).toEqual([])

    const abs = mount("a\nb\nc\nd", lineNumbersExt("on"))
    expect(gutterNumbers(abs)).toEqual(["1", "2", "3", "4"])
    abs.destroy()
    view = undefined

    const rel = mount("a\nb\nc\nd", lineNumbersExt("relative"))
    // Distance from the caret's line — which keeps its own absolute number — so
    // with the caret on line 1 the column reads 1, 1, 2, 3 rather than 1, 2, 3, 4.
    expect(gutterNumbers(rel)).toEqual(["1", "1", "2", "3"])
  })

  it("active line: off, gutter, line, or both — each emphasises its own half", () => {
    const emphasis = (mode: Parameters<typeof activeLineExt>[0]) => {
      const v = mount("a\nb\nc", [lineNumbersExt("on"), activeLineExt(mode)])
      const found = {
        line: !!v.dom.querySelector(".cm-activeLine"),
        gutter: !!v.dom.querySelector(".cm-activeLineGutter"),
      }
      v.destroy()
      view = undefined
      return found
    }
    expect(emphasis("off")).toEqual({ line: false, gutter: false })
    expect(emphasis("gutter")).toEqual({ line: false, gutter: true })
    expect(emphasis("line")).toEqual({ line: true, gutter: false })
    expect(emphasis("both")).toEqual({ line: true, gutter: true })
  })

  it("indent guides: off, or the marker extension for either mode", () => {
    // The markers themselves are drawn from measured character widths, which
    // happy-dom has none of — so only the on/off decision is observable here.
    expect(indentGuidesExt("off")).toEqual([])
    expect(indentGuidesExt("all")).not.toEqual([])
    expect(indentGuidesExt("active")).not.toEqual([])
    // Fresh closures per call make `not.toEqual` free — read the config the
    // two modes actually differ in.
    const cfg = (m: "all" | "active") =>
      (indentGuidesExt(m) as unknown as [{ value: { highlightActiveBlock: boolean } }])[0].value
    expect(cfg("all").highlightActiveBlock).toBe(false)
    expect(cfg("active").highlightActiveBlock).toBe(true)
  })

  it("the ruler tags the content with its column, and is off at 0", () => {
    expect(rulerExt(0)).toEqual([])
    const v = mount("x", rulerExt(80))
    const content = v.dom.querySelector(".cm-content") as HTMLElement
    expect(content.className).toContain("cm-ruler")
    expect(content.style.getPropertyValue("--ruler-col").trim()).toBe("80")
  })
})

describe("useReconfigure", () => {
  it("dispatches a reconfigure when its dependency changes, not on every render", () => {
    const comp = new Compartment()
    const v = mount("x", [comp.of([])])
    const ref = { current: v }
    const spy = vi.spyOn(v, "dispatch")
    const { rerender } = renderHook(({ n }) => useReconfigure(ref, comp, [], [n]), {
      initialProps: { n: 1 },
    })
    expect(spy).toHaveBeenCalledTimes(1)
    rerender({ n: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    rerender({ n: 2 })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("is a no-op before the view exists", () => {
    const comp = new Compartment()
    const ref = { current: null }
    expect(() => renderHook(() => useReconfigure(ref, comp, [], [1]))).not.toThrow()
  })
})

describe("goToTypeDefinitionAt / goToImplementationAt", () => {
  it("ask the server, and open what it resolves", () => {
    lspLocate.mockImplementation((...args: unknown[]) => {
      ;(args[3] as (p: string, l: number) => void)("/repo/src/b.ts", 7)
      return true
    })
    const v = mount("const value = 1", [])
    goToTypeDefinitionAt(v, 8)
    expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/b.ts", 7)
    goToImplementationAt(v, 8)
    expect(lspLocate).toHaveBeenLastCalledWith(v, 8, "implementation", expect.any(Function))
  })
})

describe("modifier-click go-to-definition", () => {
  /** Mount with the DOM handlers and the underline field attached. */
  const mountWithHandlers = (doc: string) => mount(doc, [gotoDefinitionHandlers, linkField])

  it("navigates on a modifier-click, and leaves a plain click alone", () => {
    const v = mountWithHandlers("const value = 1")
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(8)
    const content = v.contentDOM

    content.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    expect(lspLocate).not.toHaveBeenCalled()

    content.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, metaKey: true }),
    )
    expect(lspLocate).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("underlines nothing when the pointer isn't over a document position", () => {
    const v = mountWithHandlers("const value = 1")
    // Seed a real underline first — an already-empty field proves nothing.
    const posAt = vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(8)
    const hover = () =>
      v.contentDOM.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, cancelable: true, ctrlKey: true }),
      )
    hover()
    expect(v.state.field(linkField).size).toBe(1)

    posAt.mockReturnValue(null)
    hover()
    expect(v.state.field(linkField).size).toBe(0)
    vi.restoreAllMocks()
  })

  it("underlines the word under a modifier-hover, and clears it on release", () => {
    const v = mountWithHandlers("const value = 1")
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(8)
    v.contentDOM.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, cancelable: true, metaKey: true }),
    )
    expect(v.state.field(linkField).size).toBe(1)

    v.contentDOM.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }))
    expect(v.state.field(linkField).size).toBe(0)
    vi.restoreAllMocks()
  })

  it("underlines nothing when the hover isn't over a word", () => {
    const v = mountWithHandlers("value    ")
    const posAt = vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(2)
    const hover = () =>
      v.contentDOM.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, cancelable: true, metaKey: true }),
      )
    hover()
    expect(v.state.field(linkField).size).toBe(1)

    // Same gesture, over the blank run instead of the word.
    posAt.mockReturnValue(7)
    hover()
    expect(v.state.field(linkField).size).toBe(0)
    vi.restoreAllMocks()
  })
})

describe("the focus-block field", () => {
  it("re-lights the block as the caret moves, and survives an edit", () => {
    const src = "function f() {\n  const x = 1\n}\nfunction g() {\n  ok()\n}\n"
    const v = mount(src, [focusBlockField])
    // *Which* lines, not how many: both functions are three lines long, so a
    // caret move that re-lights nothing would keep the count at 3.
    const lit = () => {
      const out: number[] = []
      v.state.field(focusBlockField).between(0, v.state.doc.length, (from) => {
        out.push(v.state.doc.lineAt(from).number)
      })
      return out
    }
    expect(lit()).toEqual([1, 2, 3])
    v.dispatch({ selection: EditorSelection.cursor(v.state.doc.line(4).from) })
    expect(lit()).toEqual([4, 5, 6])
    // An edit *with no caret move* must re-light too — dispatching a selection
    // here would only ever exercise the `tr.selection` branch.
    v.dispatch({ changes: { from: v.state.doc.line(5).from, insert: "  more()\n" } })
    expect(lit()).toEqual([4, 5, 6, 7])
  })
})

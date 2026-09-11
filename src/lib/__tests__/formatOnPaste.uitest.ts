// Format on paste: the pasted block is re-indented to where it lands, keeping
// its own internal shape. Driven through a real editor, with an indent service
// standing in for a language — the same door the feature asks through.
import { indentService } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import { formatOnPaste, reindentPaste } from "@/lib/formatOnPaste"
import { useSettings } from "@/lib/store"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
  useSettings.setState({ formatOnPaste: false })
})

/** An editor over `doc` with the caret at `pos`. */
function editor(doc: string, pos: number) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: pos },
      // A stand-in for a language's indenter: inside this document, one level
      // in. The unit under test is the re-indentation, not the language.
      extensions: [indentService.of(() => 2), formatOnPaste],
    }),
    parent: document.body,
  })
  return view
}

describe("reindentPaste", () => {
  it("re-indents a block to the level it lands at, keeping its own shape", () => {
    // The caret is inside a function body, so one level in.
    const doc = "function f() {\n  \n}\n"
    const v = editor(doc, doc.indexOf("\n  \n") + 3)
    const pasted = "if (a) {\n    b()\n}"
    const out = reindentPaste(v.state, v.state.selection.main.from, pasted)
    expect(out).toBe("if (a) {\n      b()\n  }")
  })

  it("leaves a single-line paste alone", () => {
    const v = editor("const a = 1\n", 10)
    expect(reindentPaste(v.state, 10, "x + y")).toBeNull()
  })

  it("leaves a paste that lands mid-line alone", () => {
    const doc = "function f() {\n  const a = 1\n}\n"
    const v = editor(doc, doc.indexOf("= 1") + 2)
    expect(reindentPaste(v.state, v.state.selection.main.from, "a\nb")).toBeNull()
  })

  it("keeps blank lines blank instead of filling them with spaces", () => {
    const doc = "function f() {\n  \n}\n"
    const v = editor(doc, doc.indexOf("\n  \n") + 3)
    const out = reindentPaste(v.state, v.state.selection.main.from, "a()\n\nb()")
    expect(out).toBe("a()\n\n  b()")
  })
})

describe("the paste handler", () => {
  /** Paste `text` at the caret, the way the browser delivers it. */
  const paste = (v: EditorView, text: string) => {
    const data = new DataTransfer()
    data.setData("text/plain", text)
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    })
    v.contentDOM.dispatchEvent(event)
    return event
  }

  it("does nothing at all while the setting is off", () => {
    const doc = "function f() {\n  \n}\n"
    const v = editor(doc, doc.indexOf("\n  \n") + 3)
    paste(v, "if (a) {\n    b()\n}")
    // CodeMirror's own paste handling goes ahead: the text lands exactly as it
    // was copied, over-indented body and all.
    expect(v.state.doc.toString()).toBe("function f() {\n  if (a) {\n    b()\n}\n}\n")
  })

  it("inserts the re-indented text in one undo step", () => {
    useSettings.setState({ formatOnPaste: true })
    const doc = "function f() {\n  \n}\n"
    const v = editor(doc, doc.indexOf("\n  \n") + 3)
    const event = paste(v, "if (a) {\n    b()\n}")
    expect(event.defaultPrevented).toBe(true)
    expect(v.state.doc.toString()).toBe("function f() {\n  if (a) {\n      b()\n  }\n}\n")
    // One transaction — so one ⌘Z, which is the whole point of handling the
    // paste ourselves rather than re-indenting after the fact.
    expect(v.state.selection.main.empty).toBe(true)
  })
})

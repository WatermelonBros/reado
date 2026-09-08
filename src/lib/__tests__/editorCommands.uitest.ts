// The small editing commands VS Code has and CodeMirror doesn't ship. Each is
// run against a real editor: what is pinned is the resulting document, not the
// shape of a transaction.
import { EditorSelection, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import {
  convertIndentation,
  deleteDuplicateLines,
  joinLines,
  lowerCase,
  sortLines,
  titleCase,
  trimTrailingWhitespace,
  upperCase,
} from "@/lib/editorCommands"

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

/** Mount `doc`, optionally with a selection, and return the view. */
function mount(doc: string, sel?: { anchor: number; head: number }) {
  view = new EditorView({
    doc,
    parent: document.createElement("div"),
    extensions: [EditorState.allowMultipleSelections.of(true)],
    selection: sel ? EditorSelection.single(sel.anchor, sel.head) : undefined,
  })
  return view
}
const text = () => view?.state.doc.toString()

describe("case transforms", () => {
  it("act on the selection when there is one", () => {
    const v = mount("hello world", { anchor: 0, head: 5 })
    upperCase(v)
    expect(text()).toBe("HELLO world")
  })

  it("fall back to the caret's whole line when there is no selection", () => {
    // This is the reason they are worth reaching for without selecting first.
    const v = mount("hello\nworld", { anchor: 8, head: 8 })
    upperCase(v)
    expect(text()).toBe("hello\nWORLD")
  })

  it("lower-case and title-case the same span", () => {
    const v = mount("HELLO WORLD", { anchor: 0, head: 11 })
    lowerCase(v)
    expect(text()).toBe("hello world")
    titleCase(v)
    expect(text()).toBe("Hello World")
  })

  it("title-case leaves separators alone and lowers the rest of each word", () => {
    const v = mount("foo-BAR baz_QUX", { anchor: 0, head: 15 })
    titleCase(v)
    expect(text()).toBe("Foo-Bar Baz_Qux")
  })

  it("report doing nothing when the span is already in that case", () => {
    const v = mount("ABC", { anchor: 0, head: 3 })
    expect(upperCase(v)).toBe(false)
  })
})

describe("sortLines", () => {
  it("sorts the selected lines, leaving the rest of the document put", () => {
    const v = mount("c\nb\na\nkeep", { anchor: 0, head: 5 })
    sortLines(1)(v)
    expect(text()).toBe("a\nb\nc\nkeep")
  })

  it("sorts descending too", () => {
    const v = mount("a\nb\nc", { anchor: 0, head: 5 })
    sortLines(-1)(v)
    expect(text()).toBe("c\nb\na")
  })

  it("sorts the whole document from a bare caret", () => {
    const v = mount("c\na\nb", { anchor: 0, head: 0 })
    sortLines(1)(v)
    expect(text()).toBe("a\nb\nc")
  })
})

describe("deleteDuplicateLines", () => {
  it("keeps the first of each repeat, in place", () => {
    const v = mount("a\nb\na\nc\nb")
    deleteDuplicateLines(v)
    expect(text()).toBe("a\nb\nc")
  })

  it("does nothing when every line is distinct", () => {
    const v = mount("a\nb\nc")
    expect(deleteDuplicateLines(v)).toBe(false)
  })
})

describe("joinLines", () => {
  it("pulls the next line up with a single space, dropping its indentation", () => {
    const v = mount("const a =\n    1", { anchor: 0, head: 0 })
    joinLines(v)
    expect(text()).toBe("const a = 1")
  })

  it("invents no space when either side is empty", () => {
    const v = mount("a\n\nb", { anchor: 0, head: 0 })
    joinLines(v)
    expect(text()).toBe("a\nb")
  })

  it("joins every line a selection spans", () => {
    const v = mount("a\nb\nc\nd", { anchor: 0, head: 5 })
    joinLines(v)
    expect(text()).toBe("a b c\nd")
  })

  it("does nothing on the last line", () => {
    const v = mount("only", { anchor: 0, head: 0 })
    expect(joinLines(v)).toBe(false)
  })
})

describe("trimTrailingWhitespace", () => {
  it("strips trailing spaces and tabs from every line", () => {
    const v = mount("a   \nb\t\n  c  ")
    trimTrailingWhitespace(v)
    expect(text()).toBe("a\nb\n  c")
  })

  it("leaves a clean document untouched", () => {
    const v = mount("a\nb")
    expect(trimTrailingWhitespace(v)).toBe(false)
  })
})

describe("convertIndentation", () => {
  it("turns leading spaces into tabs at the given width", () => {
    const v = mount("a\n    b\n        c")
    convertIndentation(v, "tabs", 4)
    expect(text()).toBe("a\n\tb\n\t\tc")
  })

  it("turns leading tabs into spaces", () => {
    const v = mount("a\n\tb\n\t\tc")
    convertIndentation(v, "spaces", 2)
    expect(text()).toBe("a\n  b\n    c")
  })

  it("counts a mixed line by the columns it occupies", () => {
    // A tab advances to the next multiple of the width, so "\t  " at width 4 is
    // six columns: one full level plus two loose spaces, and both survive.
    const v = mount("\t  x")
    convertIndentation(v, "spaces", 4)
    expect(text()).toBe("      x")
  })

  it("leaves lines with no indentation alone", () => {
    const v = mount("a\nb")
    expect(convertIndentation(v, "tabs", 2)).toBe(false)
  })
})

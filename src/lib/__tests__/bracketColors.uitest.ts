// Bracket-pair colouring. Asserted through a real view's DOM, because what is
// worth pinning is the class a given bracket ends up with — the depth counting,
// the mismatch case, and that a brace inside a string is left alone.
import { LanguageDescription, type LanguageSupport } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { bracketColors } from "@/lib/bracketColors"
import { languages } from "@/lib/languages"

// A real grammar, loaded the way the editor loads one, so "is this position
// inside a string?" is answered by an actual syntax tree.
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

/** The bracket class applied to each decorated character, in document order. */
function levels(doc: string, lang = true): string[] {
  view = new EditorView({
    doc,
    parent: document.createElement("div"),
    extensions: lang ? [js, bracketColors] : [bracketColors],
  })
  return [...view.dom.querySelectorAll('[class*="cm-bracket-"]')].map((el) => {
    const cls = [...el.classList].find((c) => c.startsWith("cm-bracket-"))
    return cls?.replace("cm-bracket-", "") ?? ""
  })
}

describe("bracketColors", () => {
  it("tints by nesting depth, and reuses the level on the way back out", () => {
    // ( [ ( ) ] ) — the outer pair is level 0, the next 1, the innermost 2, and
    // each closer matches its own opener's level.
    expect(levels("a([()])")).toEqual(["l0", "l1", "l2", "l2", "l1", "l0"])
  })

  it("restarts the cycle after a pair closes", () => {
    expect(levels("(a)(b)")).toEqual(["l0", "l0", "l0", "l0"])
  })

  it("wraps around after six levels rather than running out of colours", () => {
    const open = "(".repeat(7)
    expect(levels(open).slice(0, 7)).toEqual(["l0", "l1", "l2", "l3", "l4", "l5", "l0"])
  })

  it("marks a closer with no opener instead of colouring it", () => {
    expect(levels("a)b")).toEqual(["unmatched"])
  })

  it("marks a closer that doesn't match the innermost opener", () => {
    // `(]` must not silently consume the paren: the bracket is wrong, and the
    // paren is still open.
    expect(levels("(]")).toEqual(["l0", "unmatched"])
  })

  it("ignores brackets inside a string, where a brace is just a character", () => {
    expect(levels('f("(")')).toEqual(["l0", "l0"])
  })

  it("ignores brackets inside a comment", () => {
    expect(levels("a // (\n(b)")).toEqual(["l0", "l0"])
  })

  it("still colours a document with no language, where nothing is a string", () => {
    // Plain text has no syntax tree to consult; the depth counting has to work
    // on its own rather than colouring nothing at all.
    expect(levels("(a)", false)).toEqual(["l0", "l0"])
  })
})

// Emmet, bound to Tab. In a read-first editor the interesting half is when it
// *declines*: Tab is a key people press all day for indentation, and a Tab that
// silently rewrites a word is the reason people switch Emmet off.
import { LanguageDescription, type LanguageSupport } from "@codemirror/language"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { abbreviationAt, emmetSyntax, expandAbbreviation } from "@/lib/emmet"
import { languages } from "@/lib/languages"

let htmlLang: LanguageSupport
let cssLang: LanguageSupport
let tsxLang: LanguageSupport
async function load(file: string) {
  const desc = LanguageDescription.matchFilename(languages, file)
  if (!desc) throw new Error(`no language pack for ${file}`)
  return desc.load()
}
beforeAll(async () => {
  ;[htmlLang, cssLang, tsxLang] = await Promise.all([load("a.html"), load("a.css"), load("a.tsx")])
})

let view: EditorView | undefined
afterEach(() => {
  view?.destroy()
  view = undefined
})

/** Mount `doc` with the caret at the end and try to expand there. */
function expandAt(doc: string, path: string, lang: LanguageSupport) {
  view = new EditorView({
    doc,
    parent: document.createElement("div"),
    selection: { anchor: doc.length },
    extensions: [lang],
  })
  const handled = expandAbbreviation(view, path)
  return { handled, text: view.state.doc.toString() }
}

describe("emmetSyntax", () => {
  it("knows the markup and stylesheet families, and nothing else", () => {
    expect(emmetSyntax("a.html")).toBe("html")
    expect(emmetSyntax("a.tsx")).toBe("html")
    expect(emmetSyntax("a.vue")).toBe("html")
    expect(emmetSyntax("a.scss")).toBe("css")
    expect(emmetSyntax("a.ts")).toBeNull()
    expect(emmetSyntax("a.rs")).toBeNull()
    expect(emmetSyntax("README.md")).toBeNull()
  })
})

describe("expandAbbreviation", () => {
  it("expands a real abbreviation in HTML", () => {
    const { handled, text } = expandAt("ul>li*2", "a.html", htmlLang)
    expect(handled).toBe(true)
    expect(text).toContain("<ul>")
    expect(text.match(/<li>/g)).toHaveLength(2)
  })

  it("expands a stylesheet abbreviation", () => {
    const { handled, text } = expandAt("m10", "a.css", cssLang)
    expect(handled).toBe(true)
    expect(text).toBe("margin: 10px;")
  })

  it("declines in a language Emmet has nothing to say about", () => {
    // Tab has to keep indenting in the other 99% of files.
    const { handled, text } = expandAt("ul>li*2", "a.ts", htmlLang)
    expect(handled).toBe(false)
    expect(text).toBe("ul>li*2")
  })

  it("declines on a bare word, which is far more often just a word", () => {
    const { handled } = expandAt("div", "a.html", htmlLang)
    expect(handled).toBe(false)
  })

  it("declines inside a comment", () => {
    const { handled, text } = expandAt("<!-- ul>li*2", "a.html", htmlLang)
    expect(handled).toBe(false)
    expect(text).toBe("<!-- ul>li*2")
  })

  it("declines outside JSX in a .tsx file, where it would be a property access", () => {
    // `a.b` is ordinary TypeScript out here; expanding it would be nonsense.
    const { handled, text } = expandAt("const x = div.card", "a.tsx", tsxLang)
    expect(handled).toBe(false)
    expect(text).toBe("const x = div.card")
  })

  it("declines when there is a selection — that is a Tab that indents a block", () => {
    view = new EditorView({
      doc: "ul>li*2",
      parent: document.createElement("div"),
      selection: { anchor: 0, head: 7 },
      extensions: [htmlLang],
    })
    expect(expandAbbreviation(view, "a.html")).toBe(false)
  })

  it("leaves the tab stops as real ones, not literal placeholders", () => {
    const { text } = expandAt("a[href]", "a.html", htmlLang)
    expect(text).not.toContain("${")
  })
})

describe("abbreviationAt", () => {
  it("only claims an abbreviation that ends at the cursor", () => {
    view = new EditorView({
      doc: "ul>li*2 and more",
      parent: document.createElement("div"),
      extensions: [htmlLang],
    })
    // Cursor at the very end: "more" is what sits there, not the abbreviation.
    const atEnd = abbreviationAt(view.state, view.state.doc.length)
    expect(atEnd?.text).not.toBe("ul>li*2")
    // Cursor right after the abbreviation: that one is claimed.
    expect(abbreviationAt(view.state, 7)?.text).toBe("ul>li*2")
  })

  it("finds nothing on an empty line", () => {
    view = new EditorView({ doc: "", parent: document.createElement("div") })
    expect(abbreviationAt(view.state, 0)).toBeNull()
  })
})

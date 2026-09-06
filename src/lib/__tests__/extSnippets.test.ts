// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the whole point of
// this file is `${1:placeholder}` inside plain strings — that is snippet syntax,
// not an unintended template literal.

/**
 * Snippet bodies come from another editor's format. The rule that matters is at
 * the end of `toTemplate`: whatever Reado can't represent must leave the
 * document, never land in it as literal placeholder syntax.
 */
import { describe, expect, it } from "vitest"
import { toTemplate } from "@/lib/extSnippets"

const ctx = { fileName: "Widget.tsx", directory: "src/components" }
const convert = (body: string) => toTemplate(body, ctx)

describe("toTemplate", () => {
  it("keeps numbered placeholders, which both formats agree on", () => {
    expect(convert("for (const ${1:item} of ${2:items}) {")).toBe(
      "for (const ${1:item} of ${2:items}) {",
    )
  })

  it("keeps the final stop", () => {
    expect(convert("try {\n\t${0}\n}")).toBe("try {\n\t${0}\n}")
  })

  it("braces numbered fields written bare", () => {
    // `$1` is valid in the published format and inert in CodeMirror's.
    expect(convert("console.log($1)$0")).toBe("console.log(${1})${0}")
  })

  it("turns a choice into its first option", () => {
    expect(convert("${1|let,const,var|} x")).toBe("${1:let} x")
  })

  it("drops a transform down to a plain field", () => {
    expect(convert("${1/(.*)/${1:/upcase}/}")).toBe("${1}")
  })

  it("substitutes the variables it can answer", () => {
    expect(convert("// $TM_FILENAME")).toBe("// Widget.tsx")
    expect(convert("// ${TM_FILENAME_BASE}")).toBe("// Widget")
    expect(convert("// ${TM_DIRECTORY}")).toBe("// src/components")
  })

  it("removes a variable it cannot answer instead of inserting its name", () => {
    // The failure this guards: `$TM_SELECTED_TEXT` typed into the user's file.
    const out = convert("wrap($TM_SELECTED_TEXT)")
    expect(out).toBe("wrap()")
    expect(out).not.toContain("TM_")
  })

  it("uses a variable's own default when it has one", () => {
    expect(convert("${TM_SELECTED_TEXT:nothing}")).toBe("nothing")
  })

  it("keeps an escaped dollar literal", () => {
    expect(convert("cost: \\$${1:0}")).toBe("cost: $${1:0}")
  })

  it("flattens a nested placeholder rather than breaking the field", () => {
    // The naive regex reading of this ends the field at the first `}`, leaving
    // a stray `}` in the document.
    const out = convert("${1:${2:inner}}")
    expect(out).toBe("${1:inner}")
    expect(out.split("}").length - 1).toBe(1)
  })

  it("never leaves unconverted placeholder syntax behind", () => {
    const messy = "a ${1|x,y|} b ${2/re/pl/} c $UNKNOWN_VAR d ${3:${4:z}} e $0"
    const out = convert(messy)
    expect(out).not.toMatch(/\|/)
    expect(out).not.toMatch(/UNKNOWN_VAR/)
    expect(out).not.toMatch(/\/re\//)
  })

  it("leaves ordinary braces alone — most snippet bodies are full of them", () => {
    expect(convert("if (x) {\n\tdoThing()\n}")).toBe("if (x) {\n\tdoThing()\n}")
  })
})

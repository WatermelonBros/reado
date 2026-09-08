// Applying a language server's text edits to a file Reado does not have open.
// This is the half of a code action that rewrites files you can't see — a rename
// touches five and you are looking at one — so the offset arithmetic has to be
// right without anyone watching it.
import { describe, expect, it } from "vitest"
import { applyTextEdits } from "@/lib/lsp"

const at = (line: number, character: number) => ({ line, character })
const edit = (from: [number, number], to: [number, number], newText: string) => ({
  range: { start: at(...from), end: at(...to) },
  newText,
})

const DOC = "import { a } from './a'\nconst x = a\nconst y = a\n"

describe("applyTextEdits", () => {
  it("replaces a range on one line", () => {
    expect(applyTextEdits(DOC, [edit([1, 10], [1, 11], "b")])).toBe(
      "import { a } from './a'\nconst x = b\nconst y = a\n",
    )
  })

  it("applies several edits back to front, so earlier offsets stay valid", () => {
    // Front to back, the second edit's offsets would already be stale — the
    // classic way a rename lands one character off.
    const out = applyTextEdits(DOC, [edit([1, 10], [1, 11], "LONGER"), edit([2, 10], [2, 11], "b")])
    expect(out).toBe("import { a } from './a'\nconst x = LONGER\nconst y = b\n")
  })

  it("is order-independent: the caller may hand them over any way round", () => {
    const forwards = [edit([1, 10], [1, 11], "b"), edit([2, 10], [2, 11], "c")]
    expect(applyTextEdits(DOC, forwards)).toBe(applyTextEdits(DOC, [...forwards].reverse()))
  })

  it("inserts at a point when the range is empty", () => {
    expect(applyTextEdits("ab\n", [edit([0, 1], [0, 1], "X")])).toBe("aXb\n")
  })

  it("deletes when the replacement is empty — an unused import, say", () => {
    expect(applyTextEdits(DOC, [edit([0, 0], [1, 0], "")])).toBe("const x = a\nconst y = a\n")
  })

  it("spans several lines", () => {
    expect(applyTextEdits(DOC, [edit([0, 7], [2, 5], "Z")])).toBe("import Z y = a\n")
  })

  it("leaves the document alone when handed nothing", () => {
    expect(applyTextEdits(DOC, [])).toBe(DOC)
  })

  it("clamps a position past the end instead of producing nonsense", () => {
    // A server that computed against a document Reado has since changed must
    // not be able to corrupt what is there now.
    expect(applyTextEdits("a\n", [edit([99, 0], [99, 0], "X")])).toBe("a\nX")
  })
})

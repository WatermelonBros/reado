// The knowledge-base index: which markdown counts as documentation, and the
// order it is listed in.
import { describe, expect, it } from "vitest"
import { listDocs } from "@/lib/knowledge"

describe("listDocs", () => {
  it("orders same-rank documents alphabetically, so the index is stable", () => {
    // Both live at the same depth with no ranking signal between them; without
    // the tiebreak their order follows however the file list arrived.
    const docs = listDocs(["docs/zebra.md", "docs/apple.md", "docs/mango.md"])
    expect(docs.map((d) => d.path)).toEqual(["docs/apple.md", "docs/mango.md", "docs/zebra.md"])
  })

  it("normalises Windows separators", () => {
    expect(listDocs(["docs\\guide.md"])[0].path).toBe("docs/guide.md")
  })
})

// Code actions: what the server offers at the cursor, and how the menu orders
// it. A server answers with one flat list — "add the missing import" next to
// "move this to a new file" — and the ordering is what makes that list usable.
import { describe, expect, it } from "vitest"
import { GROUP_LABEL, groupOf, sortActions } from "@/lib/codeActions"
import type { ResolvedAction } from "@/lib/lsp"

const action = (title: string, kind?: string, isPreferred?: boolean): ResolvedAction => ({
  title,
  kind,
  isPreferred,
  apply: async () => {},
})
const titles = (list: ResolvedAction[]) => sortActions(list).map((a) => a.title)

describe("groupOf", () => {
  it("reads the LSP kind hierarchy, not just the exact string", () => {
    expect(groupOf("quickfix")).toBe("fix")
    expect(groupOf("quickfix.import")).toBe("fix")
    expect(groupOf("refactor.extract.function")).toBe("refactor")
    expect(groupOf("source.organizeImports")).toBe("source")
  })

  it("puts an unkinded or unknown action last rather than dropping it", () => {
    // A server is allowed to answer with a bare Command and no kind at all.
    expect(groupOf(undefined)).toBe("other")
    expect(groupOf("something.new")).toBe("other")
  })

  it("has a label for every group it can return", () => {
    for (const kind of ["quickfix", "refactor", "source", undefined]) {
      expect(GROUP_LABEL[groupOf(kind)]).toBeTruthy()
    }
  })
})

describe("sortActions", () => {
  it("puts fixes before refactors before source-wide actions", () => {
    // Fixing what is broken is nearly always what you opened the menu for.
    const list = [
      action("organize", "source.organizeImports"),
      action("extract", "refactor.extract"),
      action("import", "quickfix"),
    ]
    expect(titles(list)).toEqual(["import", "extract", "organize"])
  })

  it("floats the server's preferred action to the top of its own group", () => {
    const list = [action("second fix", "quickfix"), action("the obvious one", "quickfix", true)]
    expect(titles(list)[0]).toBe("the obvious one")
  })

  it("keeps a preferred action inside its group rather than above everything", () => {
    // "Preferred" ranks refactors against refactors; it doesn't make one beat a
    // fix for the error under the cursor.
    const list = [action("extract", "refactor", true), action("import", "quickfix")]
    expect(titles(list)).toEqual(["import", "extract"])
  })

  it("is stable for actions the server gave no order of its own", () => {
    const list = [action("a", "quickfix"), action("b", "quickfix"), action("c", "quickfix")]
    expect(titles(list)).toEqual(["a", "b", "c"])
  })

  it("doesn't mutate the list it was handed", () => {
    const list = [action("z", "source"), action("a", "quickfix")]
    sortActions(list)
    expect(list.map((a) => a.title)).toEqual(["z", "a"])
  })
})

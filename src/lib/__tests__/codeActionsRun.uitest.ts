// Running a code action, and the paths where there is nothing to run. A menu
// that opens empty, or a command that quietly does nothing, is worse than one
// that says why — so each of those cases is pinned here.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/lsp", () => ({ lspCodeActions: vi.fn() }))
vi.mock("@/lib/notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import { actionsAtCursor, organizeImports, runAction } from "@/lib/codeActions"
import { useDocInfo } from "@/lib/docInfo"
import { lspCodeActions, type ResolvedAction } from "@/lib/lsp"
import { notify, notifyError } from "@/lib/notice"

const action = (title: string, kind?: string, apply = vi.fn(async () => {})): ResolvedAction => ({
  title,
  kind,
  apply,
})

/** A view with a selection and a focus call, which is all these paths read. */
const focus = vi.fn()
const view = { state: { selection: { main: { from: 0, to: 4 } } }, focus } as never

beforeEach(() => {
  vi.clearAllMocks()
  useDocInfo.setState({ view })
})

describe("actionsAtCursor", () => {
  it("returns the server's actions in menu order", async () => {
    vi.mocked(lspCodeActions).mockResolvedValue([
      action("extract", "refactor"),
      action("import", "quickfix"),
    ])
    const out = await actionsAtCursor()
    expect(out?.map((a) => a.title)).toEqual(["import", "extract"])
  })

  it("passes a kind filter straight through, so a source action can be asked for", async () => {
    vi.mocked(lspCodeActions).mockResolvedValue([])
    await actionsAtCursor(["source.organizeImports"])
    expect(lspCodeActions).toHaveBeenCalledWith(view, 0, 4, ["source.organizeImports"])
  })

  it("says null when there is no server, which is not the same as no actions", async () => {
    vi.mocked(lspCodeActions).mockResolvedValue(null)
    await expect(actionsAtCursor()).resolves.toBeNull()
  })

  it("says null with no editor open at all", async () => {
    useDocInfo.setState({ view: null })
    await expect(actionsAtCursor()).resolves.toBeNull()
  })
})

describe("runAction", () => {
  it("applies it and hands focus back to the editor", async () => {
    const apply = vi.fn(async () => {})
    await runAction(action("fix", "quickfix", apply))
    expect(apply).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
  })

  it("reports a failure instead of swallowing it", async () => {
    // A code action that half-applied and said nothing is the worst outcome.
    const apply = vi.fn(async () => {
      throw new Error("server said no")
    })
    await runAction(action("fix", "quickfix", apply))
    expect(notifyError).toHaveBeenCalled()
  })
})

describe("organizeImports", () => {
  it("runs the one action rather than showing a menu of one", async () => {
    const apply = vi.fn(async () => {})
    vi.mocked(lspCodeActions).mockResolvedValue([
      action("Organize Imports", "source.organizeImports", apply),
    ])
    await organizeImports()
    expect(apply).toHaveBeenCalled()
  })

  it("picks the organize action even when the server sends others too", async () => {
    const apply = vi.fn(async () => {})
    vi.mocked(lspCodeActions).mockResolvedValue([
      action("Sort", "source.sortImports"),
      action("Organize Imports", "source.organizeImports", apply),
    ])
    await organizeImports()
    expect(apply).toHaveBeenCalled()
  })

  it("says there is no server, rather than looking like it did nothing", async () => {
    vi.mocked(lspCodeActions).mockResolvedValue(null)
    await organizeImports()
    expect(notify).toHaveBeenCalledWith("info", "lsp.noServer")
  })

  it("says the server had nothing to offer, which is a different answer", async () => {
    vi.mocked(lspCodeActions).mockResolvedValue([])
    await organizeImports()
    expect(notify).toHaveBeenCalledWith("info", "lsp.noActions")
  })
})

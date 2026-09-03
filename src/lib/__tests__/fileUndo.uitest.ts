// Filesystem undo stack: both a move and a trash are reversed by a move back.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  movePath: vi.fn(async () => {}),
  trashPath: vi.fn(async () => ".reado/.trash/a.ts"),
}))
vi.mock("../notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

const project = {
  root: "/root",
  renamePath: vi.fn(),
  bumpTree: vi.fn(),
  close: vi.fn(),
}
vi.mock("../store", () => ({ useProject: { getState: () => project } }))

import { movePath, trashPath } from "@/lib/api"
import { trashAndRecord, useFileUndo } from "@/lib/fileUndo"
import { notify, notifyError } from "@/lib/notice"

beforeEach(() => {
  vi.clearAllMocks()
  useFileUndo.setState({ stack: [] })
})

describe("record", () => {
  it("pushes onto the stack", () => {
    useFileUndo.getState().record({ kind: "move", from: "a.ts", to: "b/a.ts" })
    expect(useFileUndo.getState().stack).toHaveLength(1)
  })

  it("keeps only the last 50 ops", () => {
    for (let i = 0; i < 60; i++) {
      useFileUndo.getState().record({ kind: "move", from: `${i}.ts`, to: `b/${i}.ts` })
    }
    const stack = useFileUndo.getState().stack
    expect(stack).toHaveLength(50)
    expect(stack[0]).toMatchObject({ from: "10.ts" })
  })
})

describe("undo", () => {
  it("does nothing on an empty stack", async () => {
    await useFileUndo.getState().undo()
    expect(movePath).not.toHaveBeenCalled()
  })

  it("moves a moved file back and re-points its open tab", async () => {
    useFileUndo.getState().record({ kind: "move", from: "a.ts", to: "b/a.ts" })
    await useFileUndo.getState().undo()
    expect(movePath).toHaveBeenCalledWith("/root", "b/a.ts", "a.ts")
    expect(project.renamePath).toHaveBeenCalledWith("b/a.ts", "a.ts")
    expect(project.bumpTree).toHaveBeenCalled()
    expect(useFileUndo.getState().stack).toHaveLength(0)
  })

  it("restores a trashed file from the project trash", async () => {
    useFileUndo.getState().record({
      kind: "trash",
      original: "a.ts",
      trashed: ".reado/.trash/a.ts",
    })
    await useFileUndo.getState().undo()
    expect(movePath).toHaveBeenCalledWith("/root", ".reado/.trash/a.ts", "a.ts")
    // Nothing to re-point: the tab was closed when the file was deleted.
    expect(project.renamePath).not.toHaveBeenCalled()
  })

  it("undoes the most recent op first", async () => {
    useFileUndo.getState().record({ kind: "move", from: "first.ts", to: "b/first.ts" })
    useFileUndo.getState().record({ kind: "move", from: "second.ts", to: "b/second.ts" })
    await useFileUndo.getState().undo()
    expect(movePath).toHaveBeenCalledWith("/root", "b/second.ts", "second.ts")
  })

  it("drops an unreversible op instead of getting stuck, and says so", async () => {
    vi.mocked(movePath).mockRejectedValueOnce(new Error("name taken"))
    useFileUndo.getState().record({ kind: "move", from: "a.ts", to: "b/a.ts" })
    await useFileUndo.getState().undo()
    expect(useFileUndo.getState().stack).toHaveLength(0)
    expect(notifyError).toHaveBeenCalledWith("fileUndo", "undo.failed")
  })
})

describe("trashAndRecord", () => {
  it("trashes, closes the tab and records the undo", async () => {
    await trashAndRecord("a.ts")
    expect(trashPath).toHaveBeenCalledWith("/root", "a.ts")
    expect(project.close).toHaveBeenCalledWith("a.ts")
    expect(useFileUndo.getState().stack).toEqual([
      { kind: "trash", original: "a.ts", trashed: ".reado/.trash/a.ts" },
    ])
    expect(notify).toHaveBeenCalledWith("info", "tree.deleted")
  })

  it("reports a failed delete and records nothing", async () => {
    vi.mocked(trashPath).mockRejectedValueOnce(new Error("readonly"))
    await trashAndRecord("a.ts")
    expect(useFileUndo.getState().stack).toHaveLength(0)
    expect(notifyError).toHaveBeenCalledWith("fileUndo", "tree.deleteFailed", expect.any(Error))
  })
})

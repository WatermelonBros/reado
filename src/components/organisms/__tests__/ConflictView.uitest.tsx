// Conflict resolver: one decision per region, the resolved-file state, marking
// the file resolved by staging it, and the abort escape hatch (which asks first
// and tries merge before rebase). The git edge is mocked.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const gitConflictRegions = vi.fn()
const gitResolveConflict = vi.fn()
const gitStage = vi.fn()
const gitMergeAbort = vi.fn()
const gitRebaseAbort = vi.fn()
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitConflictRegions: (root: string, file: string) => gitConflictRegions(root, file),
  gitResolveConflict: (root: string, file: string, index: number, side: string) =>
    gitResolveConflict(root, file, index, side),
  gitStage: (root: string, path: string) => gitStage(root, path),
  gitMergeAbort: (root: string) => gitMergeAbort(root),
  gitRebaseAbort: (root: string) => gitRebaseAbort(root),
}))

import { ConflictView } from "@/components/organisms/ConflictView"
import { useProject } from "@/lib/store"

const region = (index = 0) => ({
  index,
  startLine: 2 + index * 5,
  endLine: 6 + index * 5,
  oursLabel: "HEAD",
  theirsLabel: "feature",
  ours: "ours line",
  theirs: "theirs line",
})

beforeEach(() => {
  vi.clearAllMocks()
  gitConflictRegions.mockResolvedValue([region()])
  gitResolveConflict.mockResolvedValue(undefined)
  gitStage.mockResolvedValue(undefined)
  gitMergeAbort.mockResolvedValue(undefined)
  gitRebaseAbort.mockResolvedValue(undefined)
  useProject.setState({ root: "/proj" })
})

describe("ConflictView", () => {
  it("shows both sides of a region with the branch each came from", async () => {
    render(<ConflictView relPath="src/a.ts" />)
    expect(await screen.findByText("HEAD")).toBeInTheDocument()
    expect(screen.getByText("feature")).toBeInTheDocument()
    expect(screen.getByText("ours line")).toBeInTheDocument()
    expect(screen.getByText("theirs line")).toBeInTheDocument()
  })

  it("takes one answer per region", async () => {
    render(<ConflictView relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "conflict.keepTheirs" }))
    expect(gitResolveConflict).toHaveBeenCalledWith("/proj", "src/a.ts", 0, "theirs")
  })

  it("offers keeping both", async () => {
    render(<ConflictView relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "conflict.keepBoth" }))
    expect(gitResolveConflict).toHaveBeenCalledWith("/proj", "src/a.ts", 0, "both")
  })

  it("re-reads after a resolve, so the remaining regions renumber correctly", async () => {
    gitConflictRegions.mockResolvedValueOnce([region(0), region(1)])
    render(<ConflictView relPath="src/a.ts" />)
    await screen.findAllByRole("button", { name: "conflict.keepOurs" })
    gitConflictRegions.mockResolvedValue([region(0)])

    await userEvent.click(screen.getAllByRole("button", { name: "conflict.keepOurs" })[0])
    await vi.waitFor(() =>
      expect(screen.getAllByRole("button", { name: "conflict.keepOurs" })).toHaveLength(1),
    )
  })

  it("offers to mark the file resolved only once nothing is left", async () => {
    render(<ConflictView relPath="src/a.ts" />)
    await screen.findByRole("button", { name: "conflict.keepOurs" })
    // With a region still open, staging the file would tell git a lie.
    expect(screen.queryByRole("button", { name: "conflict.markResolved" })).not.toBeInTheDocument()

    gitConflictRegions.mockResolvedValue([])
    await userEvent.click(screen.getByRole("button", { name: "conflict.keepOurs" }))
    const mark = await screen.findByRole("button", { name: "conflict.markResolved" })
    await userEvent.click(mark)
    expect(gitStage).toHaveBeenCalledWith("/proj", "src/a.ts")
  })

  it("asks before aborting, then abandons the merge", async () => {
    render(<ConflictView relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "conflict.abort" }))
    expect(gitMergeAbort).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "conflict.abortConfirm" }))
    expect(gitMergeAbort).toHaveBeenCalledWith("/proj")
  })

  it("falls back to aborting a rebase when it wasn't a merge", async () => {
    gitMergeAbort.mockRejectedValue(new Error("no merge in progress"))
    render(<ConflictView relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "conflict.abort" }))
    await userEvent.click(screen.getByRole("button", { name: "conflict.abortConfirm" }))
    await vi.waitFor(() => expect(gitRebaseAbort).toHaveBeenCalledWith("/proj"))
  })

  it("treats an unreadable file as having no conflicts rather than hanging", async () => {
    gitConflictRegions.mockRejectedValue(new Error("gone"))
    render(<ConflictView relPath="src/a.ts" />)
    expect(await screen.findByText("conflict.allResolvedHint")).toBeInTheDocument()
  })
})

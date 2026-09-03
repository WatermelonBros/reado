// Per-hunk staging strip: which patch each control applies (the same patch,
// forwards or backwards, against the index or the working tree), that discard
// asks first because it is the one irreversible action, and that the list
// re-reads after a hunk moves. The git edge is mocked.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const gitFileHunks = vi.fn()
const gitApplyPatch = vi.fn()
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitFileHunks: (root: string, file: string, staged: boolean) => gitFileHunks(root, file, staged),
  gitApplyPatch: (root: string, patch: string, cached: boolean, reverse: boolean) =>
    gitApplyPatch(root, patch, cached, reverse),
}))

import { HunkBar } from "@/components/molecules/HunkBar"
import { useProject } from "@/lib/store"

const hunk = (index: number, over: Record<string, unknown> = {}) => ({
  index,
  header: `@@ -1,3 +${index + 1},4 @@`,
  patch: `PATCH-${index}`,
  newStart: index + 1,
  added: 2,
  removed: 1,
  linePatches: [],
  ...over,
})

/** Unstaged hunks come from the first call, staged from the second. */
const hunks = (working: unknown[], index: unknown[] = []) => {
  gitFileHunks.mockImplementation((_r: string, _f: string, staged: boolean) =>
    Promise.resolve(staged ? index : working),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  gitApplyPatch.mockResolvedValue(undefined)
  useProject.setState({ root: "/proj" })
})

describe("HunkBar", () => {
  it("renders nothing when the file has no hunks", async () => {
    hunks([])
    const { container } = render(<HunkBar relPath="src/a.ts" />)
    await vi.waitFor(() => expect(gitFileHunks).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("stages a hunk by applying its patch to the index", async () => {
    hunks([hunk(0)])
    render(<HunkBar relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "hunk.stage" }))
    expect(gitApplyPatch).toHaveBeenCalledWith("/proj", "PATCH-0", true, false)
  })

  it("unstages by running the same patch backwards against the index", async () => {
    hunks([], [hunk(0)])
    render(<HunkBar relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "hunk.unstage" }))
    expect(gitApplyPatch).toHaveBeenCalledWith("/proj", "PATCH-0", true, true)
  })

  it("asks before discarding, then reverses the patch in the working tree", async () => {
    hunks([hunk(0)])
    render(<HunkBar relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "hunk.discard" }))
    // Discard is the one action git can't undo — it must not be one click.
    expect(gitApplyPatch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "hunk.discardConfirm" }))
    expect(gitApplyPatch).toHaveBeenCalledWith("/proj", "PATCH-0", false, true)
  })

  it("lets the confirmation be backed out of", async () => {
    hunks([hunk(0)])
    render(<HunkBar relPath="src/a.ts" />)
    await userEvent.click(await screen.findByRole("button", { name: "hunk.discard" }))
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(screen.getByRole("button", { name: "hunk.discard" })).toBeInTheDocument()
    expect(gitApplyPatch).not.toHaveBeenCalled()
  })

  it("re-reads the hunks after one moves, since the rest renumber", async () => {
    hunks([hunk(0), hunk(1)])
    const onChanged = vi.fn()
    render(<HunkBar relPath="src/a.ts" onChanged={onChanged} />)
    await screen.findAllByRole("button", { name: "hunk.stage" })
    const before = gitFileHunks.mock.calls.length

    await userEvent.click(screen.getAllByRole("button", { name: "hunk.stage" })[0])
    await vi.waitFor(() => expect(gitFileHunks.mock.calls.length).toBeGreaterThan(before))
    expect(onChanged).toHaveBeenCalled()
  })

  it("shows staged and unstaged hunks separately", async () => {
    hunks([hunk(0)], [hunk(1)])
    render(<HunkBar relPath="src/a.ts" />)
    expect(await screen.findByRole("button", { name: "hunk.stage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "hunk.unstage" })).toBeInTheDocument()
  })

  it("offers line-level staging only where the hunk is unambiguous", async () => {
    hunks([
      hunk(0),
      hunk(1, {
        linePatches: [
          { line: 5, text: "two", patch: "LINE-5" },
          { line: 6, text: "three", patch: "LINE-6" },
        ],
      }),
    ])
    render(<HunkBar relPath="src/a.ts" />)
    // The hunk with removals gets no "by line" — a `+` in a replacement isn't a
    // patch on its own.
    const byLine = await screen.findAllByRole("button", { name: "hunk.byLine" })
    expect(byLine).toHaveLength(1)

    await userEvent.click(byLine[0])
    expect(screen.getByText(/two/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole("button", { name: "hunk.stageLine" })[1])
    expect(gitApplyPatch).toHaveBeenCalledWith("/proj", "LINE-6", true, false)
  })

  it("survives a file git knows nothing about", async () => {
    gitFileHunks.mockRejectedValue(new Error("not a repo"))
    const { container } = render(<HunkBar relPath="src/a.ts" />)
    await vi.waitFor(() => expect(gitFileHunks).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

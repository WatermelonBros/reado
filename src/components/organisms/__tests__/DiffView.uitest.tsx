// UI test: the opt-in diff view — against a git ref, and against the last-read
// snapshot (the "delta" a changed file leaves behind). The base fetch is mocked;
// CodeMirror's merge view is real.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const gitDiffBase = vi.fn<(root: string, path: string, base: string) => Promise<string | null>>()
const getReadSnapshot = vi.fn<(root: string, path: string) => Promise<string | null>>()

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitDiffBase: (root: string, path: string, base: string) => gitDiffBase(root, path, base),
  getReadSnapshot: (root: string, path: string) => getReadSnapshot(root, path),
}))
// The per-hunk staging bar owns its own git calls and its own test; here it is
// a button that fires the "a hunk moved" callback the diff has to react to.
vi.mock("../../molecules/HunkBar", () => ({
  HunkBar: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>
      hunk-bar
    </button>
  ),
}))

import { DiffView } from "@/components/organisms/DiffView"
import { LAST_READ_BASE, useReadProgress } from "@/lib/readProgress"
import { useEditorActions, useProject } from "@/lib/store"

const ROOT = "/repo"
const REL = "src/a.ts"

beforeEach(() => {
  vi.clearAllMocks()
  gitDiffBase.mockResolvedValue("old\n")
  getReadSnapshot.mockResolvedValue("old\n")
  useProject.setState({ root: ROOT })
  useEditorActions.setState({ diffBase: "HEAD", diffing: true })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
})

describe("fetching the base", () => {
  it("shows a loading state until the base arrives", () => {
    gitDiffBase.mockReturnValue(new Promise(() => {}))
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(screen.getByText("common.loading")).toBeInTheDocument()
  })

  it("diffs against the shared git base", async () => {
    render(<DiffView relPath={REL} text={"new\n"} />)
    await waitFor(() => expect(gitDiffBase).toHaveBeenCalledWith(ROOT, REL, "HEAD"))
  })

  it("shows a file added since the base as an all-added diff, not an error", async () => {
    // The backend answers with an empty base for a file the ref doesn't have —
    // every line is new, so the reader gets a green diff instead of "no base".
    gitDiffBase.mockResolvedValue("")
    render(<DiffView relPath={REL} text={"brand new file\n"} />)
    expect(await screen.findByText("diff.changes")).toBeInTheDocument()
    expect(screen.queryByText("diff.noBase")).not.toBeInTheDocument()
  })

  it("still says 'no base' when the ref itself doesn't resolve", async () => {
    gitDiffBase.mockResolvedValue(null)
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(await screen.findByText("diff.noBase")).toBeInTheDocument()
  })

  it("honours an explicit base — a PR diffs against its own base ref", async () => {
    render(<DiffView relPath={REL} text={"new\n"} base="origin/main" />)
    await waitFor(() => expect(gitDiffBase).toHaveBeenCalledWith(ROOT, REL, "origin/main"))
  })

  it("reads the last-read snapshot instead of git in delta mode", async () => {
    render(<DiffView relPath={REL} text={"new\n"} base={LAST_READ_BASE} />)
    await waitFor(() => expect(getReadSnapshot).toHaveBeenCalledWith(ROOT, REL))
    expect(gitDiffBase).not.toHaveBeenCalled()
  })

  it("says so when there is no base to diff against", async () => {
    gitDiffBase.mockResolvedValue(null)
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(await screen.findByText("diff.noBase")).toBeInTheDocument()
  })

  it("uses the delta wording when the snapshot is missing", async () => {
    getReadSnapshot.mockResolvedValue(null)
    render(<DiffView relPath={REL} text={"new\n"} base={LAST_READ_BASE} />)
    expect(await screen.findByText("delta.noBase")).toBeInTheDocument()
  })

  it("treats a failed fetch as no base rather than hanging on loading", async () => {
    gitDiffBase.mockRejectedValue(new Error("not a repo"))
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(await screen.findByText("diff.noBase")).toBeInTheDocument()
  })
})

describe("when nothing changed", () => {
  it("says so instead of rendering an empty diff", async () => {
    gitDiffBase.mockResolvedValue("same\n")
    render(<DiffView relPath={REL} text={"same\n"} />)
    expect(await screen.findByText("diff.noChanges")).toBeInTheDocument()
  })

  it("offers to mark the file reviewed when the delta is empty", async () => {
    getReadSnapshot.mockResolvedValue("same\n")
    render(<DiffView relPath={REL} text={"same\n"} base={LAST_READ_BASE} />)
    expect(await screen.findByText("delta.noChanges")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "delta.markReviewed" }))
    expect(useReadProgress.getState().read.has(REL)).toBe(true)
    expect(useEditorActions.getState().diffing).toBe(false)
  })

  it("offers no such button for a git diff — there is nothing to re-snapshot", async () => {
    gitDiffBase.mockResolvedValue("same\n")
    render(<DiffView relPath={REL} text={"same\n"} />)
    await screen.findByText("diff.noChanges")
    expect(screen.queryByText("delta.markReviewed")).not.toBeInTheDocument()
  })
})

describe("the diff itself", () => {
  it("renders the changed file with a chunk counter", async () => {
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(await screen.findByText("diff.changes")).toBeInTheDocument()
    expect(screen.getByLabelText("diff.nextChange")).toBeInTheDocument()
    expect(screen.getByLabelText("diff.prevChange")).toBeInTheDocument()
  })

  it("offers per-hunk staging only against HEAD", async () => {
    render(<DiffView relPath={REL} text={"new\n"} />)
    expect(await screen.findByText("hunk-bar")).toBeInTheDocument()
  })

  it("hides the staging bar for another ref — those hunks aren't stageable", async () => {
    render(<DiffView relPath={REL} text={"new\n"} base="origin/main" />)
    await screen.findByText("diff.changes")
    expect(screen.queryByText("hunk-bar")).not.toBeInTheDocument()
  })

  it("hides the staging bar in delta mode, which isn't a git diff", async () => {
    render(<DiffView relPath={REL} text={"new\n"} base={LAST_READ_BASE} />)
    await screen.findByText("diff.changes")
    expect(screen.queryByText("hunk-bar")).not.toBeInTheDocument()
  })

  it("keeps 'mark reviewed' to hand while reading a delta", async () => {
    useReadProgress.setState({ changed: new Set([REL]) })
    render(<DiffView relPath={REL} text={"new\n"} base={LAST_READ_BASE} />)
    await userEvent.click(await screen.findByRole("button", { name: "delta.markReviewed" }))
    expect(useReadProgress.getState().changed.has(REL)).toBe(false)
    expect(useEditorActions.getState().diffBase).toBe("HEAD")
  })

  it("re-reads the base after a hunk is staged", async () => {
    render(<DiffView relPath={REL} text={"new\n"} />)
    await screen.findByText("hunk-bar")
    expect(gitDiffBase).toHaveBeenCalledTimes(1)
    // Staging a hunk moves the base, so the diff has to be recomputed against it.
    await userEvent.click(screen.getByText("hunk-bar"))
    await waitFor(() => expect(gitDiffBase).toHaveBeenCalledTimes(2))
  })
})

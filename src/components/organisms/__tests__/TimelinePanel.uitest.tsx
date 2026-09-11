// UI test: the Timeline panel loads the active file's git history and selects a
// commit to diff against. The git edge is mocked; no real repo is touched.

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FileCommit, HistoryEntry } from "@/lib/api"

const gitFileHistory = vi.fn<(root: string, file: string) => Promise<FileCommit[]>>()
const historyList = vi.fn(async (_root: string, _file: string) => [] as HistoryEntry[])
const historyRead = vi.fn(async (_root: string, _file: string, _stamp: string) => "old text")
const writeBacked = vi.fn(async () => ({ changed: 1, backups: [{ path: "a", backup: "b" }] }))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitFileHistory: (root: string, file: string) => gitFileHistory(root, file),
  historyList: (root: string, file: string) => historyList(root, file),
  historyRead: (root: string, file: string, stamp: string) => historyRead(root, file, stamp),
  writeBacked: () => writeBacked(),
}))

import { TimelinePanel } from "@/components/organisms/TimelinePanel"
import { useEditorActions, useProject } from "@/lib/store"

const ROOT = "/repo"
const now = Math.floor(Date.now() / 1000)

/** Nanosecond stamps, the way the backend names its parked copies. */
const stampFor = (msAgo: number) => String((Date.now() - msAgo) * 1e6)

beforeEach(() => {
  gitFileHistory.mockReset()
  historyList.mockClear()
  historyRead.mockClear()
  writeBacked.mockClear()
  historyList.mockResolvedValue([])
  useEditorActions.setState({ diffing: false, diffBase: "HEAD" })
  useProject.setState({ root: ROOT, active: null })
})

describe("TimelinePanel", () => {
  it("shows the no-file state when nothing is active", () => {
    gitFileHistory.mockResolvedValue([])
    render(<TimelinePanel />)
    expect(screen.getByText("timeline.noFile")).toBeInTheDocument()
    expect(gitFileHistory).not.toHaveBeenCalled()
  })

  it("shows the empty state when the file has no history", async () => {
    gitFileHistory.mockResolvedValue([])
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` })
    render(<TimelinePanel />)
    await screen.findByText("timeline.empty")
    expect(gitFileHistory).toHaveBeenCalledWith(ROOT, "src/a.ts")
  })

  it("lists commits and selects one to diff against", async () => {
    gitFileHistory.mockResolvedValue([
      { hash: "abc123", author: "Ada", time: now, subject: "first change" },
      { hash: "def456", author: "Grace", time: now - 86400 * 40, subject: "older change" },
    ])
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` })
    render(<TimelinePanel />)

    await screen.findByText("first change")
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("today")).toBeInTheDocument()
    expect(screen.getByText("older change")).toBeInTheDocument()

    await userEvent.click(screen.getByText("first change"))
    await waitFor(() => {
      const s = useEditorActions.getState()
      expect(s.diffing).toBe(true)
      expect(s.diffBase).toBe("abc123")
    })
  })

  it("lists the file's own saves, and diffs against one", async () => {
    gitFileHistory.mockResolvedValue([])
    const stamp = stampFor(60_000)
    historyList.mockResolvedValue([{ stamp, size: 12 }])
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` })
    render(<TimelinePanel />)

    // A file git has never seen still has a history here.
    await screen.findByText("timeline.local")
    expect(screen.queryByText("timeline.empty")).not.toBeInTheDocument()

    await userEvent.click(screen.getByText("timeline.save"))
    await waitFor(() => {
      const s = useEditorActions.getState()
      expect(s.diffing).toBe(true)
      expect(s.diffBase).toBe(`reado:history:${stamp}`)
    })
  })

  it("restores a save, and only after it is confirmed", async () => {
    gitFileHistory.mockResolvedValue([])
    const stamp = stampFor(60_000)
    historyList.mockResolvedValue([{ stamp, size: 12 }])
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` })
    render(<TimelinePanel />)
    await screen.findByText("timeline.local")

    await userEvent.click(screen.getByText("timeline.restore"))
    // Armed, not done: overwriting the file is not a single misclick.
    expect(writeBacked).not.toHaveBeenCalled()
    expect(screen.getByText("timeline.restoreAsk")).toBeInTheDocument()

    await userEvent.click(screen.getAllByText("timeline.restore")[0])
    await waitFor(() => expect(writeBacked).toHaveBeenCalled())
    expect(historyRead).toHaveBeenCalledWith(ROOT, "src/a.ts", stamp)
  })

  it("shows an error state (not the empty state) when history loading fails", async () => {
    gitFileHistory.mockRejectedValue(new Error("no git"))
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` })
    render(<TimelinePanel />)
    await screen.findByText("timeline.error")
  })
})

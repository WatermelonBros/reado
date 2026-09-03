// Source Control's repo-level surface: the ⋯ menu (branch, stash, discard-all),
// the commit box, the AI commit hand-off, and how failures are surfaced. The
// file list and the fetch/pull/push toolbar are covered in GitPanel.uitest.tsx.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GitChange, StashEntry } from "@/lib/api"

const git = vi.hoisted(() => ({
  gitStatus: vi.fn(async () => [] as GitChange[]),
  gitStashList: vi.fn(async () => [] as StashEntry[]),
  gitInfo: vi.fn(async () => ({ isRepo: true }) as never),
  gitStash: vi.fn(async () => {}),
  gitStashPop: vi.fn(async () => {}),
  gitStashApply: vi.fn(async () => {}),
  gitStashDrop: vi.fn(async () => {}),
  gitCreateBranch: vi.fn(async () => {}),
  gitCommit: vi.fn(async () => {}),
  gitDiscard: vi.fn(async () => {}),
  gitDiscardAll: vi.fn(async () => {}),
  gitStageAll: vi.fn(async () => {}),
  gitUnstageAll: vi.fn(async () => {}),
  submitToTerminal: vi.fn(),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ...git,
}))

import { GitPanel } from "@/components/organisms/GitPanel"
import { useProject } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

const ROOT = "/repo"
const CHANGES: GitChange[] = [
  { path: "src/staged.ts", status: "added", staged: true },
  { path: "src/unstaged.ts", status: "modified", staged: false },
  { path: "src/new.ts", status: "untracked", staged: false },
]

/** Open the ⋯ menu and return it. */
async function openMenu() {
  await userEvent.click(await screen.findByRole("button", { name: /git\.more/ }))
  return await screen.findByText("git.stashes")
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of Object.values(git)) if ("mockClear" in fn) fn.mockClear()
  git.gitStatus.mockResolvedValue(CHANGES)
  git.gitStashList.mockResolvedValue([])
  git.gitInfo.mockResolvedValue({ isRepo: true } as never)
  useProject.setState({
    root: ROOT,
    git: {
      isRepo: true,
      branch: "main",
      ahead: 0,
      behind: 0,
      hasRemote: true,
      hasUpstream: true,
      changedFiles: 3,
    },
    open: vi.fn(),
  })
  useTerminals.setState({ sessions: [], activeId: null, groups: [], activeGroupId: null })
})

describe("committing", () => {
  it("won't commit an empty message", async () => {
    render(<GitPanel />)
    const button = await screen.findByRole("button", { name: /^git\.commit$/ })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText("git.commitPlaceholder"), "a message")
    await waitFor(() => expect(button).toBeEnabled())
  })

  it("won't commit with nothing staged, however good the message is", async () => {
    git.gitStatus.mockResolvedValue([
      { path: "src/unstaged.ts", status: "modified", staged: false },
    ])
    render(<GitPanel />)
    await screen.findByText("unstaged.ts")
    await userEvent.type(
      screen.getByPlaceholderText("git.commitPlaceholder"),
      "fix: a real message",
    )
    const button = screen.getByRole("button", { name: /^git\.commit$/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", "git.nothingStaged")
  })

  it("commits the staged changes and clears the box", async () => {
    render(<GitPanel />)
    const box = await screen.findByPlaceholderText("git.commitPlaceholder")
    await userEvent.type(box, "fix: the gutter")
    await userEvent.click(screen.getByRole("button", { name: /^git\.commit$/ }))
    await waitFor(() => expect(git.gitCommit).toHaveBeenCalledWith(ROOT, "fix: the gutter"))
    await waitFor(() => expect(box).toHaveValue(""))
  })

  it("surfaces git's own reason when the commit is refused", async () => {
    git.gitCommit.mockRejectedValue(new Error("nothing to commit, working tree clean"))
    render(<GitPanel />)
    await userEvent.type(
      await screen.findByPlaceholderText("git.commitPlaceholder"),
      "fix: something",
    )
    await userEvent.click(screen.getByRole("button", { name: /^git\.commit$/ }))
    expect(await screen.findByText(/nothing to commit/)).toBeInTheDocument()
  })

  it("hands the commit to the agent, opening a terminal if there isn't one", async () => {
    render(<GitPanel />)
    await userEvent.click(await screen.findByRole("button", { name: /git\.aiCommit/ }))
    expect(useTerminals.getState().sessions).toHaveLength(1)
    expect(git.submitToTerminal).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Commit and push"),
      400,
    )
  })

  it("uses the focused terminal when there is one, with no boot delay", async () => {
    useTerminals.setState({
      sessions: [{ id: "t1", title: "Terminal 1" }],
      activeId: "t1",
      groups: [{ id: "g1", dir: "row", paneIds: ["t1"], sizes: [1] }],
      activeGroupId: "g1",
    })
    render(<GitPanel />)
    await userEvent.click(await screen.findByRole("button", { name: /git\.aiCommit/ }))
    expect(git.submitToTerminal).toHaveBeenCalledWith("t1", expect.any(String), 0)
  })

  it("won't hand over a clean tree", async () => {
    git.gitStatus.mockResolvedValue([])
    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText("git.clean")).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /git\.aiCommit/ })).toBeDisabled()
  })
})

describe("the ⋯ menu", () => {
  it("creates a branch from the inline input", async () => {
    render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.newBranch"))
    const input = await screen.findByPlaceholderText("git.newBranchPlaceholder")
    await userEvent.type(input, "feature/search{Enter}")
    await waitFor(() => expect(git.gitCreateBranch).toHaveBeenCalledWith(ROOT, "feature/search"))
  })

  it("won't create a branch with no name, and Escape drops the input", async () => {
    render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.newBranch"))
    const input = await screen.findByPlaceholderText("git.newBranchPlaceholder")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(git.gitCreateBranch).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: "Escape" })
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("git.newBranchPlaceholder")).not.toBeInTheDocument(),
    )
  })

  it("stashes the working tree, with or without untracked files", async () => {
    const { unmount } = render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.stash"))
    await waitFor(() => expect(git.gitStash).toHaveBeenCalledWith(ROOT, "", false))
    unmount()

    render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.stashUntracked"))
    await waitFor(() => expect(git.gitStash).toHaveBeenLastCalledWith(ROOT, "", true))
  })

  it("says so when there are no stashes", async () => {
    render(<GitPanel />)
    await openMenu()
    expect(screen.getByText("git.noStashes")).toBeInTheDocument()
  })

  it("applies a stash, and pops it", async () => {
    git.gitStashList.mockResolvedValue([{ index: 0, message: "WIP on main" }])
    render(<GitPanel />)
    await openMenu()
    const row = () => screen.getByTitle("WIP on main").parentElement as HTMLElement
    await userEvent.click(within(row()).getByRole("button", { name: "git.stashApply" }))
    await waitFor(() => expect(git.gitStashApply).toHaveBeenCalledWith(ROOT, 0))

    await openMenu()
    await userEvent.click(within(row()).getByRole("button", { name: "git.stashPop" }))
    await waitFor(() => expect(git.gitStashPop).toHaveBeenCalledWith(ROOT, 0))
  })

  it("confirms before dropping a stash, and can be called off", async () => {
    git.gitStashList.mockResolvedValue([{ index: 0, message: "WIP on main" }])
    render(<GitPanel />)
    await openMenu()
    const row = (await screen.findByTitle("WIP on main")).parentElement as HTMLElement
    await userEvent.click(within(row).getByRole("button", { name: "git.stashDrop" }))
    expect(await screen.findByText("git.stashDropConfirm")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(git.gitStashDrop).not.toHaveBeenCalled()
  })

  it("drops the stash once confirmed", async () => {
    git.gitStashList.mockResolvedValue([{ index: 2, message: "WIP on main" }])
    render(<GitPanel />)
    await openMenu()
    const row = (await screen.findByTitle("WIP on main")).parentElement as HTMLElement
    await userEvent.click(within(row).getByRole("button", { name: "git.stashDrop" }))
    await userEvent.click(await screen.findByRole("button", { name: "git.stashDrop" }))
    await waitFor(() => expect(git.gitStashDrop).toHaveBeenCalledWith(ROOT, 2))
  })

  it("closes on a click outside it", async () => {
    const { container } = render(<GitPanel />)
    await openMenu()
    fireEvent.click(container.querySelector(".fixed.inset-0") as HTMLElement)
    await waitFor(() => expect(screen.queryByText("git.stashes")).not.toBeInTheDocument())
  })
})

describe("discarding", () => {
  it("asks before discarding everything, and includes untracked files", async () => {
    render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.discardAll"))
    const confirm = (await screen.findByText("git.discardAllConfirm")).parentElement as HTMLElement
    await userEvent.click(within(confirm).getByRole("button", { name: "git.discardAll" }))
    await waitFor(() => expect(git.gitDiscardAll).toHaveBeenCalledWith(ROOT, true))
  })

  it("can be called off", async () => {
    render(<GitPanel />)
    await openMenu()
    await userEvent.click(screen.getByText("git.discardAll"))
    const confirm = (await screen.findByText("git.discardAllConfirm")).parentElement as HTMLElement
    await userEvent.click(within(confirm).getByRole("button", { name: "common.cancel" }))
    expect(git.gitDiscardAll).not.toHaveBeenCalled()
  })

  it("stages and unstages everything from the group headers", async () => {
    render(<GitPanel />)
    await userEvent.click(await screen.findByRole("button", { name: "git.stageAll" }))
    await waitFor(() => expect(git.gitStageAll).toHaveBeenCalledWith(ROOT))
    await userEvent.click(screen.getByRole("button", { name: "git.unstageAll" }))
    await waitFor(() => expect(git.gitUnstageAll).toHaveBeenCalledWith(ROOT))
  })

  it("surfaces a failed operation instead of leaving a stale list", async () => {
    git.gitStageAll.mockRejectedValue(new Error("index.lock exists"))
    render(<GitPanel />)
    await userEvent.click(await screen.findByRole("button", { name: "git.stageAll" }))
    expect(await screen.findByText(/index\.lock/)).toBeInTheDocument()
  })
})

describe("keeping the list fresh", () => {
  it("polls while the window is visible, and stops while it's hidden", async () => {
    vi.useFakeTimers()
    render(<GitPanel />)
    await vi.advanceTimersByTimeAsync(10)
    git.gitStatus.mockClear()
    await vi.advanceTimersByTimeAsync(4100)
    expect(git.gitStatus).toHaveBeenCalled()

    git.gitStatus.mockClear()
    vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(4100)
    expect(git.gitStatus).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("drops the list rather than showing a stale one when status starts failing", async () => {
    vi.useFakeTimers()
    render(<GitPanel />)
    await vi.waitFor(() => expect(screen.getByText("staged.ts")).toBeInTheDocument())
    // The repo goes away under it (a checkout, a moved directory): the panel
    // must not keep listing files that are no longer reported.
    git.gitStatus.mockRejectedValue(new Error("not a repo"))
    await vi.advanceTimersByTimeAsync(4100)
    await vi.waitFor(() => expect(screen.getByText("git.clean")).toBeInTheDocument())
    expect(screen.queryByText("staged.ts")).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

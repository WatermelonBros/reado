// Source Control's pickers: the ⋯ menu entries that open a list to choose from.
// Each is one config in `PICKERS`; these pin that a picker opens from the menu,
// shows what it loaded, runs its row's action, and closes before it does.
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GitChange, StashEntry } from "@/lib/api"

const git = vi.hoisted(() => ({
  gitStatus: vi.fn(async () => [] as GitChange[]),
  gitStashList: vi.fn(async () => [] as StashEntry[]),
  gitInfo: vi.fn(async () => ({ isRepo: true }) as never),
  gitBranches: vi.fn(async () => ({ current: "main", local: ["main", "feature"], remote: [] })),
  gitRefs: vi.fn(async () => ({ commits: [{ hash: "abcdef1234", subject: "Fix it" }] })),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ...git,
}))
const ops = vi.hoisted(() => ({
  signingOn: vi.fn(async () => false),
  listTags: vi.fn(async () => ["v1.0.0"]),
  createTag: vi.fn(async () => {}),
  deleteTag: vi.fn(async () => {}),
  mergeBranch: vi.fn(async () => {}),
  revertCommit: vi.fn(async () => {}),
}))
vi.mock("../../../lib/gitOps", async (orig) => ({
  ...(await orig<typeof import("../../../lib/gitOps")>()),
  ...ops,
}))

import { GitPanel } from "@/components/organisms/GitPanel"
import { useProject } from "@/lib/store"

const ROOT = "/repo"

async function pick(entry: string) {
  await userEvent.click(await screen.findByRole("button", { name: /git\.more/ }))
  await userEvent.click(await screen.findByRole("menuitem", { name: entry }))
  return await screen.findByRole("dialog", { name: entry })
}

beforeEach(() => {
  vi.clearAllMocks()
  useProject.setState({
    root: ROOT,
    git: {
      isRepo: true,
      branch: "main",
      ahead: 0,
      behind: 0,
      hasRemote: true,
      hasUpstream: true,
      changedFiles: 0,
    },
    open: vi.fn(),
  })
})

describe("the git pickers", () => {
  it("lists the tags, and deletes the one picked", async () => {
    render(<GitPanel />)
    const dialog = await pick("git.tags")
    await userEvent.click(await within(dialog).findByText("v1.0.0"))
    await waitFor(() => expect(ops.deleteTag).toHaveBeenCalledWith("v1.0.0"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("offers to create a tag above the list", async () => {
    render(<GitPanel />)
    const dialog = await pick("git.tags")
    await userEvent.click(within(dialog).getByRole("button", { name: "git.tagCreate" }))
    await waitFor(() => expect(ops.createTag).toHaveBeenCalled())
  })

  it("merges any branch but the current one", async () => {
    render(<GitPanel />)
    const dialog = await pick("git.merge")
    await userEvent.click(await within(dialog).findByText("feature"))
    expect(within(dialog).queryByText("main")).not.toBeInTheDocument()
    await waitFor(() => expect(ops.mergeBranch).toHaveBeenCalledWith("feature"))
  })

  it("reverts a commit picked by its subject", async () => {
    render(<GitPanel />)
    const dialog = await pick("git.revert")
    expect(await within(dialog).findByText("abcdef1")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByText("Fix it"))
    await waitFor(() => expect(ops.revertCommit).toHaveBeenCalledWith("abcdef1234"))
  })

  it("closes on Escape without doing anything", async () => {
    render(<GitPanel />)
    await pick("git.tags")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(ops.deleteTag).not.toHaveBeenCalled()
  })
})

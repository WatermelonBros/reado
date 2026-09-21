// The bottom status bar: file/cursor, indentation, encoding, line-ending and
// language pickers, the git branch switcher, comment count and the
// Anywhere/terminal toggles. Stores are real; the Tauri edge is stubbed.

import { createEvent, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  anywhereStatus: vi.fn(async () => null as unknown),
  gitBranches: vi.fn(async () => ({
    current: "main",
    local: ["main", "dev"],
    remote: ["origin/main"],
  })),
  gitCheckout: vi.fn(async () => {}),
  gitInfo: vi.fn(async () => ({
    isRepo: true,
    branch: "dev",
    ahead: 0,
    behind: 0,
    hasRemote: false,
    hasUpstream: false,
    changedFiles: 0,
  })),
  listEncodings: vi.fn(async () => ["utf-8", "utf-8-bom", "windows-1252"]),
}))
vi.mock("../../../lib/api", () => api)

// The editor-command edges the status bar drives (go to line, convert line
// endings) are no-ops without a live CodeMirror view, so we spy on them at the
// module boundary while keeping the real `useDocInfo` store the other tests use.
const docEdge = vi.hoisted(() => ({ goToLine: vi.fn(), convertEol: vi.fn() }))
vi.mock("../../../lib/docInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/docInfo")>()
  return { ...actual, goToLine: docEdge.goToLine, convertEol: docEdge.convertEol }
})

import { StatusBar } from "@/components/molecules/StatusBar"
import { useComments } from "@/lib/comments"
import { useDocInfo } from "@/lib/docInfo"
import { useMascot } from "@/lib/mascot"
import { useNotice } from "@/lib/notice"
import { useCursor, usePalette, useProject } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

function setActiveFile() {
  useProject.setState({
    root: "/repo",
    active: "/repo/src/app/main.ts",
    git: {
      isRepo: true,
      branch: "main",
      ahead: 0,
      behind: 0,
      hasRemote: false,
      hasUpstream: false,
      changedFiles: 0,
    },
  })
}

beforeEach(() => {
  for (const f of Object.values(api)) f.mockClear()
  for (const f of Object.values(docEdge)) f.mockClear()
  useProject.setState({
    root: "/repo",
    active: null,
    git: {
      isRepo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      hasRemote: false,
      hasUpstream: false,
      changedFiles: 0,
    },
  })
  useCursor.setState({ line: 1, col: 1 })
  useComments.setState({ comments: [] })
  useDocInfo.setState({
    eol: "LF",
    indentKind: "spaces",
    indentSize: 2,
    language: "",
    languageOverride: null,
  })
  usePalette.setState({ anywhereOpen: false })
  useTerminals.setState({ open: false, agentTerminals: [] })
  useMascot.setState({ state: "idle" })
})

describe("StatusBar with no active file", () => {
  it("shows the no-file placeholder and the not-git marker", () => {
    render(<StatusBar />)
    expect(screen.getByText("status.noFile")).toBeInTheDocument()
    expect(screen.getByText("status.notGit")).toBeInTheDocument()
    expect(screen.getByText("status.comments")).toBeInTheDocument()
    expect(screen.getByText("status.agentIdle")).toBeInTheDocument()
  })

  it("says the agent is working while the agent is working", () => {
    // This segment used to be the constant `status.agentIdle`: it announced an
    // idle agent while the companion, reading the same facts, showed `think`.
    useTerminals.setState({ agentTerminals: ["t1"] })
    useMascot.setState({ state: "think" })
    render(<StatusBar />)
    expect(screen.getByText("status.agentWorking")).toBeInTheDocument()
    expect(screen.queryByText("status.agentIdle")).not.toBeInTheDocument()
  })

  it("says the agent is waiting when it has asked something", () => {
    useTerminals.setState({ agentTerminals: ["t1"] })
    useMascot.setState({ state: "ask" })
    render(<StatusBar />)
    expect(screen.getByText("status.agentAsking")).toBeInTheDocument()
  })

  it("stays idle when no agent pane exists, whatever the companion is doing", () => {
    useTerminals.setState({ agentTerminals: [] })
    useMascot.setState({ state: "think" })
    render(<StatusBar />)
    expect(screen.getByText("status.agentIdle")).toBeInTheDocument()
  })

  it("queries the Anywhere status on mount", () => {
    render(<StatusBar />)
    expect(api.anywhereStatus).toHaveBeenCalled()
  })

  it("opens the Anywhere dialog from the device button", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByRole("button", { name: /anywhere\.title/ }))
    expect(usePalette.getState().anywhereOpen).toBe(true)
  })

  it("toggles the integrated terminal", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByRole("button", { name: "terminal.toggle" }))
    expect(useTerminals.getState().open).toBe(true)
  })
})

describe("StatusBar with an active file", () => {
  beforeEach(setActiveFile)

  it("shows the relative path and cursor position", () => {
    useCursor.setState({ line: 12, col: 5 })
    render(<StatusBar />)
    expect(screen.getByText("src/app/main.ts")).toBeInTheDocument()
    expect(screen.getByText(/Ln 12, Col 5/)).toBeInTheDocument()
  })

  it("doesn't claim a sibling directory that shares the root's prefix", () => {
    useProject.setState({ root: "/repo", active: "/repo-backup/src/main.ts" } as never)
    render(<StatusBar />)
    // Not "-backup/src/main.ts": the file isn't in this project at all.
    expect(screen.getByText("repo-backup/src/main.ts")).toBeInTheDocument()
  })

  it("shows a Windows path with forward slashes", () => {
    useProject.setState({ root: "C:\\repo", active: "C:\\repo\\src\\main.ts" } as never)
    render(<StatusBar />)
    expect(screen.getByText("src/main.ts")).toBeInTheDocument()
  })

  it("opens the go-to-line popover and submits on Enter", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.goToLine"))
    const input = screen.getByPlaceholderText("status.goToLinePlaceholder")
    await userEvent.type(input, "42{Enter}")
    // Enter parses the field and jumps the editor to that 1-based line.
    expect(docEdge.goToLine).toHaveBeenCalledWith(42)
    // ...and the popover closes after submit.
    expect(screen.queryByPlaceholderText("status.goToLinePlaceholder")).not.toBeInTheDocument()
  })

  it("swallows the go-to-line Enter, so it can't reach the editor", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.goToLine"))
    const input = screen.getByPlaceholderText("status.goToLinePlaceholder")
    await userEvent.type(input, "42")
    const enter = createEvent.keyDown(input, { key: "Enter" })
    fireEvent(input, enter)
    // `goToLine` refocuses the editor; an un-swallowed Enter then inserts a
    // newline there, shifting the target line and marking the file dirty.
    expect(enter.defaultPrevented).toBe(true)
  })

  it("changes the indentation kind from the indent popover", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.indent"))
    await userEvent.click(screen.getByRole("menuitem", { name: "status.useTabs" }))
    expect(useDocInfo.getState().indentKind).toBe("tabs")
  })

  it("changes the indentation size from the indent popover", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.indent"))
    await userEvent.click(screen.getByRole("menuitem", { name: "4" }))
    expect(useDocInfo.getState().indentSize).toBe(4)
  })

  it("offers reopening with an encoding and choosing one to save with", async () => {
    // Two different acts, deliberately separate: re-decoding the bytes you have,
    // and choosing what the next save writes. One menu, two lists.
    useDocInfo.setState({ encoding: "utf-8" })
    render(<StatusBar />)
    // The indicator is labelled by what it shows, like the indent and EOL ones.
    await userEvent.click(await screen.findByRole("button", { name: "utf-8" }))
    expect(screen.getByText("status.reopenWith")).toBeInTheDocument()
    expect(screen.getByText("status.saveWith")).toBeInTheDocument()
    // Every offered encoding appears once per list.
    expect(screen.getAllByText("windows-1252")).toHaveLength(2)
  })

  it("converts the line endings when a different option is chosen", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.eol"))
    // "CRLF" only exists as a popover option (the toggle shows the current "LF").
    expect(screen.getByRole("menuitem", { name: "CRLF" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "CRLF" }))
    // Picking a non-current option rewrites the file with those endings...
    expect(docEdge.convertEol).toHaveBeenCalledWith("CRLF")
    // ...and the popover closes.
    expect(screen.queryByRole("menuitem", { name: "CRLF" })).not.toBeInTheDocument()
  })

  it("shows the language picker and changes the mode", async () => {
    useDocInfo.setState({ language: "TypeScript" })
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.language"))
    await userEvent.click(screen.getByRole("menuitem", { name: "Rust" }))
    expect(useDocInfo.getState().language).toBe("Rust")
    expect(useDocInfo.getState().languageOverride).toBe("Rust")
  })

  it("hides the language picker when no language is known", () => {
    useDocInfo.setState({ language: "" })
    render(<StatusBar />)
    expect(screen.queryByTitle("status.language")).not.toBeInTheDocument()
  })

  it("closes an open popover on Escape", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.eol"))
    expect(screen.getByRole("menuitem", { name: "CRLF" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menuitem", { name: "CRLF" })).not.toBeInTheDocument()
  })
})

describe("StatusBar branch switcher", () => {
  beforeEach(setActiveFile)

  it("opens the branch menu and lists local + remote branches", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.branch"))
    expect(api.gitBranches).toHaveBeenCalledWith("/repo")
    expect(await screen.findByRole("menuitem", { name: "dev" })).toBeInTheDocument()
    expect(screen.getByText("branch.local")).toBeInTheDocument()
    expect(screen.getByText("branch.remote")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "origin/main" })).toBeInTheDocument()
  })

  it("checks out a chosen local branch and refreshes git info", async () => {
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.branch"))
    await userEvent.click(await screen.findByRole("menuitem", { name: "dev" }))
    expect(api.gitCheckout).toHaveBeenCalledWith("/repo", "dev", false)
    await vi.waitFor(() => expect(api.gitInfo).toHaveBeenCalledWith("/repo"))
  })

  it("surfaces a checkout error", async () => {
    // Picking a branch closes the menu, so a refused checkout — a dirty working
    // tree, usually — has to be reported where every other failure is.
    api.gitCheckout.mockRejectedValueOnce(new Error("dirty tree"))
    render(<StatusBar />)
    await userEvent.click(screen.getByTitle("status.branch"))
    await userEvent.click(await screen.findByRole("menuitem", { name: "dev" }))
    await vi.waitFor(() => expect(useNotice.getState().notices[0]?.kind).toBe("error"))
    expect(useNotice.getState().notices[0]?.text).toMatch(/dirty tree/)
  })

  it("shows the file's encoding once, and truthfully", () => {
    // The bug: a hardcoded "UTF-8" span sat next to the real encoding picker, so
    // the bar read "UTF-8 … utf-8" — and on a latin-1 file it would have gone on
    // claiming UTF-8 beside the true value. It was not stylable like the other
    // items, and not hideable through the status-bar settings either.
    useDocInfo.setState({ encoding: "windows-1252" })
    render(<StatusBar />)
    expect(screen.queryByText("UTF-8")).not.toBeInTheDocument()
    expect(screen.getByText("windows-1252")).toBeInTheDocument()
  })
})

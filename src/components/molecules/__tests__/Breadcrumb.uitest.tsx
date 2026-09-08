// The active-file breadcrumb: path segments (each one a way *into* the folder
// or the file, not just a label), nav back/forward with disabled edges, the
// dirty dot, and the synopsis / blame / diff toggles gated on git and diff
// state. Stores are real; the Tauri edge and synopsis side effect are stubbed.

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { gitRefs, listDir } = vi.hoisted(() => ({
  gitRefs: vi.fn(async () => ({ branches: ["main"], commits: [] })),
  listDir: vi.fn(async () => [
    { name: "app", path: "/repo/src/app", isDir: true },
    { name: "index.ts", path: "/repo/src/index.ts", isDir: false },
  ]),
}))
vi.mock("../../../lib/api", () => ({ gitRefs, listDir }))
// No live editor here, so the symbol list comes from the heuristic outline.
vi.mock("../../../lib/lsp", () => ({ lspDocumentSymbols: () => null }))

import { Breadcrumb } from "@/components/molecules/Breadcrumb"
import { useEditorActions, useProject } from "@/lib/store"
import { useSynopsis } from "@/lib/synopsis"

function setProject(over: Partial<ReturnType<typeof useProject.getState>> = {}) {
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
    navStack: [{ path: "/repo/src/app/main.ts" }],
    navIndex: 0,
    ...over,
  })
}

beforeEach(() => {
  gitRefs.mockClear()
  listDir.mockClear()
  useEditorActions.setState({
    diffing: false,
    diffBase: "HEAD",
    blame: false,
    dirtyPaths: [],
  })
  useSynopsis.setState({ show: vi.fn() })
  setProject()
})

describe("Breadcrumb", () => {
  it("renders nothing without an active file", () => {
    setProject({ active: null })
    const { container } = render(<Breadcrumb />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders each relative path segment", () => {
    render(<Breadcrumb />)
    expect(screen.getByText("src")).toBeInTheDocument()
    expect(screen.getByText("app")).toBeInTheDocument()
    expect(screen.getByText("main.ts")).toBeInTheDocument()
  })

  it("disables back at the start of history and forward at the end", () => {
    render(<Breadcrumb />)
    expect(screen.getByRole("button", { name: "nav.back" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "nav.forward" })).toBeDisabled()
  })

  it("enables back when there is earlier history and navigates", async () => {
    setProject({
      navStack: [{ path: "/repo/a.ts" }, { path: "/repo/src/app/main.ts" }],
      navIndex: 1,
    })
    render(<Breadcrumb />)
    const back = screen.getByRole("button", { name: "nav.back" })
    expect(back).toBeEnabled()
    await userEvent.click(back)
    expect(useProject.getState().navIndex).toBe(0)
  })

  it("shows the dirty dot only when there are unsaved changes", () => {
    render(<Breadcrumb />)
    expect(screen.queryByTitle("editor.unsaved")).not.toBeInTheDocument()
    act(() => useEditorActions.setState({ dirtyPaths: ["src/app/main.ts"] }))
    expect(screen.getByTitle("editor.unsaved")).toBeInTheDocument()
  })

  it("opens the synopsis for the active file", async () => {
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "synopsis.open" }))
    expect(useSynopsis.getState().show).toHaveBeenCalledWith("src/app/main.ts")
  })

  it("toggles blame on (git repo, not diffing)", async () => {
    render(<Breadcrumb />)
    const blame = screen.getByRole("button", { name: "blame.toggle" })
    expect(blame).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(blame)
    expect(useEditorActions.getState().blame).toBe(true)
  })

  it("toggles diff on, which loads diff refs", async () => {
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "diff.toggle" }))
    expect(useEditorActions.getState().diffing).toBe(true)
    expect(gitRefs).toHaveBeenCalledWith("/repo")
  })

  it("hides git-only controls when the project is not a repo", () => {
    setProject({
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
    render(<Breadcrumb />)
    expect(screen.queryByRole("button", { name: "blame.toggle" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "diff.toggle" })).not.toBeInTheDocument()
    // The non-git synopsis affordance still shows.
    expect(screen.getByRole("button", { name: "synopsis.open" })).toBeInTheDocument()
  })

  it("while diffing, swaps the synopsis button for the diff-base picker", () => {
    useEditorActions.setState({ diffing: true })
    render(<Breadcrumb />)
    // The synopsis affordance is replaced by the diff-base Select (labelled via
    // ariaLabel), while the diff toggle itself stays available.
    expect(screen.queryByRole("button", { name: "synopsis.open" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("diff.base")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "diff.toggle" })).toBeInTheDocument()
  })
})

describe("Breadcrumb navigation", () => {
  it("lists a folder's contents when its segment is clicked", async () => {
    setProject()
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "src" }))
    expect(listDir).toHaveBeenCalledWith("/repo", "/repo/src", false)
    expect(await screen.findByRole("menuitem", { name: /index\.ts/ })).toBeInTheDocument()
  })

  it("opens a file picked from a folder segment", async () => {
    const open = vi.fn()
    setProject({ open })
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "src" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /index\.ts/ }))
    expect(open).toHaveBeenCalledWith("/repo/src/index.ts")
  })

  it("reveals a folder in the tree rather than trying to open it", async () => {
    // A folder isn't a document; opening one in the editor would be nonsense.
    const open = vi.fn()
    setProject({ open })
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "src" }))
    // "app /" is the menu row; the bare "app" is the path segment behind it.
    await userEvent.click(await screen.findByRole("menuitem", { name: "app /" }))
    expect(open).not.toHaveBeenCalled()
    expect(useProject.getState().expandedDirs).toContain("src/app")
  })

  it("closes the dropdown when its own segment is clicked again", async () => {
    setProject()
    render(<Breadcrumb />)
    const segment = screen.getByRole("button", { name: "src" })
    await userEvent.click(segment)
    expect(await screen.findByRole("menuitem", { name: /index\.ts/ })).toBeInTheDocument()
    await userEvent.click(segment)
    expect(screen.queryByRole("menuitem", { name: /index\.ts/ })).not.toBeInTheDocument()
  })

  it("offers the file's symbols from the last segment", async () => {
    // No editor is mounted in this test, so there is nothing to list — what is
    // pinned is that the file segment asks for symbols rather than a folder.
    setProject()
    render(<Breadcrumb />)
    await userEvent.click(screen.getByRole("button", { name: "main.ts" }))
    expect(await screen.findByText("breadcrumb.noSymbols")).toBeInTheDocument()
    expect(listDir).not.toHaveBeenCalled()
  })
})

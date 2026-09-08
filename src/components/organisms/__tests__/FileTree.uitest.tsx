// UI test: the lazy file tree — listing, expanding, opening, the quiet reading
// cues (dimming, per-folder counts, delta badge) and the right-click menu.
// The disk, the OS drag-drop bridge and the file-manager reveal are mocked; the
// stores are the real ones, driven from the test.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DirEntry, GitChange } from "@/lib/api"

const listDir = vi.fn<(root: string, dir: string, showHidden: boolean) => Promise<DirEntry[]>>()
const listFiles = vi.fn<(root: string) => Promise<string[]>>()
const importPaths = vi.fn<(root: string, sources: string[], dest: string) => Promise<void>>(
  async () => {},
)
const movePath = vi.fn<(root: string, from: string, to: string) => Promise<void>>(async () => {})
const gitStatus = vi.fn<(root: string) => Promise<GitChange[]>>(async () => [])

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listDir: (root: string, dir: string, showHidden: boolean) => listDir(root, dir, showHidden),
  listFiles: (root: string) => listFiles(root),
  importPaths: (root: string, sources: string[], dest: string) => importPaths(root, sources, dest),
  movePath: (root: string, from: string, to: string) => movePath(root, from, to),
  gitStatus: (root: string) => gitStatus(root),
  createFile: (root: string, path: string) => createFile(root, path),
  createDir: (root: string, path: string) => createDir(root, path),
}))

const createFile = vi.fn<(root: string, path: string) => Promise<string>>(
  async (root, path) => `${root}/${path}`,
)
const createDir = vi.fn<(root: string, path: string) => Promise<string>>(
  async (root, path) => `${root}/${path}`,
)
const promptMock = vi.fn<() => Promise<string | null>>(async () => null)
vi.mock("../../../lib/prompt", async (orig) => ({
  ...(await orig<typeof import("../../../lib/prompt")>()),
  prompt: () => promptMock(),
}))
const clipboardWrite = vi.fn<(t: string) => Promise<void>>(async () => {})
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (t: string) => clipboardWrite(t),
}))

const revealItemInDir = vi.fn<(p: string) => Promise<void>>(async () => {})
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: (p: string) => revealItemInDir(p),
}))

let onDrop: ((e: { payload: Record<string, unknown> }) => void) | null = null
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (cb: (e: { payload: Record<string, unknown> }) => void) => {
      onDrop = cb
      return Promise.resolve(() => {})
    },
  }),
}))

const trashAndRecord = vi.fn<(p: string) => Promise<void>>(async () => {})
vi.mock("../../../lib/fileUndo", async (orig) => ({
  ...(await orig<typeof import("../../../lib/fileUndo")>()),
  trashAndRecord: (p: string) => trashAndRecord(p),
}))
// Only the drop bridge is faked — AuditDialog reads the real terminal store.
const dropPathsIntoTerminal = vi.hoisted(() => vi.fn())
vi.mock("../../../lib/terminals", async (orig) => ({
  ...(await orig<typeof import("../../../lib/terminals")>()),
  dropPathsIntoTerminal,
}))

import { FileTree } from "@/components/organisms/FileTree"
import { useDiagnostics } from "@/lib/diagnostics"
import { useFileUndo } from "@/lib/fileUndo"
import { useGitStatus } from "@/lib/gitStatus"
import { useReadProgress } from "@/lib/readProgress"
import { useEditorActions, useProject, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { useTextView } from "@/lib/textView"

const ROOT = "/repo"
const dir = (name: string): DirEntry => ({ name, path: `${ROOT}/${name}`, isDir: true })
const file = (name: string): DirEntry => ({ name, path: `${ROOT}/${name}`, isDir: false })

/** The tree at the root plus one folder whose children load on expand. */
function tree(children: Record<string, DirEntry[]>) {
  listDir.mockImplementation(async (_root, d) => children[d] ?? [])
}

const open = vi.fn()
/** A single click browses, so it previews; a double-click opens for keeps. */
const openPreview = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  onDrop = null
  listFiles.mockResolvedValue([])
  tree({ [ROOT]: [] })
  useProject.setState({
    root: ROOT,
    active: null,
    showHidden: false,
    treeNonce: 0,
    expandedDirs: [],
    open,
    openPreview,
  })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
  useDiagnostics.setState({ byFile: {}, errors: {} })
  useTextView.setState({ force: new Set() })
  useFileUndo.setState({ stack: [] })
  promptMock.mockResolvedValue(null)
  // `clearAllMocks` clears calls, not implementations: without this the
  // "move is refused" test's rejection leaks into every test after it.
  movePath.mockResolvedValue(undefined)
  importPaths.mockResolvedValue(undefined)
  gitStatus.mockResolvedValue([])
  useGitStatus.setState({ byPath: {}, changes: [] })
  useEditorActions.setState({ dirtyPaths: [] })
  useWorkspace.setState({ searchScope: null })
  useTerminals.setState({ sessions: [], groups: [], activeId: null, activeGroupId: null })
})

describe("listing", () => {
  it("lists the project root, hidden files excluded", async () => {
    tree({ [ROOT]: [dir("src"), file("README.md")] })
    render(<FileTree />)
    expect(await screen.findByText("README.md")).toBeInTheDocument()
    expect(screen.getByText("src")).toBeInTheDocument()
    expect(listDir).toHaveBeenCalledWith(ROOT, ROOT, false)
  })

  it("re-lists with ignore rules off when 'show hidden' is on", async () => {
    useProject.setState({ showHidden: true })
    render(<FileTree />)
    await waitFor(() => expect(listDir).toHaveBeenCalledWith(ROOT, ROOT, true))
  })

  it("says the project is empty when it is", async () => {
    render(<FileTree />)
    expect(await screen.findByText("tree.empty")).toBeInTheDocument()
  })

  it("distinguishes a folder it couldn't read from an empty one", async () => {
    listDir.mockRejectedValue(new Error("EACCES"))
    render(<FileTree />)
    expect(await screen.findByText("tree.readError")).toBeInTheDocument()
    expect(screen.queryByText("tree.empty")).not.toBeInTheDocument()
  })

  it("re-lists when files change on disk", async () => {
    render(<FileTree />)
    await screen.findByText("tree.empty")
    listDir.mockClear()
    useProject.setState({ treeNonce: 1 })
    await waitFor(() => expect(listDir).toHaveBeenCalled())
  })
})

describe("opening and expanding", () => {
  it("previews a file on a single click, and opens it for keeps on a double", async () => {
    // Clicking through a folder is browsing: the tab is a preview the next
    // click replaces. Saying it twice is how you say you meant it.
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await userEvent.click(await screen.findByText("a.ts"))
    expect(openPreview).toHaveBeenCalledWith(`${ROOT}/a.ts`)
    expect(open).not.toHaveBeenCalled()

    await userEvent.dblClick(screen.getByText("a.ts"))
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("a click with a shaky hand still opens the file, rather than starting a drag", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const row = (await screen.findByText("a.ts")).closest("button") as HTMLElement
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 0 })
    // Two pixels — under the threshold that separates a click from a drag.
    fireEvent.pointerMove(window, { clientX: 1, clientY: 1 })
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1 })
    await userEvent.click(row)
    expect(openPreview).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("loads a folder's children only when it is expanded", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [file("index.ts")] })
    render(<FileTree />)
    await screen.findByText("src")
    expect(listDir).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByText("src"))
    expect(await screen.findByText("index.ts")).toBeInTheDocument()
    expect(listDir).toHaveBeenCalledWith(ROOT, `${ROOT}/src`, false)
  })

  it("reports its expanded state to assistive tech", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    const row = (await screen.findByText("src")).closest("button") as HTMLElement
    expect(row).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(row)
    await waitFor(() => expect(row).toHaveAttribute("aria-expanded", "true"))
  })

  it("auto-expands the folders containing the open file", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [file("deep.ts")] })
    useProject.setState({ active: `${ROOT}/src/deep.ts` })
    render(<FileTree />)
    expect(await screen.findByText("deep.ts")).toBeInTheDocument()
  })

  it("a file row is not a tree expander", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const row = (await screen.findByText("a.ts")).closest("button") as HTMLElement
    expect(row).not.toHaveAttribute("aria-expanded")
  })
})

describe("the reading cues", () => {
  it("dims a file that has been read", async () => {
    tree({ [ROOT]: [file("read.ts"), file("unread.ts")] })
    useReadProgress.setState({ read: new Set(["read.ts"]) })
    render(<FileTree />)
    expect((await screen.findByText("read.ts")).className).toContain("text-muted")
    expect(screen.getByText("unread.ts").className).not.toContain("text-muted")
  })

  it("shows a partially-read folder's progress, and drops it once done", async () => {
    tree({ [ROOT]: [dir("src")] })
    listFiles.mockResolvedValue(["src/a.ts", "src/b.ts"])
    useReadProgress.setState({ read: new Set(["src/a.ts"]) })
    render(<FileTree />)
    expect(await screen.findByText("1/2")).toBeInTheDocument()
    useReadProgress.setState({ read: new Set(["src/a.ts", "src/b.ts"]) })
    // The badge must actually go away — asserting "2/2" is absent also passes
    // for a component that simply stopped recomputing.
    await waitFor(() => expect(screen.queryByText("1/2")).not.toBeInTheDocument())
    expect(screen.queryByText("2/2")).not.toBeInTheDocument()
  })

  it("shows no count for an untouched folder", async () => {
    tree({ [ROOT]: [dir("src")] })
    listFiles.mockResolvedValue(["src/a.ts"])
    render(<FileTree />)
    await screen.findByText("src")
    expect(screen.queryByText("0/1")).not.toBeInTheDocument()
  })

  it("counts the language server's errors beside the file", async () => {
    tree({ [ROOT]: [file("bad.ts")] })
    useDiagnostics.setState({ errors: { [`${ROOT}/bad.ts`]: 3 } })
    render(<FileTree />)
    expect(await screen.findByText("3")).toBeInTheDocument()
  })

  it("offers to review the delta on a file that changed since it was read", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    useReadProgress.setState({ read: new Set(["a.ts"]), changed: new Set(["a.ts"]) })
    render(<FileTree />)
    const review = await screen.findByLabelText("delta.review")
    await userEvent.click(review)
    // Reviewing a delta is a decision about that file, not browsing past it.
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("has no delta button on an unchanged file", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    expect(screen.queryByLabelText("delta.review")).not.toBeInTheDocument()
  })
})

describe("the context menu", () => {
  /** Right-click a row (or the empty tree area) and return the open menu. */
  async function openMenu(text?: string) {
    const target = text
      ? ((await screen.findByText(text)).closest("button") as HTMLElement)
      : screen.getByRole("tree")
    fireEvent.contextMenu(target)
    return await screen.findByRole("menu")
  }

  it("offers file-scoped actions on a file", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    for (const label of ["tree.commentFile", "tree.audit", "split.openSide", "tree.markRead"]) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }
  })

  it("offers folder-scoped actions on a folder", async () => {
    tree({ [ROOT]: [dir("src")] })
    render(<FileTree />)
    const menu = await openMenu("src")
    expect(within(menu).getByText("tree.commentFolder")).toBeInTheDocument()
    expect(within(menu).queryByText("split.openSide")).not.toBeInTheDocument()
  })

  it("only offers the folder bulk-mark that would change something", async () => {
    tree({ [ROOT]: [dir("src")] })
    listFiles.mockResolvedValue(["src/a.ts", "src/b.ts"])
    render(<FileTree />)
    await waitFor(() => expect(listFiles).toHaveBeenCalled())
    let menu = await openMenu("src")
    expect(within(menu).getByText("tree.markFolderRead")).toBeInTheDocument()
    expect(within(menu).queryByText("tree.markFolderUnread")).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    useReadProgress.setState({ read: new Set(["src/a.ts", "src/b.ts"]) })
    menu = await openMenu("src")
    expect(within(menu).getByText("tree.markFolderUnread")).toBeInTheDocument()
    expect(within(menu).queryByText("tree.markFolderRead")).not.toBeInTheDocument()
  })

  it("marks a whole folder read, and only that folder", async () => {
    tree({ [ROOT]: [dir("src")] })
    // `srcx/` shares the prefix — a `startsWith(folderRel)` match would sweep
    // it in along with `src/`.
    listFiles.mockResolvedValue(["src/a.ts", "src/b.ts", "srcx/c.ts"])
    render(<FileTree />)
    await waitFor(() => expect(listFiles).toHaveBeenCalled())
    const menu = await openMenu("src")
    await userEvent.click(within(menu).getByText("tree.markFolderRead"))
    expect([...useReadProgress.getState().read].sort()).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("toggles a single file's read state", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText("tree.markRead"))
    expect(useReadProgress.getState().read.has("a.ts")).toBe(true)
  })

  it("opens an SVG as editable source", async () => {
    tree({ [ROOT]: [file("logo.svg")] })
    render(<FileTree />)
    const menu = await openMenu("logo.svg")
    await userEvent.click(within(menu).getByText("tree.openAsText"))
    expect(useTextView.getState().force.has(`${ROOT}/logo.svg`)).toBe(true)
    expect(open).toHaveBeenCalledWith(`${ROOT}/logo.svg`)
  })

  it("opens markdown straight into its source", async () => {
    tree({ [ROOT]: [file("README.md")] })
    render(<FileTree />)
    const menu = await openMenu("README.md")
    await userEvent.click(within(menu).getByText("tree.editSource"))
    expect(useTextView.getState().force.has(`${ROOT}/README.md`)).toBe(true)
  })

  it("offers neither source action on a plain file", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    expect(within(menu).queryByText("tree.openAsText")).not.toBeInTheDocument()
    expect(within(menu).queryByText("tree.editSource")).not.toBeInTheDocument()
  })

  it("reveals a row in the OS file manager", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText(/tree\.reveal/))
    expect(revealItemInDir).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("deletes to the project trash, where undo can reach it", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText("tree.delete"))
    expect(trashAndRecord).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("renames a file through the menu, recording an undoable move", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    promptMock.mockResolvedValue("b.ts")
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText("tree.rename"))
    await waitFor(() => expect(movePath).toHaveBeenCalledWith(ROOT, `${ROOT}/a.ts`, `${ROOT}/b.ts`))
    expect(useFileUndo.getState().stack).toHaveLength(1)
  })

  it("creates a file and a folder inside the clicked folder", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [] })
    promptMock.mockResolvedValue("new.ts")
    render(<FileTree />)
    const menu = await openMenu("src")
    await userEvent.click(within(menu).getByText("file.newFile"))
    await waitFor(() => expect(createFile).toHaveBeenCalledWith(ROOT, "src/new.ts"))

    const menu2 = await openMenu("src")
    await userEvent.click(within(menu2).getByText("tree.newFolder"))
    await waitFor(() => expect(createDir).toHaveBeenCalledWith(ROOT, "src/new.ts"))
  })

  it("copies the absolute and the project-relative path", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText("tree.copyPath"))
    expect(clipboardWrite).toHaveBeenCalledWith(`${ROOT}/a.ts`)

    const menu2 = await openMenu("a.ts")
    await userEvent.click(within(menu2).getByText("tree.copyRelativePath"))
    expect(clipboardWrite).toHaveBeenLastCalledWith("a.ts")
  })

  it("offers only the project-scoped comment on empty space", async () => {
    render(<FileTree />)
    await screen.findByText("tree.empty")
    const menu = await openMenu()
    expect(within(menu).getByText("tree.commentProject")).toBeInTheDocument()
    expect(within(menu).queryByText("tree.commentFile")).not.toBeInTheDocument()
    expect(within(menu).queryByText("tree.delete")).not.toBeInTheDocument()
  })
})

describe("dropping files from outside the app", () => {
  it("copies them into the folder under the cursor", async () => {
    tree({ [ROOT]: [dir("src")] })
    render(<FileTree />)
    await screen.findByText("src")
    const row = screen.getByText("src").closest("button") as HTMLElement
    vi.spyOn(document, "elementFromPoint").mockReturnValue(row)
    onDrop?.({ payload: { type: "drop", position: { x: 10, y: 10 }, paths: ["/tmp/x.ts"] } })
    await waitFor(() =>
      expect(importPaths).toHaveBeenCalledWith(ROOT, ["/tmp/x.ts"], `${ROOT}/src`),
    )
    vi.restoreAllMocks()
  })

  it("ignores a drop outside the tree", async () => {
    render(<FileTree />)
    await screen.findByText("tree.empty")
    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.createElement("div"))
    expect(onDrop, "the drop bridge was never wired").toBeTruthy()
    onDrop?.({ payload: { type: "drop", position: { x: 0, y: 0 }, paths: ["/tmp/x.ts"] } })
    await Promise.resolve()
    expect(importPaths).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("ignores the hover/cancel phases of a drag", async () => {
    render(<FileTree />)
    await screen.findByText("tree.empty")
    expect(onDrop, "the drop bridge was never wired").toBeTruthy()
    onDrop?.({ payload: { type: "over", position: { x: 0, y: 0 } } })
    expect(importPaths).not.toHaveBeenCalled()
  })
})

describe("dragging a row onto a folder", () => {
  /** Press `from`'s row, move past the threshold, and release over `onto`. */
  function drag(from: string, onto: HTMLElement | null) {
    const row = screen.getByText(from).closest("button") as HTMLElement
    vi.spyOn(document, "elementFromPoint").mockReturnValue(onto)
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }

  const folderRow = (name: string) => screen.getByText(name).closest("button") as HTMLElement

  it("a press that never moves still opens the file", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    const row = (await screen.findByText("a.ts")).closest("button") as HTMLElement
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
    await userEvent.click(row)
    expect(openPreview).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("moves the file into it, and records the move for undo", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    drag("a.ts", folderRow("src"))
    await waitFor(() =>
      expect(movePath).toHaveBeenCalledWith(ROOT, `${ROOT}/a.ts`, `${ROOT}/src/a.ts`),
    )
    // Cmd/Ctrl+Z has to be able to put it back.
    await waitFor(() =>
      expect(useFileUndo.getState().stack[useFileUndo.getState().stack.length - 1]).toEqual({
        kind: "move",
        // The op carries the folder it happened in, so undo reaches that folder
        // and not the workspace's first one.
        root: ROOT,
        from: `${ROOT}/a.ts`,
        to: `${ROOT}/src/a.ts`,
      }),
    )
    vi.restoreAllMocks()
  })

  it("refuses to move a folder into itself", async () => {
    tree({ [ROOT]: [dir("src")] })
    render(<FileTree />)
    await screen.findByText("src")
    drag("src", folderRow("src"))
    expect(movePath).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("records nothing and re-lists nothing when the move is refused", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")] })
    movePath.mockRejectedValue(new Error("name already taken"))
    render(<FileTree />)
    await screen.findByText("a.ts")
    const nonce = useProject.getState().treeNonce
    drag("a.ts", folderRow("src"))
    await waitFor(() => expect(movePath).toHaveBeenCalled())
    // A move that didn't happen leaves nothing to undo, and nothing to re-list.
    expect(useFileUndo.getState().stack).toHaveLength(0)
    expect(useProject.getState().treeNonce).toBe(nonce)
    vi.restoreAllMocks()
  })

  it("dropped outside the tree, the path is typed into the terminal instead", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    drag("a.ts", null)
    expect(dropPathsIntoTerminal).toHaveBeenCalledWith(40, 40, [`${ROOT}/a.ts`])
    vi.restoreAllMocks()
  })

  it("shows what is being dragged under the cursor, and the grabbing cursor", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    const row = screen.getByText("a.ts").closest("button") as HTMLElement
    vi.spyOn(document, "elementFromPoint").mockReturnValue(null)
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    // Two "a.ts" now: the row, and the label following the pointer.
    await waitFor(() => expect(screen.getAllByText("a.ts")).toHaveLength(2))
    expect(document.documentElement.hasAttribute("data-dragging-file")).toBe(true)
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
    await waitFor(() => expect(screen.getAllByText("a.ts")).toHaveLength(1))
    expect(document.documentElement.hasAttribute("data-dragging-file")).toBe(false)
    vi.restoreAllMocks()
  })

  it("a real drag swallows the click, so the drop doesn't also open the file", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    drag("a.ts", folderRow("src"))
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    screen.getByText("a.ts").closest("button")?.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    vi.restoreAllMocks()
  })
})

describe("the keyboard, like VS Code's explorer", () => {
  const row = (name: string) => screen.getByText(name).closest("button") as HTMLElement

  it("renames the focused row on F2", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    promptMock.mockResolvedValue("b.ts")
    render(<FileTree />)
    await screen.findByText("a.ts")
    fireEvent.keyDown(row("a.ts"), { key: "F2" })
    await waitFor(() => expect(movePath).toHaveBeenCalledWith(ROOT, `${ROOT}/a.ts`, `${ROOT}/b.ts`))
  })

  it("deletes on Delete and on Cmd+Backspace", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    fireEvent.keyDown(row("a.ts"), { key: "Delete" })
    fireEvent.keyDown(row("a.ts"), { key: "Backspace", metaKey: true })
    expect(trashAndRecord).toHaveBeenCalledTimes(2)
    expect(trashAndRecord).toHaveBeenCalledWith(`${ROOT}/a.ts`)
  })

  it("leaves a bare Backspace alone — that is not a delete gesture", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    fireEvent.keyDown(row("a.ts"), { key: "Backspace" })
    expect(trashAndRecord).not.toHaveBeenCalled()
  })

  it("jumps to a row by typing its first letter, wrapping around", async () => {
    tree({ [ROOT]: [file("alpha.ts"), file("beta.ts"), file("gamma.ts")] })
    render(<FileTree />)
    await screen.findByText("gamma.ts")
    fireEvent.keyDown(row("alpha.ts"), { key: "g" })
    expect(document.activeElement).toBe(row("gamma.ts"))
    // Past the end, it comes back round to the top.
    fireEvent.keyDown(row("gamma.ts"), { key: "b" })
    expect(document.activeElement).toBe(row("beta.ts"))
  })

  it("Home and End go to the first and last row", async () => {
    tree({ [ROOT]: [file("a.ts"), file("b.ts"), file("c.ts")] })
    render(<FileTree />)
    await screen.findByText("c.ts")
    fireEvent.keyDown(row("b.ts"), { key: "End" })
    expect(document.activeElement).toBe(row("c.ts"))
    fireEvent.keyDown(row("c.ts"), { key: "Home" })
    expect(document.activeElement).toBe(row("a.ts"))
  })

  it("cuts and pastes from the keyboard", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    fireEvent.keyDown(row("a.ts"), { key: "x", metaKey: true })
    fireEvent.keyDown(row("src"), { key: "v", metaKey: true })
    await waitFor(() =>
      expect(movePath).toHaveBeenCalledWith(ROOT, `${ROOT}/a.ts`, `${ROOT}/src/a.ts`),
    )
  })

  it("walks rows with the arrows and expands a folder with ArrowRight", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    fireEvent.keyDown(row("src"), { key: "ArrowDown" })
    expect(document.activeElement).toBe(row("a.ts"))
    fireEvent.keyDown(row("a.ts"), { key: "ArrowUp" })
    expect(document.activeElement).toBe(row("src"))
    fireEvent.keyDown(row("src"), { key: "ArrowRight" })
    expect(useProject.getState().expandedDirs).toContain("src")
    fireEvent.keyDown(row("src"), { key: "ArrowLeft" })
    expect(useProject.getState().expandedDirs).not.toContain("src")
  })
})

describe("moving files around", () => {
  const openMenu = async (label?: string) => {
    const target = label
      ? (screen.getByText(label).closest("button") as HTMLElement)
      : (screen.getByRole("tree") as HTMLElement)
    fireEvent.contextMenu(target)
    return await screen.findByRole("menu")
  }

  it("cut then paste moves the file into the target folder, undoably", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    await userEvent.click(within(await openMenu("a.ts")).getByText("tree.cut"))
    await userEvent.click(within(await openMenu("src")).getByText("tree.paste"))
    await waitFor(() =>
      expect(movePath).toHaveBeenCalledWith(ROOT, `${ROOT}/a.ts`, `${ROOT}/src/a.ts`),
    )
    await waitFor(() => expect(useFileUndo.getState().stack).toHaveLength(1))
  })

  it("copy then paste copies instead, and can be pasted more than once", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    await userEvent.click(within(await openMenu("a.ts")).getByText("tree.copy"))
    await userEvent.click(within(await openMenu("src")).getByText("tree.paste"))
    await waitFor(() =>
      expect(importPaths).toHaveBeenCalledWith(ROOT, [`${ROOT}/a.ts`], `${ROOT}/src`),
    )
    expect(movePath).not.toHaveBeenCalled()
    // A cut is consumed by its paste; a copy stays on the clipboard.
    expect(within(await openMenu("src")).getByText("tree.paste")).toBeInTheDocument()
  })

  it("offers no paste before anything is cut or copied", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    expect(within(await openMenu("a.ts")).queryByText("tree.paste")).not.toBeInTheDocument()
  })

  it("duplicates beside the original", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    await userEvent.click(within(await openMenu("a.ts")).getByText("tree.duplicate"))
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(ROOT, [`${ROOT}/a.ts`], ROOT))
  })

  it("opens a terminal in the clicked folder, not the project root", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("src")
    await userEvent.click(within(await openMenu("src")).getByText("tree.openInTerminal"))
    const sessions = useTerminals.getState().sessions
    expect(sessions[sessions.length - 1]?.cwd).toBe(`${ROOT}/src`)
  })
})

describe("git decorations", () => {
  it("marks a changed file, and the folder that contains it", async () => {
    useProject.setState({ git: { isRepo: true } as never })
    gitStatus.mockResolvedValue([{ path: "src/a.ts", status: "modified", staged: false }])
    tree({ [ROOT]: [dir("src"), file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    // The file row is keyed on its project-relative path — "a.ts" at the root
    // here — so drive the assertion from the folder rollup and the letter.
    gitStatus.mockResolvedValue([{ path: "src/x.ts", status: "modified", staged: false }])
    useProject.getState().bumpTree()
    expect(await screen.findByLabelText("git.folderChanged")).toBeInTheDocument()
  })

  it("marks the file itself with its status letter", async () => {
    useProject.setState({ git: { isRepo: true } as never })
    gitStatus.mockResolvedValue([{ path: "a.ts", status: "untracked", staged: false }])
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    expect(await screen.findByTitle("git.status.untracked")).toBeInTheDocument()
  })

  it("says nothing on a clean tree", async () => {
    useProject.setState({ git: { isRepo: true } as never })
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    expect(screen.queryByTitle("git.status.modified")).not.toBeInTheDocument()
  })
})

describe("selecting more than one row", () => {
  const row = (name: string) => screen.getByText(name).closest("button") as HTMLElement
  const openMenu = async (label: string) => {
    fireEvent.contextMenu(row(label))
    return await screen.findByRole("menu")
  }

  const three = async () => {
    tree({ [ROOT]: [file("a.ts"), file("b.ts"), file("c.ts")] })
    render(<FileTree />)
    await screen.findByText("c.ts")
  }

  it("⌘-click adds rows without opening them", async () => {
    await three()
    await userEvent.click(row("a.ts"))
    expect(openPreview).toHaveBeenCalledTimes(1)
    fireEvent.click(row("c.ts"), { ctrlKey: true })
    // The second click extended the selection; it must not have opened a file.
    expect(openPreview).toHaveBeenCalledTimes(1)
    expect(row("a.ts")).toHaveAttribute("aria-selected", "true")
    expect(row("c.ts")).toHaveAttribute("aria-selected", "true")
    expect(row("b.ts")).toHaveAttribute("aria-selected", "false")
  })

  it("⇧-click takes the whole range from the anchor", async () => {
    await three()
    await userEvent.click(row("a.ts"))
    fireEvent.click(row("c.ts"), { shiftKey: true })
    for (const name of ["a.ts", "b.ts", "c.ts"]) {
      expect(row(name)).toHaveAttribute("aria-selected", "true")
    }
  })

  it("deletes every selected row at once, each undoable", async () => {
    await three()
    await userEvent.click(row("a.ts"))
    fireEvent.click(row("b.ts"), { ctrlKey: true })
    const menu = await openMenu("a.ts")
    await userEvent.click(within(menu).getByText("tree.deleteMany"))
    await waitFor(() => expect(trashAndRecord).toHaveBeenCalledTimes(2))
    expect(trashAndRecord).toHaveBeenCalledWith(`${ROOT}/a.ts`)
    expect(trashAndRecord).toHaveBeenCalledWith(`${ROOT}/b.ts`)
  })

  it("right-clicking outside the selection acts on that row alone", async () => {
    await three()
    await userEvent.click(row("a.ts"))
    fireEvent.click(row("b.ts"), { ctrlKey: true })
    // c.ts is not selected — the menu must be about c.ts, not the other two.
    const menu = await openMenu("c.ts")
    expect(within(menu).queryByText("tree.deleteMany")).not.toBeInTheDocument()
    await userEvent.click(within(menu).getByText("tree.delete"))
    await waitFor(() => expect(trashAndRecord).toHaveBeenCalledTimes(1))
    expect(trashAndRecord).toHaveBeenCalledWith(`${ROOT}/c.ts`)
  })

  it("cuts and pastes the whole selection", async () => {
    tree({ [ROOT]: [dir("src"), file("a.ts"), file("b.ts")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("b.ts")
    await userEvent.click(row("a.ts"))
    fireEvent.click(row("b.ts"), { ctrlKey: true })
    await userEvent.click(within(await openMenu("a.ts")).getByText("tree.cut"))
    fireEvent.contextMenu(row("src"))
    await userEvent.click(within(await screen.findByRole("menu")).getByText("tree.paste"))
    await waitFor(() => expect(movePath).toHaveBeenCalledTimes(2))
  })
})

describe("finding, and opening another way", () => {
  const row = (name: string) => screen.getByText(name).closest("button") as HTMLElement
  const openMenu = async (label: string) => {
    fireEvent.contextMenu(row(label))
    return await screen.findByRole("menu")
  }

  it("scopes the search to the clicked folder and reveals the panel", async () => {
    tree({ [ROOT]: [dir("src")], [`${ROOT}/src`]: [] })
    render(<FileTree />)
    await screen.findByText("src")
    await userEvent.click(within(await openMenu("src")).getByText("tree.findInFolder"))
    expect(useWorkspace.getState().searchScope).toBe("src")
    expect(useWorkspace.getState().tool).toBe("search")
  })

  it("offers Find in Folder on folders only", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    expect(within(await openMenu("a.ts")).queryByText("tree.findInFolder")).not.toBeInTheDocument()
  })

  it("Open With opens a second page listing the viewers, and comes back", async () => {
    tree({ [ROOT]: [file("readme.md")] })
    useProject.setState({ git: { isRepo: true } as never })
    render(<FileTree />)
    await screen.findByText("readme.md")
    await userEvent.click(within(await openMenu("readme.md")).getByText("tree.openWith"))
    const page = await screen.findByRole("menu")
    expect(within(page).getByText("tree.viewerText")).toBeInTheDocument()
    expect(within(page).getByText("tree.viewerPreview")).toBeInTheDocument()
    expect(within(page).getByText("tree.viewerDiff")).toBeInTheDocument()
    await userEvent.click(within(page).getByText("tree.openWithBack"))
    expect(within(await screen.findByRole("menu")).getByText("tree.openWith")).toBeInTheDocument()
  })

  it("offers no Preview for a file that has no rich rendering", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    await userEvent.click(within(await openMenu("a.ts")).getByText("tree.openWith"))
    const page = await screen.findByRole("menu")
    expect(within(page).queryByText("tree.viewerPreview")).not.toBeInTheDocument()
  })

  it("Open With ▸ Editor forces the source view and opens the file", async () => {
    tree({ [ROOT]: [file("readme.md")] })
    render(<FileTree />)
    await screen.findByText("readme.md")
    await userEvent.click(within(await openMenu("readme.md")).getByText("tree.openWith"))
    await userEvent.click(within(await screen.findByRole("menu")).getByText("tree.viewerText"))
    expect(useTextView.getState().force.has(`${ROOT}/readme.md`)).toBe(true)
    expect(open).toHaveBeenCalledWith(`${ROOT}/readme.md`)
  })

  it("offers Compare with Saved only for a file with unsaved edits", async () => {
    tree({ [ROOT]: [file("a.ts"), file("b.ts")] })
    useEditorActions.setState({ dirtyPaths: ["a.ts"] })
    render(<FileTree />)
    await screen.findByText("a.ts")
    expect(within(await openMenu("a.ts")).getByText("diff.compareWithSaved")).toBeInTheDocument()
    expect(
      within(await openMenu("b.ts")).queryByText("diff.compareWithSaved"),
    ).not.toBeInTheDocument()
  })
})

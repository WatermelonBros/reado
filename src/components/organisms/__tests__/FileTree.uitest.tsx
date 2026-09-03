// UI test: the lazy file tree — listing, expanding, opening, the quiet reading
// cues (dimming, per-folder counts, delta badge) and the right-click menu.
// The disk, the OS drag-drop bridge and the file-manager reveal are mocked; the
// stores are the real ones, driven from the test.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DirEntry } from "@/lib/api"

const listDir = vi.fn<(root: string, dir: string, showHidden: boolean) => Promise<DirEntry[]>>()
const listFiles = vi.fn<(root: string) => Promise<string[]>>()
const importPaths = vi.fn<(root: string, sources: string[], dest: string) => Promise<void>>(
  async () => {},
)
const movePath = vi.fn<(root: string, from: string, to: string) => Promise<void>>(async () => {})

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listDir: (root: string, dir: string, showHidden: boolean) => listDir(root, dir, showHidden),
  listFiles: (root: string) => listFiles(root),
  importPaths: (root: string, sources: string[], dest: string) => importPaths(root, sources, dest),
  movePath: (root: string, from: string, to: string) => movePath(root, from, to),
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
import { useReadProgress } from "@/lib/readProgress"
import { useProject } from "@/lib/store"
import { useTextView } from "@/lib/textView"

const ROOT = "/repo"
const dir = (name: string): DirEntry => ({ name, path: `${ROOT}/${name}`, isDir: true })
const file = (name: string): DirEntry => ({ name, path: `${ROOT}/${name}`, isDir: false })

/** The tree at the root plus one folder whose children load on expand. */
function tree(children: Record<string, DirEntry[]>) {
  listDir.mockImplementation(async (_root, d) => children[d] ?? [])
}

const open = vi.fn()

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
  })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
  useDiagnostics.setState({ byFile: {}, errors: {} })
  useTextView.setState({ force: new Set() })
  useFileUndo.setState({ stack: [] })
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
  it("opens a file on click", async () => {
    tree({ [ROOT]: [file("a.ts")] })
    render(<FileTree />)
    await userEvent.click(await screen.findByText("a.ts"))
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
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`)
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
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`)
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

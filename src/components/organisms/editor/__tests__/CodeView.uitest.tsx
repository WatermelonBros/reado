// UI test: the code viewer — the CodeMirror surface plus Reado's overlays
// (comment gutter and thread, composer, context menu, peek, re-anchor bar,
// save). CodeMirror is real; the backend, the language server and the agent
// bridge are mocked.
import { EditorView } from "@codemirror/view"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Comment } from "@/lib/api"

const writeFile = vi.fn(async () => {})
const readFile = vi.fn(async () => ({ kind: "text", text: "def target() {}\n" }))
const gitBlame = vi.fn(async () => [])
const gitWorkingDiffLines = vi.fn(async () => [])
const findDefinition = vi.fn(async () => [] as Array<{ path: string; line: number }>)
const formatFile = vi.fn(async () => "")
vi.mock("../../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/api")>()),
  writeFile: (...a: unknown[]) => writeFile(...(a as [])),
  readFile: (...a: unknown[]) => readFile(...(a as [])),
  gitBlame: (...a: unknown[]) => gitBlame(...(a as [])),
  gitWorkingDiffLines: (...a: unknown[]) => gitWorkingDiffLines(...(a as [])),
  findDefinition: (...a: unknown[]) => findDefinition(...(a as [])),
  formatFile: (...a: unknown[]) => formatFile(...(a as [])),
}))

const dispatchToAgent = vi.fn(async (_p: string) => true)
vi.mock("../../../../lib/agents", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/agents")>()),
  dispatchToAgent: (p: string) => dispatchToAgent(p),
}))

let serverAttached = false
const lspDefinition = vi.hoisted(() =>
  vi.fn(() => null as Promise<{ path: string; line: number } | null> | null),
)
const lspLocate = vi.hoisted(() => vi.fn(() => true))
vi.mock("../../../../lib/lsp", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/lsp")>()),
  hasServer: () => serverAttached,
  lspSupport: vi.fn(async () => []),
  lspDefinition,
  lspLocate,
  lspHover: vi.fn(async () => "the docs"),
}))

vi.mock("../../CommentComposer", () => ({
  CommentComposer: ({ startLine, endLine }: { startLine: number; endLine: number }) => (
    <div data-testid="composer">{`${startLine}-${endLine}`}</div>
  ),
}))
vi.mock("../../CommentThread", () => ({
  CommentThread: ({ comment }: { comment: Comment }) => (
    <div data-testid="thread">{comment.id}</div>
  ),
}))

import { CodeView } from "@/components/organisms/editor/CodeView"
import { ExternalReload } from "@/components/organisms/editor/extensions"
import { useBookmarks } from "@/lib/bookmarks"
import { useComments } from "@/lib/comments"
import { useDiagnostics } from "@/lib/diagnostics"
import { useDocInfo } from "@/lib/docInfo"
import { explainSymbolAt, taskFromDiagnostic } from "@/lib/lspActions"
import { useReadProgress } from "@/lib/readProgress"
import { useCursor, useEditorActions, useProject, useSessions, useSettings } from "@/lib/store"

const ROOT = "/repo"
const PATH = "/repo/src/a.ts"
const REL = "src/a.ts"
const TEXT = "function outer() {\n  const x = 1\n  return x\n}\n"

const comment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    state: "open",
    kind: "task",
    type: "bug",
    messages: [{ author: "me", body: "look here", createdAt: 0 }],
    anchor: { scope: "range", file: REL, startLine: 2, endLine: 2 },
    ...over,
  }) as Comment

/** Render the view with sensible defaults. */
function mount(props: Partial<React.ComponentProps<typeof CodeView>> = {}) {
  return render(
    <CodeView
      path={PATH}
      relPath={REL}
      text={TEXT}
      comments={[]}
      wrap={false}
      codeFont=""
      focusMode={false}
      renderWhitespace={false}
      landingLine={null}
      primary
      pinned={false}
      changedLines={[]}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // happy-dom lays nothing out, so CodeMirror can't map positions to pixels —
  // and every overlay is positioned from that. Give it a line box.
  vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({
    top: 10,
    bottom: 26,
    left: 0,
    right: 100,
  })
  serverAttached = false
  lspDefinition.mockReturnValue(null)
  formatFile.mockResolvedValue("")
  gitBlame.mockResolvedValue([])
  readFile.mockResolvedValue({ kind: "text", text: "def target() {}\n" })
  useProject.setState({ root: ROOT, active: PATH, git: { isRepo: true } as never, open: vi.fn() })
  useComments.setState({ comments: [], activeId: null, reanchoringId: null })
  useBookmarks.setState({ bookmarks: [] })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
  useEditorActions.setState({
    dirty: false,
    blame: false,
    composeNonce: 0,
    explainNonce: 0,
    peekNonce: 0,
    diffing: false,
  })
  useSettings.setState({
    showRibbon: false,
    stickyScroll: false,
    inlineBlame: false,
    diffGutter: false,
    trimTrailingWhitespace: false,
    insertFinalNewline: false,
  })
})
afterEach(() => vi.restoreAllMocks())

describe("the editing surface", () => {
  it("renders the file's text", () => {
    const { container } = mount()
    expect(container.querySelector(".cm-content")?.textContent).toContain("function outer()")
  })

  it("hands its view to the status bar — but only from the primary pane", () => {
    const { unmount } = mount()
    expect(useDocInfo.getState().view).not.toBeNull()
    unmount()
    expect(useDocInfo.getState().view).toBeNull()
    mount({ primary: false })
    expect(useDocInfo.getState().view).toBeNull()
  })

  it("reports the document's line endings and indentation", () => {
    mount({ text: "a\r\n    b\r\n" })
    expect(useDocInfo.getState().eol).toBe("CRLF")
    expect(useDocInfo.getState().indentSize).toBe(4)
  })

  it("publishes the detected language, and clears a stale override on a new file", () => {
    const { unmount } = mount()
    expect(useDocInfo.getState().language).toBe("TypeScript")

    useDocInfo.setState({ languageOverride: "Python" })
    unmount()
    // A *different* language, so a component that never re-detects fails here
    // rather than coasting on the previous file's value.
    mount({ path: "/repo/src/b.py", relPath: "src/b.py", text: "b = 2\n" })
    // The override belongs to the file it was picked on — a new file re-detects.
    expect(useDocInfo.getState().languageOverride).toBeNull()
    expect(useDocInfo.getState().language).toBe("Python")
  })

  it("replaces the buffer when the file changed on disk", () => {
    const { container, rerender } = mount()
    rerender(
      <CodeView
        path={PATH}
        relPath={REL}
        text="rewritten by the agent\n"
        comments={[]}
        wrap={false}
        codeFont=""
        focusMode={false}
        renderWhitespace={false}
        landingLine={null}
        primary
        pinned={false}
        changedLines={[]}
      />,
    )
    expect(container.querySelector(".cm-content")?.textContent).toContain("rewritten by the agent")
  })

  it("won't clobber unsaved manual edits with a disk reload", () => {
    useEditorActions.setState({ dirty: true })
    const { container, rerender } = mount()
    rerender(
      <CodeView
        path={PATH}
        relPath={REL}
        text="from disk\n"
        comments={[]}
        wrap={false}
        codeFont=""
        focusMode={false}
        renderWhitespace={false}
        landingLine={null}
        primary
        pinned={false}
        changedLines={[]}
      />,
    )
    expect(container.querySelector(".cm-content")?.textContent).toContain("function outer()")
  })
})

describe("saving", () => {
  /** The Mod-s binding lives in the editor's keymap; Mod is Cmd or Ctrl
   *  depending on the platform, so send both shapes. */
  const pressSave = (container: HTMLElement) => {
    const content = container.querySelector(".cm-content") as HTMLElement
    fireEvent.keyDown(content, { key: "s", code: "KeyS", metaKey: true })
    fireEvent.keyDown(content, { key: "s", code: "KeyS", ctrlKey: true })
  }

  it("writes the buffer and clears the dirty flag", async () => {
    useEditorActions.setState({ dirty: true })
    const { container } = mount()
    pressSave(container)
    await waitFor(() => expect(writeFile).toHaveBeenCalledWith(ROOT, REL, TEXT))
    await waitFor(() => expect(useEditorActions.getState().dirty).toBe(false))
  })

  it("applies the opt-in save hygiene", async () => {
    useSettings.setState({ trimTrailingWhitespace: true, insertFinalNewline: true })
    const { container } = mount({ text: "a   \nb" })
    pressSave(container)
    await waitFor(() => expect(writeFile).toHaveBeenCalledWith(ROOT, REL, "a\nb\n"))
  })

  it("surfaces a failed write instead of swallowing it", async () => {
    writeFile.mockRejectedValue(new Error("read-only file system"))
    const { container } = mount()
    pressSave(container)
    const banner = await screen.findByRole("alert")
    expect(banner).toBeInTheDocument()
    await userEvent.click(within(banner).getByRole("button"))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("never writes a PR-pinned buffer to the working tree", () => {
    const { container } = mount({ pinned: true })
    pressSave(container)
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe("the comment overlay", () => {
  it("opens the composer when the palette asks for one", async () => {
    mount()
    useEditorActions.setState({ composeNonce: 1 })
    expect(await screen.findByTestId("composer")).toBeInTheDocument()
  })

  it("opens the thread of the active comment", async () => {
    // The thread hangs off its anchor line and only shows while that line is in
    // view — which needs a viewport height happy-dom doesn't give us.
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 600,
    })
    useComments.setState({ activeId: "c1" })
    mount({ comments: [comment()] })
    expect(await screen.findByTestId("thread")).toHaveTextContent("c1")
    if (h) Object.defineProperty(HTMLElement.prototype, "clientHeight", h)
  })

  it("shows no thread when the active id matches none of this file's comments", async () => {
    // Same viewport height as the positive case above — without it nothing can
    // render a thread and the assertion is true for the wrong reason.
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight")
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 600,
    })
    useComments.setState({ activeId: "somewhere-else" })
    mount({ comments: [comment()] })
    await Promise.resolve()
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument()
    if (h) Object.defineProperty(HTMLElement.prototype, "clientHeight", h)
  })
})

describe("re-anchoring an orphan", () => {
  it("offers confirm and cancel while an orphan is being re-anchored", async () => {
    useComments.setState({
      reanchoringId: "c1",
      comments: [comment({ orphan: true } as Partial<Comment>)],
    })
    mount({ comments: [comment()] })
    // The bar names the orphan it is re-anchoring, but the i18n stub drops the
    // interpolated label, so only its presence and its two actions are checked
    // here — `applyReanchor` below is what proves it acts on the right comment.
    expect(screen.getByText("orphans.reanchorHint")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "orphans.confirm" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(useComments.getState().reanchoringId).toBeNull()
  })

  it("is absent when nothing is being re-anchored", () => {
    mount()
    expect(screen.queryByText("orphans.reanchorHint")).not.toBeInTheDocument()
  })
})

describe("explaining code to the agent", () => {
  it("sends an explain prompt for the selection", async () => {
    mount()
    useEditorActions.setState({ explainNonce: 1 })
    await waitFor(() => expect(dispatchToAgent).toHaveBeenCalled())
    expect(vi.mocked(dispatchToAgent).mock.lastCall?.[0]).toContain("READO EXPLAIN")
  })

  it("only the primary pane answers the request", () => {
    mount({ primary: false })
    useEditorActions.setState({ explainNonce: 1 })
    expect(dispatchToAgent).not.toHaveBeenCalled()
  })
})

describe("peeking a definition", () => {
  it("previews the definition found in the symbol index", async () => {
    findDefinition.mockResolvedValue([{ path: "/repo/src/b.ts", line: 1 }])
    mount()
    // Put the caret inside a word, so there is a symbol to peek at.
    useDocInfo.getState().view?.dispatch({ selection: { anchor: 3 } })
    useEditorActions.setState({ peekNonce: 1 })
    await waitFor(() => expect(findDefinition).toHaveBeenCalledWith(ROOT, "function"))
    expect(await screen.findByText("src/b.ts:1")).toBeInTheDocument()
  })
})

describe("git-backed gutters", () => {
  it("asks for blame only when a blame view is on", async () => {
    const { unmount } = mount()
    expect(gitBlame).not.toHaveBeenCalled()
    unmount()
    useEditorActions.setState({ blame: true })
    mount()
    await waitFor(() => expect(gitBlame).toHaveBeenCalledWith(ROOT, REL))
  })

  it("asks for the working-tree diff only when the diff gutter is on", async () => {
    const { unmount } = mount()
    expect(gitWorkingDiffLines).not.toHaveBeenCalled()
    unmount()
    useSettings.setState({ diffGutter: true })
    mount()
    await waitFor(() => expect(gitWorkingDiffLines).toHaveBeenCalledWith(ROOT, REL))
  })
})

describe("the context menu", () => {
  /** Right-click inside the code, with a document position resolved for it. */
  const openMenu = async (container: HTMLElement, pos = 3) => {
    // Inside "function" by default, so the word-dependent actions are offered.
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(pos)
    fireEvent.contextMenu(container.querySelector(".cm-content") as HTMLElement)
    return await screen.findByRole("menu")
  }

  it("offers the reading actions on a word", async () => {
    const { container } = mount()
    const menu = await openMenu(container)
    for (const label of ["editor.goToDef", "comment.new", "editor.explain", "editor.format"]) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }
  })

  it("adds the language-server actions only when a server is attached", async () => {
    serverAttached = true
    const { container } = mount()
    const menu = await openMenu(container)
    expect(within(menu).getByText("editor.goToTypeDef")).toBeInTheDocument()
    expect(within(menu).getByText("editor.explainSymbol")).toBeInTheDocument()
  })

  it("won't offer to format a PR-pinned buffer — the save is a no-op", async () => {
    const { container } = mount({ pinned: true })
    const menu = await openMenu(container)
    expect(within(menu).queryByText("editor.format")).not.toBeInTheDocument()
  })

  it("won't offer the diff toggle outside a repository", async () => {
    useProject.setState({ git: { isRepo: false } as never })
    const { container } = mount()
    const menu = await openMenu(container)
    expect(within(menu).queryByText("diff.toggle")).not.toBeInTheDocument()
  })

  it("opens the composer on the clicked line", async () => {
    const { container } = mount()
    const menu = await openMenu(container, 20)
    await userEvent.click(within(menu).getByText("comment.new"))
    expect(await screen.findByTestId("composer")).toBeInTheDocument()
  })

  it("explains the selection through the agent", async () => {
    const { container } = mount()
    const menu = await openMenu(container)
    await userEvent.click(within(menu).getByText("editor.explainNote"))
    await waitFor(() => expect(dispatchToAgent).toHaveBeenCalled())
    expect(vi.mocked(dispatchToAgent).mock.lastCall?.[0]).toContain("reado comment add")
  })
})

describe("what typing does", () => {
  /** The live view for the mounted editor (the primary pane publishes it). */
  const view = () => useDocInfo.getState().view!

  it("marks the document dirty and mirrors the caret to the status bar", () => {
    mount()
    view().dispatch({ changes: { from: 0, insert: "x" }, selection: { anchor: 1 } })
    expect(useEditorActions.getState().dirty).toBe(true)
    expect(useCursor.getState()).toMatchObject({ line: 1, col: 2 })
  })

  it("a reload from disk is not an edit — it must not flip the dirty flag", () => {
    mount()
    view().dispatch({
      changes: { from: 0, to: view().state.doc.length, insert: "from disk" },
      annotations: ExternalReload.of(true),
    })
    expect(useEditorActions.getState().dirty).toBe(false)
  })

  it("remembers the caret per file, debounced, so reopening lands where you left", async () => {
    vi.useFakeTimers()
    mount()
    view().dispatch({ selection: { anchor: view().state.doc.line(3).from } })
    await vi.advanceTimersByTimeAsync(400)
    expect(useSessions.getState().byRoot[ROOT]?.cursor?.[REL]).toMatchObject({ line: 3 })
    vi.useRealTimers()
  })

  it("only the primary pane writes the shared cursor state", () => {
    useCursor.setState({ line: 99, col: 99 })
    const { container } = mount({ primary: false })
    // Drive the split pane's own editor: moving its caret must not touch the
    // status bar, which belongs to the primary pane.
    const split = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)
    split?.dispatch({ selection: { anchor: split.state.doc.line(3).from } })
    expect(useCursor.getState()).toMatchObject({ line: 99, col: 99 })
  })

  it("auto-saves after a pause when the setting asks for it", async () => {
    vi.useFakeTimers()
    useSettings.setState({ autoSave: "afterDelay" })
    mount()
    view().dispatch({ changes: { from: 0, insert: "x" } })
    expect(writeFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1100)
    expect(writeFile).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("auto-saves on blur when the setting asks for that instead", () => {
    useSettings.setState({ autoSave: "onFocusChange" })
    const { container } = mount()
    useEditorActions.setState({ dirty: true })
    fireEvent.blur(container.querySelector(".cm-content") as HTMLElement)
    expect(writeFile).toHaveBeenCalled()
  })

  it("saves nothing on blur with auto-save off", () => {
    useSettings.setState({ autoSave: "off" })
    const { container } = mount()
    useEditorActions.setState({ dirty: true })
    fireEvent.blur(container.querySelector(".cm-content") as HTMLElement)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("auto-save writes only when there is something unsaved", async () => {
    vi.useFakeTimers()
    useSettings.setState({ autoSave: "afterDelay" })
    mount()
    view().dispatch({ changes: { from: 0, insert: "x" } })
    useEditorActions.setState({ dirty: false }) // saved by hand in the meantime
    await vi.advanceTimersByTimeAsync(1100)
    expect(writeFile).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe("the language server's tooltip actions", () => {
  const view = () => useDocInfo.getState().view!

  it("turns a diagnostic into an anchored task, prefilled with its message", async () => {
    mount()
    view().dispatch({
      effects: taskFromDiagnostic.of({ from: 0, to: 5, message: "x is possibly null" }),
    })
    expect(await screen.findByTestId("composer")).toHaveTextContent("1-1")
  })

  it("asks the agent to explain the symbol the tooltip named", async () => {
    mount()
    view().dispatch({ effects: explainSymbolAt.of({ pos: 3 }) })
    await waitFor(() => expect(dispatchToAgent).toHaveBeenCalled())
    expect(vi.mocked(dispatchToAgent).mock.lastCall?.[0]).toContain("READO EXPLAIN")
  })
})

describe("the reading overlays", () => {
  const view = () => useDocInfo.getState().view!

  it("hovering a line offers to comment on it", async () => {
    const { container } = mount()
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(3)
    fireEvent.mouseMove(container.firstChild as HTMLElement, { clientX: 10, clientY: 20 })
    await userEvent.click(await screen.findByLabelText("comment.new"))
    expect(await screen.findByTestId("composer")).toHaveTextContent("1-1")
  })

  it("the affordance acts on the whole selection when there is one", async () => {
    const { container } = mount()
    view().dispatch({ selection: { anchor: 0, head: view().state.doc.line(3).to } })
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(3)
    fireEvent.mouseMove(container.firstChild as HTMLElement, { clientX: 10, clientY: 20 })
    await userEvent.click(await screen.findByLabelText("comment.new"))
    expect(await screen.findByTestId("composer")).toHaveTextContent("1-3")
  })

  it("the affordance goes away once the pointer leaves the code", async () => {
    const { container } = mount()
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(3)
    fireEvent.mouseMove(container.firstChild as HTMLElement, { clientX: 10, clientY: 20 })
    await screen.findByLabelText("comment.new")
    fireEvent.mouseLeave(container.firstChild as HTMLElement)
    expect(screen.queryByLabelText("comment.new")).not.toBeInTheDocument()
  })

  it("marks the commented line in the gutter, and counts a shared line", () => {
    const { container, unmount } = mount({ comments: [comment()] })
    expect(container.querySelectorAll(".reado-gutter-marker")).toHaveLength(1)
    unmount()

    const two = mount({ comments: [comment(), comment({ id: "c2" })] })
    expect(two.container.querySelector(".reado-gutter-marker")?.textContent).toBe("2")
  })

  it("marks a line as done only when every comment on it is resolved", () => {
    const { container, unmount } = mount({
      comments: [comment({ state: "done" }), comment({ id: "c2" })],
    })
    expect(container.querySelector(".reado-gutter-marker")?.className).not.toContain("--done")
    unmount()

    const done = mount({ comments: [comment({ state: "done" })] })
    expect(done.container.querySelector(".reado-gutter-marker")?.className).toContain("--done")
  })

  it("never anchors an orphan to its stale line", () => {
    const { container } = mount({ comments: [comment({ orphan: true } as Partial<Comment>)] })
    expect(container.querySelectorAll(".reado-gutter-marker")).toHaveLength(0)
  })

  it("clicking the bookmark gutter toggles a bookmark with its line's text", () => {
    const { container } = mount()
    const cell = container.querySelector(".reado-bookmark-gutter .cm-gutterElement") as HTMLElement
    cell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(useBookmarks.getState().bookmarks[0]).toMatchObject({
      path: REL,
      line: 1,
      snippet: "function outer() {",
    })
  })

  it("re-anchors an orphan to the current selection on confirm", async () => {
    const applyReanchor = vi.fn()
    useComments.setState({ reanchoringId: "c1", comments: [comment()], applyReanchor })
    mount({ comments: [comment()] })
    view().dispatch({ selection: { anchor: 0, head: view().state.doc.line(2).to } })
    await userEvent.click(screen.getByRole("button", { name: "orphans.confirm" }))
    expect(applyReanchor).toHaveBeenCalledWith(REL, 1, 2)
  })

  it("the same gesture re-anchors instead of composing while re-anchoring", async () => {
    const applyReanchor = vi.fn()
    useComments.setState({ reanchoringId: "c1", comments: [comment()], applyReanchor })
    const { container } = mount({ comments: [comment()] })
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(3)
    fireEvent.mouseMove(container.firstChild as HTMLElement, { clientX: 10, clientY: 20 })
    await userEvent.click(await screen.findByLabelText("comment.new"))
    expect(applyReanchor).toHaveBeenCalled()
    expect(screen.queryByTestId("composer")).not.toBeInTheDocument()
  })
})

describe("the structure ribbon", () => {
  /** The ribbon's marks are buttons titled "<kind> · <line>". */
  const marks = (root: HTMLElement) =>
    [...root.querySelectorAll("button[title]")]
      .map((b) => b.getAttribute("title") ?? "")
      .filter((t) => t.includes(" · "))

  it("is off by default", () => {
    const { container } = mount({ comments: [comment()] })
    expect(marks(container)).toEqual([])
  })

  it("marks symbols, comments and problems when the setting is on", () => {
    useSettings.setState({ showRibbon: true })
    useDiagnostics.setState({
      byFile: { [PATH]: [{ line: 3, character: 0, severity: 1, message: "bad" }] },
      errors: {},
    })
    const { container } = mount({ comments: [comment()] })
    const titles = marks(container)
    expect(titles).toContain("comment · 2") // the seeded comment's anchor
    expect(titles).toContain("error · 3") // the diagnostic
    expect(titles.some((t) => t.startsWith("symbol · "))).toBe(true)
  })

  it("jumps to the line a mark stands for", async () => {
    useSettings.setState({ showRibbon: true })
    const { container } = mount({ comments: [comment()] })
    const mark = [...container.querySelectorAll("button[title]")].find(
      (b) => b.getAttribute("title") === "comment · 2",
    ) as HTMLElement
    const v = useDocInfo.getState().view!
    const dispatch = vi.spyOn(v, "dispatch")
    await userEvent.click(mark)
    // It scrolls rather than moving the caret, so the target is read off the
    // scrollIntoView effect — "dispatched something" would pass for any line.
    const spec = dispatch.mock.lastCall?.[0] as
      | { effects: { value: { range: { from: number } } } }
      | undefined
    expect(spec?.effects).toBeTruthy()
    expect(v.state.doc.lineAt(spec!.effects.value.range.from).number).toBe(2)
  })

  it("leaves a PR-pinned file's stale diagnostics out — the server isn't on it", () => {
    useSettings.setState({ showRibbon: true })
    useDiagnostics.setState({
      byFile: { [PATH]: [{ line: 3, character: 0, severity: 1, message: "stale" }] },
      errors: {},
    })
    const pinned = mount({ pinned: true })
    expect(marks(pinned.container).some((t) => t.startsWith("error"))).toBe(false)
    pinned.unmount()

    // The same diagnostics on the working-tree file do draw a mark, so the
    // absence above is the pinning, not a missing fixture.
    const live = mount({ pinned: false })
    expect(marks(live.container)).toContain("error · 3")
  })
})

describe("blame", () => {
  it("annotates the whole column when the blame view is on", async () => {
    useEditorActions.setState({ blame: true })
    gitBlame.mockResolvedValue([
      { line: 1, hash: "abc1234", author: "Ada Lovelace", time: 1, summary: "first" },
    ] as never)
    const { container } = mount()
    await waitFor(() => expect(container.querySelector(".reado-blame")).toBeTruthy(), {
      timeout: 3000,
    })
  })

  it("draws no blame column in inline mode", async () => {
    useSettings.setState({ inlineBlame: true })
    gitBlame.mockResolvedValue([
      { line: 1, hash: "abc1234", author: "Ada Lovelace", time: 1, summary: "first" },
    ] as never)
    const { container } = mount()
    await waitFor(() => expect(gitBlame).toHaveBeenCalledWith(ROOT, REL))
    // Only the absence of the column is asserted here: the inline widget is a
    // viewport decoration, and happy-dom's zero-height measurement makes its
    // presence a coin flip. `blameGutter.uitest.ts` pins it deterministically
    // against a directly-mounted editor.
    expect(container.querySelector(".reado-blame-gutter")).toBeNull()
  })

  it("draws nothing when the file has no blame", async () => {
    useEditorActions.setState({ blame: true })
    gitBlame.mockResolvedValue([])
    const { container } = mount()
    await waitFor(() => expect(gitBlame).toHaveBeenCalled())
    expect(container.querySelector(".reado-blame")).toBeNull()
  })
})

describe("peeking a definition", () => {
  it("previews what the language server resolved, and opens it", async () => {
    lspDefinition.mockReturnValue(Promise.resolve({ path: "/repo/src/b.ts", line: 1 }))
    readFile.mockResolvedValue({ kind: "text", text: "def target() {}\n" })
    mount()
    useDocInfo.getState().view?.dispatch({ selection: { anchor: 3 } })
    useEditorActions.setState({ peekNonce: 1 })
    expect(await screen.findByText("src/b.ts:1")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "peek.open" }))
    expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/b.ts", 1)
  })

  it("says so when nothing resolves, and closes on Escape", async () => {
    findDefinition.mockResolvedValue([])
    mount()
    useDocInfo.getState().view?.dispatch({ selection: { anchor: 3 } })
    useEditorActions.setState({ peekNonce: 1 })
    expect(await screen.findByText("peek.none")).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("peek.none")).not.toBeInTheDocument())
  })

  it("does nothing off a word", () => {
    mount({ text: "   \n" })
    useEditorActions.setState({ peekNonce: 1 })
    expect(findDefinition).not.toHaveBeenCalled()
  })
})

describe("the landing jump", () => {
  it("lights the landed-on line, then lets it fade", async () => {
    vi.useFakeTimers()
    const { container } = mount({ landingLine: { line: 2, nonce: 1 } })
    expect(container.querySelector(".cm-landing-line")).toBeTruthy()
    await vi.advanceTimersByTimeAsync(1500)
    expect(container.querySelector(".cm-landing-line")).toBeNull()
    vi.useRealTimers()
  })

  it("clamps a landing line past the end of the file to its last line", () => {
    const { container } = mount({ landingLine: { line: 999, nonce: 1 } })
    const lit = container.querySelectorAll(".cm-landing-line")
    expect(lit).toHaveLength(1)
    const lines = [...container.querySelectorAll(".cm-line")]
    expect(lines.indexOf(lit[0] as Element)).toBe(lines.length - 1)
  })
})

describe("sticky scroll", () => {
  it("pins the enclosing scope headers above the viewport", async () => {
    useSettings.setState({ stickyScroll: true })
    const { container } = mount({
      text: "function outer() {\n  if (x) {\n    deep()\n  }\n}\n",
    })
    vi.spyOn(EditorView.prototype, "lineBlockAtHeight").mockReturnValue({
      from: useDocInfo.getState().view!.state.doc.line(3).from,
      to: 0,
      top: 0,
      height: 0,
      length: 0,
      widget: null,
      widgetLineBreaks: 0,
      type: 0,
    } as never)
    const scroller = container.querySelector(".cm-scroller") as HTMLElement
    fireEvent.scroll(scroller)
    // The header is a button; the same text also sits in the document below it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "function outer() {" })).toBeInTheDocument(),
    )
  })

  it("pins nothing when the setting is off", () => {
    const { container } = mount({ text: "function outer() {\n  if (x) {\n    deep()\n  }\n}\n" })
    // The same stub the positive case needs — otherwise this passes because no
    // header could be computed at all, not because the setting is off.
    vi.spyOn(EditorView.prototype, "lineBlockAtHeight").mockReturnValue({
      from: useDocInfo.getState().view!.state.doc.line(3).from,
      to: 0,
      top: 0,
      height: 0,
      length: 0,
      widget: null,
      widgetLineBreaks: 0,
      type: 0,
    } as never)
    fireEvent.scroll(container.querySelector(".cm-scroller") as HTMLElement)
    expect(screen.queryByRole("button", { name: "function outer() {" })).not.toBeInTheDocument()
  })
})

describe("auto-marking a file read", () => {
  it("marks a short file read after a dwell, since it fires no scroll", async () => {
    vi.useFakeTimers()
    mount()
    await vi.advanceTimersByTimeAsync(1500)
    expect(useReadProgress.getState().read.has(REL)).toBe(true)
    vi.useRealTimers()
  })

  it("remembers the scroll offset for the session", async () => {
    vi.useFakeTimers()
    const { container } = mount()
    const scroller = container.querySelector(".cm-scroller") as HTMLElement
    // happy-dom never scrolls, so give it a real offset to remember.
    Object.defineProperty(scroller, "scrollTop", { value: 120, configurable: true })
    fireEvent.scroll(scroller)
    await vi.advanceTimersByTimeAsync(400)
    expect(useSessions.getState().byRoot[ROOT]?.scroll?.[REL]).toBe(120)
    vi.useRealTimers()
  })
})

// The status bar's language override is deliberately untested here. Applying a
// *known* one dynamically imports the language's parser, which doesn't resolve
// under the test runner; and the Plain Text fallback for an unknown one only
// reconfigures a compartment, which leaves nothing observable (`language` and
// `state.facet(language)` read the same before and after). What *is* observable
// — the publish and reset on a path change — is covered above.

describe("more of the context menu", () => {
  const openMenu = async (container: HTMLElement, pos = 3) => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(pos)
    fireEvent.contextMenu(container.querySelector(".cm-content") as HTMLElement)
    return await screen.findByRole("menu")
  }

  it("runs the language-server navigations", async () => {
    serverAttached = true
    const { container } = mount()
    const menu = await openMenu(container)
    await userEvent.click(within(menu).getByText("editor.goToTypeDef"))
    expect(lspLocate).toHaveBeenCalledWith(
      expect.anything(),
      3,
      "typeDefinition",
      expect.any(Function),
    )
  })

  it("explains the symbol through the agent", async () => {
    serverAttached = true
    const { container } = mount()
    const menu = await openMenu(container)
    await userEvent.click(within(menu).getByText("editor.explainSymbol"))
    await waitFor(() => expect(dispatchToAgent).toHaveBeenCalled())
    expect(vi.mocked(dispatchToAgent).mock.lastCall?.[0]).toContain("READO EXPLAIN")
  })

  it("formats the document", async () => {
    formatFile.mockResolvedValue("formatted by the project's formatter\n")
    const { container } = mount()
    const menu = await openMenu(container)
    await userEvent.click(within(menu).getByText("editor.format"))
    await waitFor(() =>
      expect(container.querySelector(".cm-content")?.textContent).toContain(
        "formatted by the project's formatter",
      ),
    )
  })

  it("toggles the diff view", async () => {
    const { container } = mount()
    const menu = await openMenu(container)
    await userEvent.click(within(menu).getByText("diff.toggle"))
    expect(useEditorActions.getState().diffing).toBe(true)
  })

  it("does nothing when the click doesn't land on a document position", () => {
    const { container } = mount()
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(null)
    fireEvent.contextMenu(container.querySelector(".cm-content") as HTMLElement)
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
})

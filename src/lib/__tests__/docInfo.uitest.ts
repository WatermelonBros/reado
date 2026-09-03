// Per-document info and the editor commands the status bar / native menu drive.
// A real EditorView backs the commands, so the CodeMirror dispatches are real.
import { lintGutter, setDiagnostics } from "@codemirror/lint"
import { EditorSelection, EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  createFile: vi.fn(async (_root: string, name: string) => `/root/${name}`),
  findDefinition: vi.fn(async () => []),
  formatFile: vi.fn(async () => ""),
  readFile: vi.fn(async () => ({ kind: "text", text: "from disk" })),
  writeFile: vi.fn(async () => {}),
}))
vi.mock("../prompt", () => ({ prompt: vi.fn(async () => null) }))
vi.mock("../lsp", () => ({
  lspCalls: vi.fn(() => null),
  lspLocate: vi.fn(() => false),
  lspPrepareCallHierarchy: vi.fn(() => null),
  lspPrepareTypeHierarchy: vi.fn(() => null),
  lspTypes: vi.fn(() => null),
}))
const { ask, hier } = vi.hoisted(() => ({
  ask: vi.fn(),
  hier: { mode: "call" as "call" | "type", root: null as { item: unknown } | null, set: vi.fn() },
}))
vi.mock("../qa", () => ({ useQa: { getState: () => ({ ask }) } }))
vi.mock("../hierarchy", () => ({ useHierarchy: { getState: () => hier } }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

const toggle = vi.fn()
vi.mock("../bookmarks", () => ({ useBookmarks: { getState: () => ({ toggle }) } }))

const project = {
  root: "/root",
  active: "/root/src/a.ts" as string | null,
  open: vi.fn(),
  bumpTree: vi.fn(),
}
const setDirty = vi.fn()
const searchFor = vi.fn()
const { workspaceSetState } = vi.hoisted(() => ({ workspaceSetState: vi.fn() }))
vi.mock("../store", () => ({
  useProject: { getState: () => project },
  useEditorActions: { getState: () => ({ setDirty }) },
  useWorkspace: Object.assign(() => ({ searchFor }), {
    getState: () => ({ searchFor }),
    setState: workspaceSetState,
  }),
}))

import { createFile, findDefinition, formatFile, readFile, writeFile } from "@/lib/api"
import {
  addCursorAbove,
  addCursorBelow,
  addCursorsToLineEnds,
  addNextOccurrence,
  askAboutSelection,
  convertEol,
  copyLineDownCmd,
  copyLineUpCmd,
  detectEol,
  detectIndent,
  duplicateSelection,
  findReferencesAtCursor,
  formatDocument,
  goToBracket,
  goToDefinitionAtCursor,
  goToImplementationAtCursor,
  goToLine,
  goToTypeDefinitionAtCursor,
  gotoLastEdit,
  LANGUAGE_OPTIONS,
  moveLineDownCmd,
  moveLineUpCmd,
  newFile,
  nextProblem,
  openFind,
  openGotoLine,
  openReplace,
  prevProblem,
  revertFile,
  saveAs,
  saveDocument,
  selectAllOccurrences,
  setHierarchyDirection,
  setLastEdit,
  showCallHierarchy,
  showTypeHierarchy,
  toggleBlockCommentCmd,
  toggleBookmarkAtCursor,
  toggleLineComment,
  useDocInfo,
} from "@/lib/docInfo"
import {
  lspCalls,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspTypes,
} from "@/lib/lsp"
import { prompt } from "@/lib/prompt"

let view: EditorView

/** Mount a real editor over `doc` and make it the active view. Multi-selection
 *  is on, as it is in the real editor — without it CodeMirror drops extra cursors. */
function mount(doc: string, extra: Extension[] = []) {
  view = new EditorView({
    doc,
    parent: document.body,
    extensions: [EditorState.allowMultipleSelections.of(true), ...extra],
  })
  useDocInfo.setState({ view })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "from disk" })
  vi.mocked(createFile).mockImplementation(async (_root, name) => `/root/${name}`)
  project.root = "/root"
  project.active = "/root/src/a.ts"
  useDocInfo.setState({ view: null, eol: "LF" })
})
afterEach(() => view?.destroy())

/** Let a whole promise chain settle — one microtask leaves it mid-flight, and
 *  an assertion on the pre-change value would pass for the wrong reason. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe("detectEol", () => {
  it("detects CRLF from the raw text", () => {
    expect(detectEol("a\r\nb")).toBe("CRLF")
  })
  it("defaults to LF", () => {
    expect(detectEol("a\nb")).toBe("LF")
    expect(detectEol("")).toBe("LF")
  })
})

describe("detectIndent", () => {
  it("finds the smallest space indent in use", () => {
    expect(detectIndent("a\n    b\n  c\n")).toEqual({ kind: "spaces", size: 2 })
  })

  it("reports tabs when they dominate", () => {
    expect(detectIndent("\ta\n\tb\n  c\n")).toEqual({ kind: "tabs", size: 4 })
  })

  it("falls back to 2 spaces on a flat file", () => {
    expect(detectIndent("a\nb\n")).toEqual({ kind: "spaces", size: 2 })
  })

  it("ignores blank-ish lines with no code after the spaces", () => {
    expect(detectIndent("a\n   \n    b\n")).toEqual({ kind: "spaces", size: 4 })
  })

  it("samples only the head of a huge file", () => {
    const big = `${"a\n".repeat(300)}        deep\n`
    expect(detectIndent(big)).toEqual({ kind: "spaces", size: 2 })
  })
})

describe("LANGUAGE_OPTIONS", () => {
  it("offers Plain Text first, so there's always a way back to no mode", () => {
    expect(LANGUAGE_OPTIONS[0]).toBe("Plain Text")
    expect(new Set(LANGUAGE_OPTIONS).size).toBe(LANGUAGE_OPTIONS.length)
  })
})

describe("goToLine", () => {
  it("puts the cursor at the start of the line", () => {
    mount("one\ntwo\nthree")
    goToLine(2)
    expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from)
  })

  it("clamps out-of-range line numbers instead of throwing", () => {
    mount("one\ntwo")
    goToLine(99)
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
    goToLine(-5)
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1)
  })

  it("is a no-op with no editor open", () => {
    expect(() => goToLine(1)).not.toThrow()
  })
})

describe("saveDocument", () => {
  it("writes the buffer to the active file's project-relative path", () => {
    mount("hello")
    saveDocument()
    expect(writeFile).toHaveBeenCalledWith("/root", "src/a.ts", "hello")
  })

  it("does nothing without a file or a view", () => {
    project.active = null
    mount("hello")
    saveDocument()
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe("convertEol", () => {
  it("rewrites the file with CRLF endings and records the new mode", async () => {
    mount("a\nb\n")
    convertEol("CRLF")
    expect(writeFile).toHaveBeenCalledWith("/root", "src/a.ts", "a\r\nb\r\n")
    await vi.waitFor(() => expect(useDocInfo.getState().eol).toBe("CRLF"))
    expect(setDirty).toHaveBeenCalledWith(false)
  })

  it("normalises back to LF without doubling anything", () => {
    mount("a\r\nb")
    convertEol("LF")
    expect(writeFile).toHaveBeenCalledWith("/root", "src/a.ts", "a\nb")
  })

  it("leaves the recorded mode alone when the write fails", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("readonly"))
    mount("a\nb")
    convertEol("CRLF")
    await flush()
    expect(useDocInfo.getState().eol).toBe("LF")
  })
})

describe("formatDocument", () => {
  it("applies the formatter's output to the buffer", async () => {
    vi.mocked(formatFile).mockResolvedValue("formatted\n")
    mount("unformatted\n")
    await formatDocument()
    expect(formatFile).toHaveBeenCalledWith("/root", "src/a.ts", "unformatted\n")
    expect(view.state.doc.toString()).toBe("formatted\n")
  })

  it("leaves an already-formatted buffer untouched", async () => {
    vi.mocked(formatFile).mockResolvedValue("same\n")
    mount("same\n")
    await formatDocument()
    expect(view.state.doc.toString()).toBe("same\n")
  })

  it("returns null when there's nothing to format", async () => {
    await expect(formatDocument()).resolves.toBeNull()
  })
})

describe("revertFile", () => {
  it("replaces the buffer with what's on disk and clears the dirty flag", async () => {
    mount("edited")
    revertFile()
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe("from disk"))
    expect(setDirty).toHaveBeenCalledWith(false)
  })

  it("won't overwrite the buffer with a binary read", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 3 })
    mount("edited")
    revertFile()
    await flush()
    expect(view.state.doc.toString()).toBe("edited")
  })
})

describe("newFile", () => {
  it("creates the prompted path and opens it", async () => {
    vi.mocked(prompt).mockResolvedValue("src/new.ts")
    await newFile()
    expect(createFile).toHaveBeenCalledWith("/root", "src/new.ts")
    expect(project.open).toHaveBeenCalledWith("/root/src/new.ts")
    expect(project.bumpTree).toHaveBeenCalled()
  })

  it("does nothing when the prompt is cancelled", async () => {
    vi.mocked(prompt).mockResolvedValue(null)
    await newFile()
    expect(createFile).not.toHaveBeenCalled()
  })

  it("does nothing with no project open", async () => {
    project.root = ""
    await newFile()
    expect(prompt).not.toHaveBeenCalled()
  })

  it("swallows an invalid or taken path", async () => {
    vi.mocked(prompt).mockResolvedValue("bad//name")
    vi.mocked(createFile).mockRejectedValue(new Error("exists"))
    await expect(newFile()).resolves.toBeUndefined()
    expect(project.open).not.toHaveBeenCalled()
  })
})

describe("saveAs", () => {
  it("writes the buffer to the chosen path and opens it", async () => {
    vi.mocked(prompt).mockResolvedValue("src/copy.ts")
    mount("body")
    await saveAs()
    expect(writeFile).toHaveBeenCalledWith("/root", "src/copy.ts", "body")
    expect(project.open).toHaveBeenCalledWith("/root/src/copy.ts")
  })

  it("offers the current file's relative path as the default", async () => {
    vi.mocked(prompt).mockResolvedValue(null)
    mount("body")
    await saveAs()
    expect(vi.mocked(prompt).mock.calls[0][0]).toMatchObject({ value: "src/a.ts" })
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe("cursor commands", () => {
  it("addCursorBelow adds a cursor on the next line at the same column", () => {
    mount("abcd\nefgh")
    view.dispatch({ selection: { anchor: 2 } })
    addCursorBelow()
    expect(view.state.selection.ranges).toHaveLength(2)
    expect(view.state.selection.ranges[1].head).toBe(7)
  })

  it("addCursorBelow does nothing on the last line", () => {
    mount("only")
    view.dispatch({ selection: { anchor: 1 } })
    addCursorBelow()
    expect(view.state.selection.ranges).toHaveLength(1)
  })

  it("addCursorsToLineEnds puts a cursor at the end of every spanned line", () => {
    mount("aa\nbbb\ncccc")
    view.dispatch({ selection: { anchor: 0, head: 8 } }) // spans lines 1..3
    addCursorsToLineEnds()
    expect(view.state.selection.ranges.map((r) => r.head)).toEqual([2, 6, 11])
  })

  it("duplicateSelection copies each non-empty selection after itself", () => {
    mount("abc")
    view.dispatch({ selection: { anchor: 0, head: 2 } })
    duplicateSelection()
    expect(view.state.doc.toString()).toBe("ababc")
  })

  it("duplicateSelection ignores a bare cursor", () => {
    mount("abc")
    duplicateSelection()
    expect(view.state.doc.toString()).toBe("abc")
  })

  it("gotoLastEdit jumps back to the recorded position, clamped to the doc", () => {
    mount("abcdef")
    setLastEdit(4)
    gotoLastEdit()
    expect(view.state.selection.main.head).toBe(4)
    setLastEdit(999)
    gotoLastEdit()
    expect(view.state.selection.main.head).toBe(6)
  })
})

describe("symbol navigation", () => {
  it("goToDefinitionAtCursor opens the first definition found", async () => {
    vi.mocked(findDefinition).mockResolvedValue([
      { path: "/root/b.ts", line: 12, text: "const x", score: 1 },
    ])
    mount("const symbolName = 1")
    view.dispatch({ selection: { anchor: 8 } }) // inside "symbolName"
    goToDefinitionAtCursor()
    await vi.waitFor(() => expect(project.open).toHaveBeenCalledWith("/root/b.ts", 12))
    expect(findDefinition).toHaveBeenCalledWith("/root", "symbolName")
  })

  it("goToDefinitionAtCursor does nothing when the cursor isn't on a word", () => {
    mount("   ")
    goToDefinitionAtCursor()
    expect(findDefinition).not.toHaveBeenCalled()
  })

  it("findReferencesAtCursor searches the workspace for the identifier", () => {
    mount("const wanted = 1")
    view.dispatch({ selection: { anchor: 8 } })
    findReferencesAtCursor()
    expect(searchFor).toHaveBeenCalledWith("wanted")
  })
})

describe("toggleBookmarkAtCursor", () => {
  it("bookmarks the cursor's line with a trimmed snippet", () => {
    mount("one\n    two  \nthree")
    view.dispatch({ selection: { anchor: view.state.doc.line(2).from } })
    toggleBookmarkAtCursor()
    expect(toggle).toHaveBeenCalledWith("/root", {
      path: "src/a.ts",
      line: 2,
      snippet: "two",
    })
  })

  it("does nothing with no file open", () => {
    project.active = null
    mount("one")
    toggleBookmarkAtCursor()
    expect(toggle).not.toHaveBeenCalled()
  })
})

describe("the CodeMirror command wrappers", () => {
  it("each one runs on the active view and gives it focus back", () => {
    const commands = [
      toggleLineComment,
      toggleBlockCommentCmd,
      addNextOccurrence,
      selectAllOccurrences,
      addCursorAbove,
      goToBracket,
      copyLineUpCmd,
      copyLineDownCmd,
      moveLineUpCmd,
      moveLineDownCmd,
      openGotoLine,
    ]
    mount("const alpha = 1\nconst beta = 2\n")
    const focus = vi.spyOn(view, "focus")
    for (const run of commands) run()
    // One focus per command: a wrapper that forgot `runOnView` leaves the caret
    // in the panel or the menu that invoked it.
    expect(focus).toHaveBeenCalledTimes(commands.length)
  })

  // The sweep above only proves each wrapper focused the view. These pin the
  // effect for the commands nothing else in this file covers.
  it("toggleLineComment comments the caret's line, and uncomments it again", () => {
    // `toggleComment` reads the comment tokens off the language data — without
    // a language configured it is a no-op for reasons unrelated to the wrapper.
    mount("const alpha = 1\nconst beta = 2\n", [
      EditorState.languageData.of(() => [{ commentTokens: { line: "//" } }]),
    ])
    toggleLineComment()
    expect(view.state.doc.toString()).toBe("// const alpha = 1\nconst beta = 2\n")
    toggleLineComment()
    expect(view.state.doc.toString()).toBe("const alpha = 1\nconst beta = 2\n")
  })

  it("copyLineUpCmd duplicates the caret's line above it", () => {
    mount("alpha\nbeta\n")
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(2).from) })
    copyLineUpCmd()
    expect(view.state.doc.toString()).toBe("alpha\nbeta\nbeta\n")
    // Two identical copies, so the document alone can't tell up from down —
    // the caret staying on the upper one is what does.
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
  })

  it("goToBracket jumps to the matching bracket", () => {
    mount("f(x)\n")
    view.dispatch({ selection: EditorSelection.cursor(1) })
    goToBracket()
    expect(view.state.selection.main.head).toBe(4)
  })

  it("openGotoLine opens the go-to-line panel", () => {
    mount("alpha")
    openGotoLine()
    // `.cm-panels` is the wrapper *any* panel lives in — name the one that
    // must have opened.
    expect(view.dom.querySelector('.cm-panels input[name="line"]')).toBeTruthy()
  })

  it("addCursorAbove adds a second cursor on the line above", () => {
    mount("const alpha = 1\nconst beta = 2\n")
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(2).from) })
    addCursorAbove()
    // Which line the new cursor landed on is the whole point of "Above".
    expect(view.state.selection.ranges.map((r) => view.state.doc.lineAt(r.head).number)).toEqual([
      1, 2,
    ])
  })

  it("duplicateSelection reports no-op for a bare cursor rather than dirtying the doc", () => {
    mount("alpha\nbeta\n")
    view.dispatch({ selection: EditorSelection.cursor(2) })
    const dispatch = vi.spyOn(view, "dispatch")
    duplicateSelection()
    // Without the empty-range filter this still dispatches — an empty change
    // set that marks the buffer modified for no edit.
    expect(dispatch).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe("alpha\nbeta\n")
  })

  it("moves and copies lines for real", () => {
    mount("alpha\nbeta\n")
    copyLineDownCmd()
    expect(view.state.doc.toString()).toBe("alpha\nalpha\nbeta\n")
    // The caret rode the copy down to line 2; moving it down swaps it past beta.
    moveLineDownCmd()
    expect(view.state.doc.toString()).toBe("alpha\nbeta\nalpha\n")
    moveLineUpCmd()
    expect(view.state.doc.toString()).toBe("alpha\nalpha\nbeta\n")
  })

  it("are no-ops with no editor open", () => {
    expect(() => toggleLineComment()).not.toThrow()
    expect(() => copyLineUpCmd()).not.toThrow()
  })

  it("copyLineDown duplicates the caret's line", () => {
    mount("alpha\nbeta\n")
    copyLineDownCmd()
    expect(view.state.doc.toString().startsWith("alpha\nalpha")).toBe(true)
  })

  it("openFind opens the search panel", () => {
    mount("alpha")
    openFind()
    expect(view.dom.querySelector(".cm-panels .cm-search")).toBeTruthy()
  })

  it("openReplace opens the same panel — CM's search includes replace", () => {
    mount("alpha")
    openReplace()
    // "includes replace" is the claim — so assert the replace field itself.
    expect(view.dom.querySelector('.cm-panels input[name="replace"]')).toBeTruthy()
  })
})

describe("jumping between problems", () => {
  it("jumps the caret to the next problem, and back", () => {
    mount("alpha\nbeta\ngamma\n", [lintGutter()])
    view.dispatch(
      setDiagnostics(view.state, [
        { from: 6, to: 10, severity: "error", message: "second line" },
        { from: 11, to: 16, severity: "warning", message: "third line" },
      ]),
    )
    view.dispatch({ selection: EditorSelection.cursor(0) })
    nextProblem()
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
    nextProblem()
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3)
    prevProblem()
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
  })

  it("wraps to the first problem in the file, not the first one reported", () => {
    mount("alpha\nbeta\ngamma\n", [lintGutter()])
    // Nested diagnostics — an expression-level error containing a narrower
    // warning — are routine LSP output. `forEachDiagnostic` reports one when it
    // *ends*, so the inner one arrives first even though it starts later.
    view.dispatch(
      setDiagnostics(view.state, [
        { from: 0, to: 16, severity: "error", message: "outer" },
        { from: 6, to: 10, severity: "warning", message: "inner" },
      ]),
    )
    // Caret past every problem, so `nextProblem` wraps to the earliest one.
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) })
    nextProblem()
    expect(view.state.selection.main.head).toBe(0)
  })

  it("does nothing when the file has no diagnostics", () => {
    mount("alpha\nbeta\n")
    const before = view.state.selection.main.head
    nextProblem()
    prevProblem()
    expect(view.state.selection.main.head).toBe(before)
  })

  it("is a no-op with no editor open", () => {
    expect(() => nextProblem()).not.toThrow()
  })
})

describe("go to type definition / implementation", () => {
  it("ask the language server, which opens the result", () => {
    mount("const alpha = 1")
    goToTypeDefinitionAtCursor()
    expect(lspLocate).toHaveBeenCalledWith(
      view,
      expect.any(Number),
      "typeDefinition",
      expect.any(Function),
    )
    goToImplementationAtCursor()
    expect(lspLocate).toHaveBeenCalledWith(
      view,
      expect.any(Number),
      "implementation",
      expect.any(Function),
    )
  })

  it("are no-ops with no editor open", () => {
    goToTypeDefinitionAtCursor()
    goToImplementationAtCursor()
    expect(lspLocate).not.toHaveBeenCalled()
  })
})

describe("the call and type hierarchies", () => {
  it("open the panel, then root it on what the server prepared", async () => {
    const root = { name: "outer", path: "a.ts", line: 1, item: { name: "outer", uri: "file:///a" } }
    vi.mocked(lspPrepareCallHierarchy).mockReturnValue(Promise.resolve([root]))
    vi.mocked(lspCalls).mockReturnValue(Promise.resolve([]))
    mount("const alpha = 1")
    showCallHierarchy()
    expect(workspaceSetState).toHaveBeenCalledWith({ tool: "hierarchy", lastTool: "hierarchy" })
    await vi.waitFor(() => expect(hier.set).toHaveBeenCalledWith({ root }))
  })

  it("report an unsupported language rather than spinning forever", async () => {
    vi.mocked(lspPrepareTypeHierarchy).mockReturnValue(null)
    mount("const alpha = 1")
    showTypeHierarchy()
    expect(hier.set).toHaveBeenCalledWith({ loading: false, unsupported: true })
  })

  it("report an empty answer the same way", async () => {
    vi.mocked(lspPrepareCallHierarchy).mockReturnValue(Promise.resolve([]))
    mount("const alpha = 1")
    showCallHierarchy()
    await vi.waitFor(() =>
      expect(hier.set).toHaveBeenCalledWith({ loading: false, unsupported: true }),
    )
  })

  it("re-fetch in the other direction on the panel's toggle", async () => {
    hier.root = { item: { name: "outer", uri: "file:///a" } }
    hier.mode = "call"
    vi.mocked(lspCalls).mockReturnValue(Promise.resolve([]))
    mount("const alpha = 1")
    setHierarchyDirection("outgoing")
    expect(hier.set).toHaveBeenCalledWith({ direction: "outgoing", loading: true })
    expect(lspCalls).toHaveBeenCalledWith(view, hier.root.item, "outgoing")
    await vi.waitFor(() => expect(hier.set).toHaveBeenCalledWith({ results: [], loading: false }))
  })

  it("re-fetch types when that's the mode", async () => {
    hier.root = { item: { name: "T", uri: "file:///a" } }
    hier.mode = "type"
    vi.mocked(lspTypes).mockReturnValue(Promise.resolve([]))
    mount("const alpha = 1")
    setHierarchyDirection("super")
    expect(lspTypes).toHaveBeenCalledWith(view, hier.root.item, "super")
  })

  it("do nothing with no hierarchy root", () => {
    hier.root = null
    mount("const alpha = 1")
    setHierarchyDirection("incoming")
    expect(lspCalls).not.toHaveBeenCalled()
  })
})

describe("askAboutSelection", () => {
  it("asks for a question, then records it against the selected lines", async () => {
    vi.mocked(prompt).mockResolvedValue("why is this here?")
    mount("alpha\nbeta\ngamma\n")
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.line(2).to } })
    await askAboutSelection()
    expect(ask).toHaveBeenCalledWith("src/a.ts", 1, 2, "why is this here?")
  })

  it("records nothing when the prompt is cancelled", async () => {
    vi.mocked(prompt).mockResolvedValue(null)
    mount("alpha")
    await askAboutSelection()
    expect(ask).not.toHaveBeenCalled()
  })

  it("does nothing with no file open", async () => {
    project.active = null
    mount("alpha")
    await askAboutSelection()
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe("the remaining edges", () => {
  it("goToDefinitionAtCursor opens nothing when the index found nothing", async () => {
    vi.mocked(findDefinition).mockResolvedValue([])
    mount("const symbolName = 1")
    view.dispatch({ selection: { anchor: 8 } })
    goToDefinitionAtCursor()
    await Promise.resolve()
    expect(project.open).not.toHaveBeenCalled()
  })

  it("goToDefinitionAtCursor opens nothing when the lookup fails", async () => {
    vi.mocked(findDefinition).mockRejectedValue(new Error("no index"))
    mount("const symbolName = 1")
    view.dispatch({ selection: { anchor: 8 } })
    goToDefinitionAtCursor()
    await vi.waitFor(() => expect(findDefinition).toHaveBeenCalled())
    expect(project.open).not.toHaveBeenCalled()
  })

  it("findReferencesAtCursor searches nothing off a word", () => {
    mount("   ")
    findReferencesAtCursor()
    expect(searchFor).not.toHaveBeenCalled()
  })

  it("openFind is a no-op with no editor open", () => {
    expect(() => openFind()).not.toThrow()
  })

  it("gotoLastEdit is a no-op with no editor open", () => {
    expect(() => gotoLastEdit()).not.toThrow()
  })

  it("addCursorsToLineEnds puts one cursor per selection when none spans lines", () => {
    mount("alpha\nbeta\n")
    view.dispatch({ selection: { anchor: 2 } })
    addCursorsToLineEnds()
    expect(view.state.selection.ranges).toHaveLength(1)
  })

  it("saveAs does nothing with no project open", async () => {
    project.root = ""
    mount("body")
    await saveAs()
    expect(prompt).not.toHaveBeenCalled()
  })

  it("saveAs offers an empty default when no file is open", async () => {
    project.active = null
    vi.mocked(prompt).mockResolvedValue(null)
    mount("body")
    await saveAs()
    expect(vi.mocked(prompt).mock.calls[0][0]).toMatchObject({ value: "" })
  })

  it("saveAs survives a create or write that fails", async () => {
    vi.mocked(prompt).mockResolvedValue("src/copy.ts")
    vi.mocked(createFile).mockRejectedValue(new Error("exists"))
    vi.mocked(writeFile).mockRejectedValue(new Error("readonly"))
    mount("body")
    await expect(saveAs()).resolves.toBeUndefined()
    expect(project.open).toHaveBeenCalled()
  })

  it("revertFile does nothing with no file open", () => {
    project.active = null
    mount("edited")
    revertFile()
    expect(readFile).not.toHaveBeenCalled()
  })

  it("revertFile leaves the buffer alone when the file can't be read", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("gone"))
    mount("edited")
    revertFile()
    await vi.waitFor(() => expect(readFile).toHaveBeenCalled())
    expect(view.state.doc.toString()).toBe("edited")
    expect(setDirty).not.toHaveBeenCalled()
  })

  it("convertEol does nothing with no file open", () => {
    project.active = null
    mount("a\nb")
    convertEol("CRLF")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("saveDocument does nothing with no editor", () => {
    saveDocument()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("formatDocument returns the formatter's own reason when it fails", async () => {
    vi.mocked(formatFile).mockRejectedValue(new Error("prettier not found"))
    mount("unformatted\n")
    await expect(formatDocument()).resolves.toContain("prettier not found")
    expect(view.state.doc.toString()).toBe("unformatted\n")
  })
})

import {
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  indentSelection,
  moveLineDown,
  moveLineUp,
  redo,
  redoSelection,
  toggleBlockComment,
  toggleComment,
  undo,
  undoSelection,
} from "@codemirror/commands"
import { foldAll, unfoldAll } from "@codemirror/language"
import { forEachDiagnostic } from "@codemirror/lint"
import {
  gotoLine,
  openSearchPanel,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search"
import { EditorSelection } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { t } from "@/i18n"
import { findDefinition } from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { toRelative } from "@/lib/comments"
import {
  convertIndentation,
  cursorsToLineEnds,
  deleteDuplicateLines,
  duplicateSelectionCmd,
  joinLines,
  lowerCase,
  sortLines,
  titleCase,
  trimTrailingWhitespace,
  upperCase,
} from "@/lib/editorCommands"
import { foldToLevel } from "@/lib/foldLevels"
import { type HierDir, useHierarchy } from "@/lib/hierarchy"
import {
  lspCalls,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspTypes,
} from "@/lib/lsp"
import { prompt } from "@/lib/prompt"
import { useQa } from "@/lib/qa"
import { SAVED_BASE, useEditorActions, useProject, useWorkspace } from "@/lib/store"
import { expandSelection, shrinkSelection } from "@/lib/syntaxSelection"
import { useDocInfo } from "./docInfo"

/** Move the editor cursor to (and reveal) a 1-based line number. */
export function goToLine(n: number): void {
  const { view } = useDocInfo.getState()
  if (!view) return
  const lineNo = Math.max(1, Math.min(n, view.state.doc.lines))
  const line = view.state.doc.line(lineNo)
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  })
  view.focus()
}

/**
 * "Compare with Saved": diff the live buffer against the bytes on disk.
 *
 * The buffer has to be captured *here* — switching to the diff unmounts the code
 * view, and with it the only copy of the unsaved text.
 */
export function compareWithSaved(): void {
  const { view } = useDocInfo.getState()
  if (!view || !useProject.getState().active) return
  const actions = useEditorActions.getState()
  actions.setCompareBuffer(view.state.doc.toString())
  actions.setDiffBase(SAVED_BASE)
  actions.setDiffing(true)
}

/** The active editor's selected text, trimmed to a single line, or "" — what a
 *  find command seeds its query with. */
export function selectionText(): string {
  const view = useDocInfo.getState().view
  if (!view) return ""
  const { from, to } = view.state.selection.main
  if (from === to) return ""
  return view.state.sliceDoc(from, to).split("\n")[0].trim()
}

/** Open the editor's find panel (⌘F, via the native menu Edit ▸ Find). */
export function openFind(): void {
  const { view } = useDocInfo.getState()
  // No `view.focus()` after: pressing ⌘F means "type a query", and the panel puts
  // the caret in its own field — focusing the editor here would snatch it back.
  if (view) openSearchPanel(view)
}

/** Jump to the definition of the symbol at the cursor (native menu Go ▸ …). */
export function goToDefinitionAtCursor(): void {
  const { view } = useDocInfo.getState()
  if (!view) return
  const word = view.state.wordAt(view.state.selection.main.head)
  if (!word) return
  const name = view.state.doc.sliceString(word.from, word.to)
  findDefinition(useProject.getState().root, name)
    .then((defs) => {
      if (defs.length) useProject.getState().open(defs[0].path, defs[0].line)
    })
    .catch(() => {})
}

/** Run a CodeMirror command on the active editor view (native-menu commands). */
function runOnView(cmd: (v: EditorView) => boolean): void {
  const { view } = useDocInfo.getState()
  if (!view) return
  cmd(view)
  view.focus()
}

// Undo/redo run the editor's own history. ⌘Z reaches the editor directly (the
// menu items deliberately carry no accelerator — see `menu.rs`); these are for
// the menu itself, and for the in-app menu bar on Windows and Linux.
export const undoEdit = () => runOnView(undo)
export const redoEdit = () => runOnView(redo)

export const toggleLineComment = () => runOnView(toggleComment)
export const toggleBlockCommentCmd = () => runOnView(toggleBlockComment)
export const addNextOccurrence = () => runOnView(selectNextOccurrence)
export const selectAllOccurrences = () => runOnView(selectSelectionMatches)

/** Add a cursor one line above/below each current cursor (multi-cursor). The
 *  editor binds it to the column-selection keys; the menu wraps it below. */
export function addCursorVertical(dir: -1 | 1) {
  return (view: EditorView): boolean => {
    const { state } = view
    const extra = []
    for (const r of state.selection.ranges) {
      const line = state.doc.lineAt(r.head)
      const col = r.head - line.from
      const n = line.number + dir
      if (n >= 1 && n <= state.doc.lines) {
        const tl = state.doc.line(n)
        extra.push(EditorSelection.cursor(Math.min(tl.from + col, tl.to)))
      }
    }
    if (!extra.length) return false
    view.dispatch({ selection: EditorSelection.create([...state.selection.ranges, ...extra]) })
    return true
  }
}
export const addCursorAbove = () => runOnView(addCursorVertical(-1))
export const addCursorBelow = () => runOnView(addCursorVertical(1))

/** Move each cursor to the matching bracket (Go to Bracket). */
export const goToBracket = () => runOnView(cursorMatchingBracket)

/** Expand / shrink the selection along the syntax tree. */
export const expandSelectionCmd = () => runOnView(expandSelection)
export const shrinkSelectionCmd = () => runOnView(shrinkSelection)

/** Fetch the current direction's children for the hierarchy root and store them. */
function loadHierarchyChildren(direction: HierDir) {
  const { view } = useDocInfo.getState()
  const { root, mode } = useHierarchy.getState()
  if (!view || !root) return
  useHierarchy.getState().set({ direction, loading: true })
  const p =
    mode === "call"
      ? lspCalls(view, root.item, direction === "outgoing" ? "outgoing" : "incoming")
      : lspTypes(view, root.item, direction === "sub" ? "sub" : "super")
  ;(p ?? Promise.resolve([])).then((res) =>
    useHierarchy.getState().set({ results: res ?? [], loading: false }),
  )
}

/** Re-fetch the hierarchy in a new direction (panel toggle). */
export const setHierarchyDirection = (direction: HierDir) => loadHierarchyChildren(direction)

/** Show the call or type hierarchy for the symbol at the cursor (server-backed). */
function showHierarchy(mode: "call" | "type") {
  const { view } = useDocInfo.getState()
  if (!view) return
  const pos = view.state.selection.main.head
  const prep =
    mode === "call" ? lspPrepareCallHierarchy(view, pos) : lspPrepareTypeHierarchy(view, pos)
  const dir: HierDir = mode === "call" ? "incoming" : "sub"
  useHierarchy.getState().set({
    mode,
    direction: dir,
    root: null,
    results: [],
    loading: true,
    unsupported: false,
  })
  // Force-open the panel so the user sees progress / the result.
  useWorkspace.setState({ tool: "hierarchy", lastTool: "hierarchy" })
  if (!prep) {
    useHierarchy.getState().set({ loading: false, unsupported: true })
    return
  }
  void prep.then((items) => {
    const root = items?.[0] ?? null
    if (!root) {
      useHierarchy.getState().set({ loading: false, unsupported: true })
      return
    }
    useHierarchy.getState().set({ root })
    loadHierarchyChildren(dir)
  })
}

export const showCallHierarchy = () => showHierarchy("call")
export const showTypeHierarchy = () => showHierarchy("type")

/** Ask the AI a question about the current selection; the answer is saved as a
 *  durable anchored note (generated via the terminal agent). */
export async function askAboutSelection() {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  const sel = view.state.selection.main
  const doc = view.state.doc
  const from = doc.lineAt(sel.from).number
  const to = doc.lineAt(sel.to).number
  const question = await prompt({
    title: t("qa.title"),
    placeholder: t("qa.placeholder"),
    confirmLabel: t("qa.ask"),
  })
  if (question) useQa.getState().ask(toRelative(root, active), from, to, question)
}

/** Toggle a reading bookmark on the cursor's line. */
export const toggleBookmarkAtCursor = () =>
  runOnView((view) => {
    const { root, active } = useProject.getState()
    if (!active) return false
    const line = view.state.doc.lineAt(view.state.selection.main.head).number
    const snippet = view.state.doc.line(line).text.trim().slice(0, 120)
    useBookmarks.getState().toggle(root, { path: toRelative(root, active), line, snippet })
    return true
  })

/** Replace each multi-line selection with a cursor at the end of every spanned
 *  line (VS Code's "Add Cursors to Line Ends"). */
export const addCursorsToLineEnds = () => runOnView(cursorsToLineEnds)

// Last edit location: the editor records where the document last changed, so the
// reader can jump back to it after navigating away.
let lastEditPos: number | null = null
export const setLastEdit = (pos: number) => {
  lastEditPos = pos
}
export const gotoLastEdit = () =>
  runOnView((view) => {
    if (lastEditPos === null) return false
    const pos = Math.min(lastEditPos, view.state.doc.length)
    view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true })
    return true
  })

/** Duplicate each non-empty selection in place (after itself). */
export const duplicateSelection = () => runOnView(duplicateSelectionCmd)

/** Go to the type definition / implementation of the symbol at the cursor (LSP). */
export function goToTypeDefinitionAtCursor(): void {
  const { view } = useDocInfo.getState()
  if (view)
    lspLocate(view, view.state.selection.main.head, "typeDefinition", (p, l) =>
      useProject.getState().open(p, l),
    )
}
export function goToImplementationAtCursor(): void {
  const { view } = useDocInfo.getState()
  if (view)
    lspLocate(view, view.state.selection.main.head, "implementation", (p, l) =>
      useProject.getState().open(p, l),
    )
}

/** Move the cursor to the next/previous diagnostic in the active file. */
function jumpProblem(dir: 1 | -1): void {
  const { view } = useDocInfo.getState()
  if (!view) return
  const at: number[] = []
  forEachDiagnostic(view.state, (_d, from) => at.push(from))
  if (!at.length) return
  at.sort((a, b) => a - b)
  const cur = view.state.selection.main.head
  const target =
    dir > 0
      ? (at.find((p) => p > cur) ?? at[0])
      : ([...at].reverse().find((p) => p < cur) ?? at[at.length - 1])
  view.dispatch({
    selection: { anchor: target },
    effects: EditorView.scrollIntoView(target, { y: "center" }),
  })
  view.focus()
}
export const nextProblem = () => jumpProblem(1)
export const prevProblem = () => jumpProblem(-1)

export const copyLineUpCmd = () => runOnView(copyLineUp)
export const copyLineDownCmd = () => runOnView(copyLineDown)
export const moveLineUpCmd = () => runOnView(moveLineUp)
export const moveLineDownCmd = () => runOnView(moveLineDown)
/**
 * Go to Line, without stacking panels.
 *
 * CodeMirror's own `gotoLine` opens a fresh dialog every time it is called and
 * never looks for one already on screen, so pressing the key (or picking the
 * menu item) twice left two identical "Go to line" panels, each needing its own
 * dismissal. Asking again for something already open should take you to it.
 */
export const gotoLineOnce = (view: EditorView): boolean => {
  const open = view.dom.querySelector<HTMLInputElement>('.cm-panel input[name="line"]')
  if (open) {
    open.focus()
    open.select()
    return true
  }
  return gotoLine(view)
}

export const openGotoLine = () => runOnView(gotoLineOnce)
export const openReplace = () => openFind() // CM's search panel includes replace

/** Find references: project-wide search for the identifier at the cursor. */
export function findReferencesAtCursor(): void {
  const { view } = useDocInfo.getState()
  if (!view) return
  const word = view.state.wordAt(view.state.selection.main.head)
  if (!word) return
  const name = view.state.doc.sliceString(word.from, word.to)
  if (name) useWorkspace.getState().searchFor(name)
}

/** Text transforms (Selection menu / palette). Each acts on the selection, or
 *  on the caret's line when there is none. */
export const upperCaseCmd = () => runOnView(upperCase)
export const lowerCaseCmd = () => runOnView(lowerCase)
export const titleCaseCmd = () => runOnView(titleCase)
export const sortLinesAsc = () => runOnView(sortLines(1))
export const sortLinesDesc = () => runOnView(sortLines(-1))
export const deleteDuplicateLinesCmd = () => runOnView(deleteDuplicateLines)
export const joinLinesCmd = () => runOnView(joinLines)
export const trimWhitespaceCmd = () => runOnView(trimTrailingWhitespace)
export const reindentLines = () => runOnView(indentSelection)
export const foldAllCmd = () => runOnView(foldAll)
export const unfoldAllCmd = () => runOnView(unfoldAll)
/** Fold the active document down to `level` (⌘K ⌘1…⌘9). */
export const foldLevel = (level: number) => runOnView(foldToLevel(level))

/** Undo/redo the *cursor*, not the edit — the way back from one ⌘D too many. */
export const cursorUndo = () => runOnView(undoSelection)
export const cursorRedo = () => runOnView(redoSelection)

/** Rewrite the whole document's leading whitespace as tabs or spaces, and make
 *  the status bar agree — the picker there sets what gets *inserted*, this
 *  converts what is already on the page. */
export function convertIndentationTo(to: "spaces" | "tabs"): void {
  const { view, indentSize } = useDocInfo.getState()
  if (!view) return
  convertIndentation(view, to, indentSize)
  useDocInfo.getState().set({ indentKind: to })
}

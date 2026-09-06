/**
 * Per-document info shown in the status bar (line endings, indentation,
 * language) plus the active editor view, so the status bar can run commands
 * (go to line, convert line endings) without being coupled to CodeMirror.
 *
 * The CodeMirror document is always `\n`-normalised internally, so line endings
 * are detected from the *raw* file text and applied on write.
 */

import {
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  moveLineDown,
  moveLineUp,
  toggleBlockComment,
  toggleComment,
} from "@codemirror/commands"
import { forEachDiagnostic } from "@codemirror/lint"
import {
  gotoLine,
  openSearchPanel,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search"
import { EditorSelection } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { create } from "zustand"
import { t } from "@/i18n"
import { createFile, findDefinition, formatFile, formatterStatus, readFile, writeFile } from "./api"
import { useBookmarks } from "./bookmarks"
import { toRelative } from "./comments"
import { FORMATTERS, useExtensions } from "./extensions"
import { choiceFor, extOf } from "./formatters"
import { type HierDir, useHierarchy } from "./hierarchy"
import {
  lspCalls,
  lspFormat,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspTypes,
} from "./lsp"
import { notify } from "./notice"
import { prompt } from "./prompt"
import { useQa } from "./qa"
import { noteSelfWrite } from "./readProgress"
import { useEditorActions, useProject, useSettings, useWorkspace } from "./store"
import { expandSelection, shrinkSelection } from "./syntaxSelection"

export type Eol = "LF" | "CRLF"

interface DocInfoState {
  eol: Eol
  indentKind: "spaces" | "tabs"
  indentSize: number
  language: string
  /** A manual language-mode override (by display name), or null to auto-detect. */
  languageOverride: string | null
  /** The focused editor's view, for status-bar commands. Null when no file. */
  view: EditorView | null
  set: (info: Partial<Omit<DocInfoState, "set">>) => void
}

export const useDocInfo = create<DocInfoState>((set) => ({
  eol: "LF",
  indentKind: "spaces",
  indentSize: 2,
  language: "",
  languageOverride: null,
  view: null,
  set: (info) => set(info),
}))

/** Language modes offered by the status-bar picker (must match lib/languages). */
export const LANGUAGE_OPTIONS = [
  "Plain Text",
  "TypeScript",
  "JavaScript",
  "JSON",
  "Rust",
  "Python",
  "Go",
  "Solidity",
  "Markdown",
  "HTML",
  "CSS",
  "Shell",
  "YAML",
  "C++",
  "Java",
]

/** Detect line endings from raw file text (before CodeMirror normalises them). */
export function detectEol(text: string): Eol {
  return text.includes("\r\n") ? "CRLF" : "LF"
}

/** Best-guess indentation unit from a sample of the file's leading whitespace. */
export function detectIndent(text: string): { kind: "spaces" | "tabs"; size: number } {
  const lines = text.split("\n").slice(0, 200)
  let tabs = 0
  let spaced = 0
  let minSpace = Infinity
  for (const line of lines) {
    if (/^\t/.test(line)) {
      tabs++
    } else {
      const m = line.match(/^( +)\S/)
      if (m) {
        spaced++
        minSpace = Math.min(minSpace, m[1].length)
      }
    }
  }
  if (tabs > spaced) return { kind: "tabs", size: 4 }
  return { kind: "spaces", size: Number.isFinite(minSpace) ? minSpace : 2 }
}

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

/** What a format attempt did. `none` — the project declares no formatter for
 *  this file, which is a normal outcome and not an error. `stale` — the buffer
 *  moved on while the formatter was working, so the result was dropped. */
export type FormatOutcome =
  // `ok` covers formatted and stale alike: both mean "say nothing". The
  // formatter's name is only carried where it gets spoken.
  | { kind: "ok" }
  | { kind: "unchanged"; formatter: string }
  | { kind: "none" }
  | { kind: "disabled" }
  | { kind: "error"; message: string }

/**
 * The one change that turns `a` into `b`, with their common prefix and suffix
 * trimmed off.
 *
 * Replacing the whole document instead — which is what this used to do — drops
 * the cursor and the scroll position on every format. Tolerable for a command
 * the user invokes; not tolerable once formatting runs on every save.
 */
function minimalChange(a: string, b: string) {
  const max = Math.min(a.length, b.length)
  let start = 0
  while (start < max && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return { from: start, to: endA, insert: b.slice(start, endB) }
}

/**
 * Format the active document in place, quietly.
 *
 * The language server goes first when it offers formatting: it uses the
 * project's own rustfmt / gofmt / rubocop configuration, which a command-line
 * candidate can only approximate. Otherwise Reado runs a formatter this project
 * declares — never one that merely happens to be installed.
 */
export async function formatBuffer(): Promise<FormatOutcome> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return { kind: "none" }

  const rel = toRelative(root, active)
  const choice = choiceFor(root, rel)
  if (choice.kind === "off") return { kind: "disabled" }

  // A pinned formatter outranks the server: the point of pinning is to say
  // "this one, here", and a server quietly winning would defeat it.
  if (choice.kind === "detect") {
    const viaServer = await lspFormat(view)
    if (viaServer)
      return viaServer === "formatted"
        ? { kind: "ok" }
        : { kind: "unchanged", formatter: t("editor.formatViaServer") }
  }

  const pinned = choice.kind === "pinned" ? choice.id : await firstEnabled(root, rel)
  if (pinned === "none") return { kind: "none" }

  const before = view.state.doc
  const content = before.toString()
  try {
    const res = await formatFile(root, rel, content, pinned)
    if (!res.formatter) return { kind: "none" }
    // The user kept typing while the formatter ran. Its text describes a
    // document that no longer exists, so it is dropped rather than applied.
    if (view.state.doc !== before) return { kind: "ok" }
    if (!res.changed) return { kind: "unchanged", formatter: res.formatter }
    view.dispatch({ changes: minimalChange(content, res.text) })
    return { kind: "ok" }
  } catch (e) {
    return { kind: "error", message: String(e) }
  }
}

/**
 * The formatter detection should land on, honouring the marketplace's
 * enable/disable state.
 *
 * `null` means "let the backend detect" — the common case, and free. Only when
 * the user has actually disabled a formatter does Reado ask which ones this
 * project declares, so it can skip past the disabled one. `"none"` means every
 * formatter this project declares for the file type is disabled.
 */
async function firstEnabled(root: string, rel: string): Promise<string | null | "none"> {
  const isEnabled = useExtensions.getState().isEnabled
  if (FORMATTERS.every((f) => isEnabled(f.id))) return null
  const ext = extOf(rel)
  try {
    const status = await formatterStatus(root)
    const usable = status.filter((s) => s.exts.includes(ext) && s.declared)
    if (usable.length === 0) return null // nothing declared; let the backend say so
    return usable.find((s) => isEnabled(s.id))?.id ?? "none"
  } catch {
    return null
  }
}

/** Format Document (palette, menu, Shift+Alt+F): formats the active buffer and
 *  reports what happened, so an unformattable file never looks like a no-op. */
export async function formatDocument(): Promise<FormatOutcome> {
  const outcome = await formatBuffer()
  if (outcome.kind === "error") notify("error", outcome.message)
  else if (outcome.kind === "none") notify("info", t("editor.formatNone"))
  else if (outcome.kind === "disabled") notify("info", t("editor.formatDisabled"))
  else if (outcome.kind === "unchanged")
    notify("info", t("editor.formatUnchanged", { name: outcome.formatter }))
  return outcome
}

/**
 * The text to write for the active buffer: format on save when enabled, then
 * the hygiene toggles over the result so the two never fight.
 *
 * Shared by both save paths (⌘S in the editor, File ▸ Save in the native menu),
 * which otherwise drift — the menu used to skip the hygiene toggles entirely.
 */
export async function textToSave(view: EditorView): Promise<string> {
  const s = useSettings.getState()
  if (s.formatOnSave) {
    // A failing formatter must never cost the user their save: report it and
    // write what they have.
    const outcome = await formatBuffer()
    if (outcome.kind === "error") notify("error", outcome.message)
  }
  let text = view.state.doc.toString()
  if (s.trimTrailingWhitespace) text = text.replace(/[ \t]+$/gm, "")
  if (s.insertFinalNewline && text.length > 0 && !text.endsWith("\n")) text += "\n"
  return text
}

/** Save the active document to disk (used by the native menu's File ▸ Save). */
export async function saveDocument(): Promise<void> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  const text = await textToSave(view)
  noteSelfWrite(toRelative(root, active))
  writeFile(root, toRelative(root, active), text)
    .then(() => useEditorActions.getState().setDirty(false))
    .catch(() => {})
}

/** Open the editor's find panel (native menu Edit ▸ Find). */
export function openFind(): void {
  const { view } = useDocInfo.getState()
  if (view) {
    openSearchPanel(view)
    view.focus()
  }
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

export const toggleLineComment = () => runOnView(toggleComment)
export const toggleBlockCommentCmd = () => runOnView(toggleBlockComment)
export const addNextOccurrence = () => runOnView(selectNextOccurrence)
export const selectAllOccurrences = () => runOnView(selectSelectionMatches)

/** Add a cursor one line above/below each current cursor (multi-cursor). */
function addCursorVertical(dir: -1 | 1) {
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
export const addCursorsToLineEnds = () =>
  runOnView((view) => {
    const { state } = view
    const cursors = []
    for (const r of state.selection.ranges) {
      const first = state.doc.lineAt(r.from).number
      const last = state.doc.lineAt(r.to).number
      if (last > first) {
        for (let n = first; n <= last; n++)
          cursors.push(EditorSelection.cursor(state.doc.line(n).to))
      } else {
        cursors.push(EditorSelection.cursor(r.head))
      }
    }
    view.dispatch({ selection: EditorSelection.create(cursors) })
    return true
  })

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
export const duplicateSelection = () =>
  runOnView((view) => {
    const changes = view.state.selection.ranges
      .filter((r) => !r.empty)
      .map((r) => ({ from: r.to, insert: view.state.sliceDoc(r.from, r.to) }))
    if (!changes.length) return false
    view.dispatch({ changes })
    return true
  })

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

/** Prompt for a name and create a new empty file in the project, then open it. */
export async function newFile(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const name = await prompt({
    title: t("file.newFile"),
    placeholder: "path/name.ext",
    confirmLabel: t("file.create"),
  })
  if (!name) return
  try {
    const abs = await createFile(root, name)
    useProject.getState().open(abs)
    useProject.getState().bumpTree()
  } catch {
    /* already exists / invalid path */
  }
}

/** Prompt for a destination and write the active buffer there, then open it. */
export async function saveAs(): Promise<void> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !root) return
  const dest = await prompt({
    title: t("file.saveAs"),
    value: active ? toRelative(root, active) : "",
    confirmLabel: t("editor.save"),
  })
  if (!dest) return
  await createFile(root, dest).catch(() => {}) // ensure it exists (no-op if so)
  noteSelfWrite(dest)
  await writeFile(root, dest, view.state.doc.toString()).catch(() => {})
  useProject.getState().open(`${root}/${dest}`)
  useProject.getState().bumpTree()
}

/** Reload the active file from disk, discarding unsaved edits. */
export function revertFile(): void {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  readFile(root, active)
    .then((c) => {
      if (c.kind !== "text") return
      noteSelfWrite(toRelative(root, active))
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: c.text },
      })
      useEditorActions.getState().setDirty(false)
    })
    .catch(() => {})
}
export const copyLineUpCmd = () => runOnView(copyLineUp)
export const copyLineDownCmd = () => runOnView(copyLineDown)
export const moveLineUpCmd = () => runOnView(moveLineUp)
export const moveLineDownCmd = () => runOnView(moveLineDown)
export const openGotoLine = () => runOnView(gotoLine)
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

/** Rewrite the active file with the chosen line endings (applies + saves). */
export function convertEol(eol: Eol): void {
  const { view, set } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  const normalised = view.state.doc.toString().replace(/\r\n/g, "\n")
  const out = eol === "CRLF" ? normalised.replace(/\n/g, "\r\n") : normalised
  noteSelfWrite(toRelative(root, active))
  writeFile(root, toRelative(root, active), out)
    .then(() => {
      set({ eol })
      useEditorActions.getState().setDirty(false)
    })
    .catch(() => {})
}

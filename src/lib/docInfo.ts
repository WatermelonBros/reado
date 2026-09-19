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
import { create } from "zustand"
import { t } from "@/i18n"
import {
  createDir,
  createFile,
  type EditorConfig,
  findDefinition,
  formatFile,
  formatterStatus,
  readFile,
  writeFile,
} from "./api"
import { useBookmarks } from "./bookmarks"
import { toRelative } from "./comments"
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
} from "./editorCommands"
import { FORMATTERS, useExtensions } from "./extensions"
import { foldToLevel } from "./foldLevels"
import { choiceFor, extOf } from "./formatters"
import { type HierDir, useHierarchy } from "./hierarchy"
import {
  fileSaved,
  lspCalls,
  lspFormat,
  lspFormatRange,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspTypes,
} from "./lsp"
import { notify, notifyError } from "./notice"
import { prompt } from "./prompt"
import { useQa } from "./qa"
import { noteSelfWrite } from "./readProgress"
import { SAVED_BASE, useEditorActions, useProject, useSettings, useWorkspace } from "./store"
import { expandSelection, shrinkSelection } from "./syntaxSelection"
import { isUntitled, nextUntitledId, useUntitled } from "./untitled"

export type Eol = "LF" | "CRLF"

interface DocInfoState {
  eol: Eol
  /** The charset the focused file was decoded with (and will be written back
   *  as). Mirrored here from the view registry so the status bar can show it. */
  encoding: string
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
  encoding: "utf-8",
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

/**
 * Best-guess indentation unit from a sample of the file's leading whitespace.
 *
 * The unit is the **step** between one line's indent and the next's — not the
 * smallest indent in the file, which is what this used to read. Every file
 * carrying a block comment came out at one space, because ` * continues here` is
 * a line indented by one and one was then the answer for the whole document.
 *
 * So those continuation lines are skipped outright (they align a comment's
 * stars; they are not a level of anything), and what remains is tallied: the
 * most common step wins, and a tie goes to the smaller one, since the larger
 * steps in a file are multiples of its unit. A file with nothing to go on keeps
 * the two-space default rather than inventing a number from a single line.
 *
 * A guess, and only reached when the project does not say: `.editorconfig`
 * outranks this wherever one applies (see `CodeView`).
 */
export function detectIndent(text: string): { kind: "spaces" | "tabs"; size: number } {
  const lines = text.split("\n").slice(0, 200)
  let tabs = 0
  let spaced = 0
  const steps = new Map<number, number>()
  let prev = 0
  for (const line of lines) {
    // Nothing on it, or nothing but a comment's alignment star.
    if (!line.trim() || /^\s*\*/.test(line)) continue
    if (line.startsWith("\t")) {
      tabs++
      continue
    }
    const width = line.match(/^ */)?.[0].length ?? 0
    // Both directions: going out a level and coming back in say the same thing
    // about the unit, and a file that only ever unindents still has one.
    const step = Math.abs(width - prev)
    if (step > 0) steps.set(step, (steps.get(step) ?? 0) + 1)
    if (width > 0) spaced++
    prev = width
  }
  if (tabs > spaced) return { kind: "tabs", size: 4 }
  let size = 0
  let best = 0
  for (const [step, count] of steps) {
    if (count > best || (count === best && step < size)) {
      size = step
      best = count
    }
  }
  return { kind: "spaces", size: size || 2 }
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
  return applyEol(applyHygiene(view.state.doc.toString(), liveViews.get(view)?.rel), eolFor(view))
}

/**
 * The on-write hygiene toggles (trim trailing whitespace, final newline),
 * without the formatter. Shared with the close-flush, which cannot format: by
 * then the formatter's idea of "the active document" is the next file.
 *
 * `.editorconfig` outranks the reader's own settings when it speaks: the file is
 * the project's answer about its own files, and the whole point of committing it
 * is that everyone's editor obeys it.
 */
export function applyHygiene(text: string, rel?: string): string {
  const s = useSettings.getState()
  const ec = rel ? fileConfigs.get(rel) : undefined
  const trim = ec?.trimTrailingWhitespace ?? s.trimTrailingWhitespace
  const finalNewline = ec?.insertFinalNewline ?? s.insertFinalNewline
  if (trim) text = text.replace(/[ \t]+$/gm, "")
  if (finalNewline && text.length > 0 && !text.endsWith("\n")) text += "\n"
  return text
}

/**
 * Save the focused pane to disk — ⌘S, File ▸ Save, and the native menu.
 *
 * The path comes from the registry, not from `useProject.active`: with the
 * editor split, the focused view is often the *other* file, and pairing its
 * text with the primary tab's path wrote one buffer over another file.
 */
export async function saveDocument(): Promise<void> {
  const { view } = useDocInfo.getState()
  const entry = view && liveViews.get(view)
  if (!view || !entry) return
  const { rel, root } = entry
  // A buffer with no path cannot be written back to one: Save *is* Save As.
  if (isUntitled(rel)) return saveAs()
  const text = await textToSave(view)
  noteSelfWrite(rel)
  writeFile(root, rel, text, encodingFor(view))
    .then(() => {
      useEditorActions.getState().setDirty(rel, false)
      fileSaved(view) // the formatter may have rewritten it; re-ask the server
    })
    .catch((e) => notifyError("docInfo", t("editor.saveError"), e))
}

/**
 * Every mounted editor view, with the project-relative path it is editing.
 *
 * `useDocInfo.view` is the *focused* pane; Save All has to reach the split pane
 * too. Only the mounted panes can hold unsaved text at all — switching a tab
 * away unmounts its view and flushes it — so this set is the whole of it.
 */
const liveViews = new Map<
  EditorView,
  { rel: string; root: string; primary: boolean; eol: Eol; encoding?: string }
>()

/**
 * Register a mounted view.
 *
 * The folder is recorded with the view, not read from the store at save time:
 * with more than one folder open, "the project's root" is not the root this
 * buffer belongs to, and pairing one file's text with another folder's path is
 * how you overwrite the wrong file.
 */
export function registerView(
  view: EditorView,
  rel: string,
  root: string,
  primary: boolean,
  eol: Eol,
  encoding?: string,
): () => void {
  liveViews.set(view, { rel, root, primary, eol, encoding })
  return () => {
    liveViews.delete(view)
  }
}

/**
 * The charset a buffer should be written with: the one it was read as.
 *
 * A latin-1 file saved as UTF-8 is a whole-file diff and, for whoever else
 * reads it with the old tooling, mojibake.
 */
export const encodingFor = (view: EditorView): string | undefined => liveViews.get(view)?.encoding

/** Change the charset a file will be written with (the status-bar picker). */
export function setEncoding(view: EditorView, encoding: string): void {
  const entry = liveViews.get(view)
  if (entry) liveViews.set(view, { ...entry, encoding })
  // The registry is per view (the split pane can hold a file with a different
  // charset); the store field is what the status bar shows for the focused one.
  if (useDocInfo.getState().view === view) useDocInfo.getState().set({ encoding })
}

/**
 * Re-read the active file with a different encoding.
 *
 * Refused while there are unsaved edits: re-decoding replaces the buffer, and
 * doing that over pending work would throw it away without asking.
 */
export async function reopenWithEncoding(encoding: string): Promise<void> {
  const { view } = useDocInfo.getState()
  const rel = view && liveViews.get(view)?.rel
  const { root, active } = useProject.getState()
  if (!view || !rel || !active) return
  if (useEditorActions.getState().isDirty(rel)) {
    notify("info", t("status.encodingDirty"))
    return
  }
  try {
    const content = await readFile(root, active, true, 0, encoding)
    if (content.kind !== "text") {
      notify("error", t("status.encodingFailed", { name: encoding }))
      return
    }
    setEncoding(view, encoding)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content.text } })
    // Not a user edit: the buffer now matches the bytes on disk again.
    useEditorActions.getState().setDirty(rel, false)
    notify("info", t("status.encodingReopened", { name: encoding }))
  } catch (e) {
    notifyError("docInfo", t("status.encodingFailed", { name: encoding }), e)
  }
}

/**
 * The line endings a buffer should be written with.
 *
 * CodeMirror normalises every document to `\n` internally, so without this a
 * CRLF file came back out of Reado as LF — a whole-file diff on the next commit,
 * from opening it and pressing ⌘S. Registered per view (the split pane can hold
 * a file with different endings), and per *file*: the setting only decides what
 * a brand-new, empty document gets.
 */
export function eolFor(view: EditorView): Eol {
  const known = liveViews.get(view)?.eol
  if (known) return known
  const preferred = useSettings.getState().defaultEol
  if (preferred !== "auto") return preferred
  return /win/i.test(navigator.userAgent) ? "CRLF" : "LF"
}

/**
 * What `.editorconfig` says about each open file, by project-relative path.
 *
 * Kept next to the view registry because the save paths need it: a project that
 * says `trim_trailing_whitespace = true` means it for *its* files, whatever the
 * reader's own global preference is.
 */
const fileConfigs = new Map<string, EditorConfig>()

export function setEditorConfig(rel: string, config: EditorConfig | null): void {
  if (config?.applies) fileConfigs.set(rel, config)
  else fileConfigs.delete(rel)
}

export const editorConfigOf = (rel: string): EditorConfig | undefined => fileConfigs.get(rel)

/** Re-apply `eol` to a normalised (`\n`) document. */
export const applyEol = (text: string, eol: Eol): string =>
  eol === "CRLF" ? text.replace(/\n/g, "\r\n") : text

/** Move focus to the first (primary) or second (split) editor pane — ⌘1 / ⌘2.
 *  Returns false when that pane isn't open, so the caller can say so. */
export function focusPane(which: 1 | 2): boolean {
  for (const [view, { primary }] of liveViews) {
    if (primary === (which === 1)) {
      view.focus()
      useDocInfo.getState().set({ view })
      return true
    }
  }
  return false
}

/**
 * Save every pane with unsaved edits (⌥⌘S / File ▸ Save All).
 *
 * Only the focused pane goes through `textToSave`: format-on-save formats "the
 * active document", so running it for the other pane would format the wrong
 * buffer. The others get the hygiene toggles, exactly like the close-flush.
 */
export async function saveAll(): Promise<void> {
  const actions = useEditorActions.getState()
  const focused = useDocInfo.getState().view
  let count = 0
  for (const [view, { rel, root }] of liveViews) {
    if (!actions.isDirty(rel)) continue
    const text =
      view === focused
        ? await textToSave(view)
        : applyEol(applyHygiene(view.state.doc.toString(), rel), eolFor(view))
    noteSelfWrite(rel)
    try {
      await writeFile(root, rel, text, encodingFor(view))
      actions.setDirty(rel, false)
      count++
    } catch (e) {
      notifyError("docInfo", t("editor.saveError"), e)
    }
  }
  notify("info", t("editor.saveAllDone", { count }))
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

/**
 * Open an empty buffer with no path — the "open Reado and start typing" case.
 *
 * Deliberately asks for nothing: not a name, not a folder, not even a project.
 * Editing goes on so the caret is live the moment it opens; a read-first default
 * is right for someone else's code, not for a page you are writing yourself.
 */
export function newUntitled(): void {
  const id = nextUntitledId(useProject.getState().tabs)
  useUntitled.getState().setText(id, "")
  useEditorActions.getState().setEditing(true)
  useProject.getState().open(id)
}

/** Create a folder at a prompted, project-relative path. */
export async function newFolder(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const name = await prompt({
    title: t("tree.newFolder"),
    placeholder: "path/name",
    confirmLabel: t("file.create"),
  })
  if (!name) return
  try {
    await createDir(root, name)
    useProject.getState().bumpTree()
  } catch {
    /* already exists / invalid path */
  }
}

/** Prompt for a destination and write the active buffer there, then open it. */
export async function saveAs(): Promise<void> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view) return
  // The buffer being saved, which is the focused pane's — not `active`, which is
  // the *primary* pane's file and would name the wrong document in a split.
  const from = liveViews.get(view)?.rel ?? active ?? ""
  const scratch = isUntitled(from)
  if (!root) {
    // Every write is confined to an open folder, so there is nowhere to put it.
    notify("info", t("file.untitledNeedFolder"))
    return
  }
  const dest = await prompt({
    title: t("file.saveAs"),
    // A scratch buffer has no path to offer back as the default.
    value: scratch ? "" : active ? toRelative(root, active) : "",
    confirmLabel: t("editor.save"),
  })
  if (!dest) return
  await createFile(root, dest).catch(() => {}) // ensure it exists (no-op if so)
  noteSelfWrite(dest)
  // A copy of this buffer, not a re-encoding of it: the new file keeps the
  // endings and the charset the old one had.
  const rel = liveViews.get(view)?.rel
  const out = applyEol(applyHygiene(view.state.doc.toString(), rel), eolFor(view))
  await writeFile(root, dest, out, encodingFor(view)).catch(() => {})
  if (scratch) {
    // The buffer *becomes* the file: swap the tab where it stands, rather than
    // opening a second one beside the scratch tab it came from.
    useProject.getState().renamePath(from, `${root}/${dest}`)
    useEditorActions.getState().setDirty(from, false)
    useUntitled.getState().drop(from)
  } else {
    useProject.getState().open(`${root}/${dest}`)
  }
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
      useEditorActions.getState().setDirty(toRelative(root, active), false)
    })
    .catch(() => {})
}
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

/** Format Selection: the language server's range formatter. The project's own
 *  formatters run over whole files, so when no server can do it we say that
 *  rather than silently formatting the whole document. */
export async function formatSelection(): Promise<void> {
  const { view } = useDocInfo.getState()
  if (!view) return
  if (view.state.selection.main.empty) {
    notify("info", t("menu.needSelection"))
    return
  }
  const res = await lspFormatRange(view)
  if (res === null) notify("info", t("editor.formatNoRange"))
  else if (res === "unchanged")
    notify("info", t("editor.formatUnchanged", { name: t("editor.formatViaServer") }))
}

/** Rewrite the active file with the chosen line endings (applies + saves). */
export function convertEol(eol: Eol): void {
  const { view, set } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  const out = applyEol(view.state.doc.toString().replace(/\r\n/g, "\n"), eol)
  noteSelfWrite(toRelative(root, active))
  // Converting the endings must not also convert the charset.
  writeFile(root, toRelative(root, active), out, encodingFor(view))
    .then(() => {
      set({ eol })
      useEditorActions.getState().setDirty(toRelative(root, active), false)
    })
    .catch(() => {})
}

/**
 * Per-document info shown in the status bar (line endings, indentation,
 * language) plus the active editor view, so the status bar can run commands
 * (go to line, convert line endings) without being coupled to CodeMirror.
 *
 * The CodeMirror document is always `\n`-normalised internally, so line endings
 * are detected from the *raw* file text and applied on write.
 *
 * The commands that act on the active editor live beside it — `activeEditor`,
 * `save`, `liveViews` (the mounted-view registry) and `fileActions` — and are
 * re-exported here, so `@/lib/docInfo` stays the one import site.
 */

import type { EditorView } from "@codemirror/view"
import { create } from "zustand"

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

/** Re-apply `eol` to a normalised (`\n`) document. */
export const applyEol = (text: string, eol: Eol): string =>
  eol === "CRLF" ? text.replace(/\n/g, "\r\n") : text

export {
  addCursorAbove,
  addCursorBelow,
  addCursorsToLineEnds,
  addCursorVertical,
  addNextOccurrence,
  askAboutSelection,
  compareWithSaved,
  convertIndentationTo,
  copyLineDownCmd,
  copyLineUpCmd,
  cursorRedo,
  cursorUndo,
  deleteDuplicateLinesCmd,
  duplicateSelection,
  expandSelectionCmd,
  findReferencesAtCursor,
  foldAllCmd,
  foldLevel,
  goToBracket,
  goToDefinitionAtCursor,
  goToImplementationAtCursor,
  goToLine,
  goToTypeDefinitionAtCursor,
  gotoLastEdit,
  gotoLineOnce,
  joinLinesCmd,
  lowerCaseCmd,
  moveLineDownCmd,
  moveLineUpCmd,
  nextProblem,
  openFind,
  openGotoLine,
  openReplace,
  prevProblem,
  redoEdit,
  reindentLines,
  selectAllOccurrences,
  selectionText,
  setHierarchyDirection,
  setLastEdit,
  showCallHierarchy,
  showTypeHierarchy,
  shrinkSelectionCmd,
  sortLinesAsc,
  sortLinesDesc,
  titleCaseCmd,
  toggleBlockCommentCmd,
  toggleBookmarkAtCursor,
  toggleLineComment,
  trimWhitespaceCmd,
  undoEdit,
  unfoldAllCmd,
  upperCaseCmd,
} from "./activeEditor"
export { convertEol, newFile, newFolder, newUntitled, revertFile, saveAs } from "./fileActions"
export {
  editorConfigOf,
  encodingFor,
  eolFor,
  focusPane,
  registerView,
  reopenWithEncoding,
  setEditorConfig,
  setEncoding,
} from "./liveViews"
export {
  applyHygiene,
  type FormatOutcome,
  formatBuffer,
  formatDocument,
  formatSelection,
  saveAll,
  saveDocument,
  textToSave,
} from "./save"

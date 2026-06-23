/**
 * Per-document info shown in the status bar (line endings, indentation,
 * language) plus the active editor view, so the status bar can run commands
 * (go to line, convert line endings) without being coupled to CodeMirror.
 *
 * The CodeMirror document is always `\n`-normalised internally, so line endings
 * are detected from the *raw* file text and applied on write.
 */
import { create } from "zustand";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  openSearchPanel,
  selectNextOccurrence,
  selectSelectionMatches,
  gotoLine,
} from "@codemirror/search";
import {
  toggleComment,
  toggleBlockComment,
  copyLineUp,
  copyLineDown,
  moveLineUp,
  moveLineDown,
  cursorMatchingBracket,
} from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { writeFile, formatFile, findDefinition, readFile, createFile } from "./api";
import { useProject, useEditorActions, useWorkspace } from "./store";
import { toRelative } from "./comments";
import { noteSelfWrite } from "./readProgress";
import { lspLocate } from "./lsp";
import { expandSelection, shrinkSelection } from "./syntaxSelection";
import { prompt } from "./prompt";
import { t } from "../i18n";

export type Eol = "LF" | "CRLF";

interface DocInfoState {
  eol: Eol;
  indentKind: "spaces" | "tabs";
  indentSize: number;
  language: string;
  /** A manual language-mode override (by display name), or null to auto-detect. */
  languageOverride: string | null;
  /** The focused editor's view, for status-bar commands. Null when no file. */
  view: EditorView | null;
  set: (info: Partial<Omit<DocInfoState, "set">>) => void;
}

export const useDocInfo = create<DocInfoState>((set) => ({
  eol: "LF",
  indentKind: "spaces",
  indentSize: 2,
  language: "",
  languageOverride: null,
  view: null,
  set: (info) => set(info),
}));

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
];

/** Detect line endings from raw file text (before CodeMirror normalises them). */
export function detectEol(text: string): Eol {
  return text.includes("\r\n") ? "CRLF" : "LF";
}

/** Best-guess indentation unit from a sample of the file's leading whitespace. */
export function detectIndent(text: string): { kind: "spaces" | "tabs"; size: number } {
  const lines = text.split("\n").slice(0, 200);
  let tabs = 0;
  let spaced = 0;
  let minSpace = Infinity;
  for (const line of lines) {
    if (/^\t/.test(line)) {
      tabs++;
    } else {
      const m = line.match(/^( +)\S/);
      if (m) {
        spaced++;
        minSpace = Math.min(minSpace, m[1].length);
      }
    }
  }
  if (tabs > spaced) return { kind: "tabs", size: 4 };
  return { kind: "spaces", size: Number.isFinite(minSpace) ? minSpace : 2 };
}

/** Move the editor cursor to (and reveal) a 1-based line number. */
export function goToLine(n: number): void {
  const { view } = useDocInfo.getState();
  if (!view) return;
  const lineNo = Math.max(1, Math.min(n, view.state.doc.lines));
  const line = view.state.doc.line(lineNo);
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
  view.focus();
}

/** Format the active document with the project's formatter, applying the result
 *  to the buffer (the user still saves). Returns an error message on failure. */
export async function formatDocument(): Promise<string | null> {
  const { view } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !active) return null;
  const content = view.state.doc.toString();
  try {
    const formatted = await formatFile(root, toRelative(root, active), content);
    if (formatted && formatted !== content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
      });
    }
    return null;
  } catch (e) {
    return String(e);
  }
}

/** Save the active document to disk (used by the native menu's File ▸ Save). */
export function saveDocument(): void {
  const { view } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !active) return;
  noteSelfWrite(toRelative(root, active));
  writeFile(root, toRelative(root, active), view.state.doc.toString())
    .then(() => useEditorActions.getState().setDirty(false))
    .catch(() => {});
}

/** Open the editor's find panel (native menu Edit ▸ Find). */
export function openFind(): void {
  const { view } = useDocInfo.getState();
  if (view) {
    openSearchPanel(view);
    view.focus();
  }
}

/** Jump to the definition of the symbol at the cursor (native menu Go ▸ …). */
export function goToDefinitionAtCursor(): void {
  const { view } = useDocInfo.getState();
  if (!view) return;
  const word = view.state.wordAt(view.state.selection.main.head);
  if (!word) return;
  const name = view.state.doc.sliceString(word.from, word.to);
  findDefinition(useProject.getState().root, name)
    .then((defs) => {
      if (defs.length) useProject.getState().open(defs[0].path, defs[0].line);
    })
    .catch(() => {});
}

/** Run a CodeMirror command on the active editor view (native-menu commands). */
function runOnView(cmd: (v: EditorView) => boolean): void {
  const { view } = useDocInfo.getState();
  if (!view) return;
  cmd(view);
  view.focus();
}

export const toggleLineComment = () => runOnView(toggleComment);
export const toggleBlockCommentCmd = () => runOnView(toggleBlockComment);
export const addNextOccurrence = () => runOnView(selectNextOccurrence);
export const selectAllOccurrences = () => runOnView(selectSelectionMatches);

/** Add a cursor one line above/below each current cursor (multi-cursor). */
function addCursorVertical(dir: -1 | 1) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const extra = [];
    for (const r of state.selection.ranges) {
      const line = state.doc.lineAt(r.head);
      const col = r.head - line.from;
      const n = line.number + dir;
      if (n >= 1 && n <= state.doc.lines) {
        const tl = state.doc.line(n);
        extra.push(EditorSelection.cursor(Math.min(tl.from + col, tl.to)));
      }
    }
    if (!extra.length) return false;
    view.dispatch({ selection: EditorSelection.create([...state.selection.ranges, ...extra]) });
    return true;
  };
}
export const addCursorAbove = () => runOnView(addCursorVertical(-1));
export const addCursorBelow = () => runOnView(addCursorVertical(1));

/** Move each cursor to the matching bracket (Go to Bracket). */
export const goToBracket = () => runOnView(cursorMatchingBracket);

/** Expand / shrink the selection along the syntax tree. */
export const expandSelectionCmd = () => runOnView(expandSelection);
export const shrinkSelectionCmd = () => runOnView(shrinkSelection);

/** Replace each multi-line selection with a cursor at the end of every spanned
 *  line (VS Code's "Add Cursors to Line Ends"). */
export const addCursorsToLineEnds = () =>
  runOnView((view) => {
    const { state } = view;
    const cursors = [];
    for (const r of state.selection.ranges) {
      const first = state.doc.lineAt(r.from).number;
      const last = state.doc.lineAt(r.to).number;
      if (last > first) {
        for (let n = first; n <= last; n++) cursors.push(EditorSelection.cursor(state.doc.line(n).to));
      } else {
        cursors.push(EditorSelection.cursor(r.head));
      }
    }
    view.dispatch({ selection: EditorSelection.create(cursors) });
    return true;
  });

// Last edit location: the editor records where the document last changed, so the
// reader can jump back to it after navigating away.
let lastEditPos: number | null = null;
export const setLastEdit = (pos: number) => {
  lastEditPos = pos;
};
export const gotoLastEdit = () =>
  runOnView((view) => {
    if (lastEditPos === null) return false;
    const pos = Math.min(lastEditPos, view.state.doc.length);
    view.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true });
    return true;
  });

/** Duplicate each non-empty selection in place (after itself). */
export const duplicateSelection = () =>
  runOnView((view) => {
    const changes = view.state.selection.ranges
      .filter((r) => !r.empty)
      .map((r) => ({ from: r.to, insert: view.state.sliceDoc(r.from, r.to) }));
    if (!changes.length) return false;
    view.dispatch({ changes });
    return true;
  });

/** Go to the type definition / implementation of the symbol at the cursor (LSP). */
export function goToTypeDefinitionAtCursor(): void {
  const { view } = useDocInfo.getState();
  if (view) lspLocate(view, view.state.selection.main.head, "typeDefinition", (p, l) => useProject.getState().open(p, l));
}
export function goToImplementationAtCursor(): void {
  const { view } = useDocInfo.getState();
  if (view) lspLocate(view, view.state.selection.main.head, "implementation", (p, l) => useProject.getState().open(p, l));
}

/** Move the cursor to the next/previous diagnostic in the active file. */
function jumpProblem(dir: 1 | -1): void {
  const { view } = useDocInfo.getState();
  if (!view) return;
  const at: number[] = [];
  forEachDiagnostic(view.state, (_d, from) => at.push(from));
  if (!at.length) return;
  at.sort((a, b) => a - b);
  const cur = view.state.selection.main.head;
  const target =
    dir > 0
      ? (at.find((p) => p > cur) ?? at[0])
      : ([...at].reverse().find((p) => p < cur) ?? at[at.length - 1]);
  view.dispatch({
    selection: { anchor: target },
    effects: EditorView.scrollIntoView(target, { y: "center" }),
  });
  view.focus();
}
export const nextProblem = () => jumpProblem(1);
export const prevProblem = () => jumpProblem(-1);

/** Prompt for a name and create a new empty file in the project, then open it. */
export async function newFile(): Promise<void> {
  const root = useProject.getState().root;
  if (!root) return;
  const name = await prompt({
    title: t("file.newFile"),
    placeholder: "path/name.ext",
    confirmLabel: t("file.create"),
  });
  if (!name) return;
  try {
    const abs = await createFile(root, name);
    useProject.getState().open(abs);
    useProject.getState().bumpTree();
  } catch {
    /* already exists / invalid path */
  }
}

/** Prompt for a destination and write the active buffer there, then open it. */
export async function saveAs(): Promise<void> {
  const { view } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !root) return;
  const dest = await prompt({
    title: t("file.saveAs"),
    value: active ? toRelative(root, active) : "",
    confirmLabel: t("editor.save"),
  });
  if (!dest) return;
  await createFile(root, dest).catch(() => {}); // ensure it exists (no-op if so)
  noteSelfWrite(dest);
  await writeFile(root, dest, view.state.doc.toString()).catch(() => {});
  useProject.getState().open(`${root}/${dest}`);
  useProject.getState().bumpTree();
}

/** Reload the active file from disk, discarding unsaved edits. */
export function revertFile(): void {
  const { view } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !active) return;
  readFile(root, active)
    .then((c) => {
      if (c.kind !== "text") return;
      noteSelfWrite(toRelative(root, active));
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: c.text },
      });
      useEditorActions.getState().setDirty(false);
    })
    .catch(() => {});
}
export const copyLineUpCmd = () => runOnView(copyLineUp);
export const copyLineDownCmd = () => runOnView(copyLineDown);
export const moveLineUpCmd = () => runOnView(moveLineUp);
export const moveLineDownCmd = () => runOnView(moveLineDown);
export const openGotoLine = () => runOnView(gotoLine);
export const openReplace = () => openFind(); // CM's search panel includes replace

/** Find references: project-wide search for the identifier at the cursor. */
export function findReferencesAtCursor(): void {
  const { view } = useDocInfo.getState();
  if (!view) return;
  const word = view.state.wordAt(view.state.selection.main.head);
  if (!word) return;
  const name = view.state.doc.sliceString(word.from, word.to);
  if (name) useWorkspace.getState().searchFor(name);
}

/** Rewrite the active file with the chosen line endings (applies + saves). */
export function convertEol(eol: Eol): void {
  const { view, set } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !active) return;
  const normalised = view.state.doc.toString().replace(/\r\n/g, "\n");
  const out = eol === "CRLF" ? normalised.replace(/\n/g, "\r\n") : normalised;
  noteSelfWrite(toRelative(root, active));
  writeFile(root, toRelative(root, active), out)
    .then(() => {
      set({ eol });
      useEditorActions.getState().setDirty(false);
    })
    .catch(() => {});
}

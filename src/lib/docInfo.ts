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
import { openSearchPanel } from "@codemirror/search";
import { writeFile, formatFile, findDefinition } from "./api";
import { useProject, useEditorActions } from "./store";
import { toRelative } from "./comments";

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

/** Language modes offered by the status-bar picker (must match language-data). */
export const LANGUAGE_OPTIONS = [
  "Plain Text",
  "TypeScript",
  "JavaScript",
  "JSON",
  "Rust",
  "Python",
  "Go",
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

/** Rewrite the active file with the chosen line endings (applies + saves). */
export function convertEol(eol: Eol): void {
  const { view, set } = useDocInfo.getState();
  const { root, active } = useProject.getState();
  if (!view || !active) return;
  const normalised = view.state.doc.toString().replace(/\r\n/g, "\n");
  const out = eol === "CRLF" ? normalised.replace(/\n/g, "\r\n") : normalised;
  writeFile(root, toRelative(root, active), out)
    .then(() => {
      set({ eol });
      useEditorActions.getState().setDirty(false);
    })
    .catch(() => {});
}

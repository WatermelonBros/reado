import { type MutableRefObject } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightSpecialChars,
  highlightWhitespace,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  keymap,
} from "@codemirror/view";
import { foldGutter, bracketMatching, foldKeymap } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap, gotoLine, highlightSelectionMatches } from "@codemirror/search";
import { occurrenceHighlight } from "../../../lib/occurrenceHighlight";
import { syntaxSelection, expandSelection, shrinkSelection } from "../../../lib/syntaxSelection";
import { type CommentType } from "../../../lib/api";
import { readoAppearance } from "../../../lib/codemirror";
import { diagnosticsRuler } from "../../../lib/overviewRuler";
import { commentGutter, type LineComments } from "../../../lib/commentGutter";
import { bookmarkGutter } from "../../../lib/bookmarkGutter";
import { changedLinesHighlight } from "../../../lib/changedLines";
import { readoSearchPanel } from "../../../lib/searchPanel";
import { taskFromDiagnostic, explainSymbolAt } from "../../../lib/lspActions";
import { useDocInfo, setLastEdit } from "../../../lib/docInfo";
import {
  useCursor,
  useEditorActions,
  useProject,
  useSessions,
  useSettings,
} from "../../../lib/store";
import {
  lineNumbersExt,
  activeLineExt,
  indentGuidesExt,
  rulerExt,
  focusExtension,
  editableExtension,
  landingField,
  blockField,
  linkField,
  filePathFacet,
  gotoDefinitionHandlers,
  goToDefinitionAt,
  goToImplementationAt,
  findReferencesAt,
  ExternalReload,
} from "./extensions";

/** Everything the CodeMirror extensions array references that is not a
 *  top-level import: the compartments, the initial modes/flags it reads, the
 *  per-file data, the timer refs the updateListener drives, and the callbacks
 *  the array invokes. Kept as a single ctx so the array can move out of the
 *  "create the editor once per file" effect verbatim. */
export interface CodeExtensionsCtx {
  // Compartments.
  lineNumbersComp: Compartment;
  activeLineComp: Compartment;
  bracketComp: Compartment;
  rulerComp: Compartment;
  indentGuidesComp: Compartment;
  gutterComp: Compartment;
  changedComp: Compartment;
  bookmarkComp: Compartment;
  blameComp: Compartment;
  lspComp: Compartment;
  tabSizeComp: Compartment;
  wrapComp: Compartment;
  whitespaceComp: Compartment;
  focusComp: Compartment;
  langComp: Compartment;
  // Initial modes / flags read to seed the compartments.
  lineNumbersMode: "off" | "on" | "relative";
  activeLineMode: "off" | "gutter" | "line" | "both";
  bracketMatchingOn: boolean;
  rulerColumn: number;
  indentGuidesMode: "off" | "all" | "active";
  wrap: boolean;
  renderWhitespace: boolean;
  focusMode: boolean;
  primary: boolean;
  pinned: boolean;
  path: string;
  relPath: string;
  // Per-file data.
  lineComments: LineComments;
  changedLines: Array<[number, number]>;
  bookmarkLines: Set<number>;
  // Timer refs used by the updateListener.
  autoSaveTimer: MutableRefObject<number | undefined>;
  cursorSaveTimer: MutableRefObject<number | undefined>;
  // Callbacks the array invokes.
  openThreadAtLine: (line: number, ids: string[]) => void;
  toggleBookmarkLine: (line: number) => void;
  startComposer: (view: EditorView) => boolean;
  saveFile: () => void;
  peekDefinition: () => boolean;
  explainSymbol: (pos: number) => void;
  openComposerFor: (
    start: number,
    end: number,
    prefill?: { body?: string; type?: CommentType },
  ) => void;
  autoSave: () => void;
}

/** Build the CodeMirror extensions array for the code viewer. Moved verbatim
 *  out of CodeView's "create the editor once per file" effect. */
export function buildCodeExtensions(ctx: CodeExtensionsCtx): Extension[] {
  return [
    ctx.lineNumbersComp.of(lineNumbersExt(ctx.lineNumbersMode)),
    ctx.activeLineComp.of(activeLineExt(ctx.activeLineMode)),
    foldGutter(),
    highlightSpecialChars(),
    drawSelection(),
    ctx.bracketComp.of(ctx.bracketMatchingOn ? bracketMatching() : []),
    ctx.rulerComp.of(rulerExt(ctx.rulerColumn)),
    highlightSelectionMatches(),
    // Multiple cursors: Cmd/Ctrl+D adds the next occurrence, Alt+click adds a
    // caret, Alt+drag selects a column.
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((e) => e.altKey),
    rectangularSelection(),
    crosshairCursor(),
    // Reading aids: highlight the symbol under the cursor, indentation guides,
    // and syntax-aware expand/shrink selection.
    occurrenceHighlight,
    ctx.indentGuidesComp.of(indentGuidesExt(ctx.indentGuidesMode)),
    syntaxSelection,
    keymap.of([
      { key: "Shift-Alt-ArrowRight", run: expandSelection },
      { key: "Shift-Alt-ArrowLeft", run: shrinkSelection },
    ]),
    // Find & replace panel (Mod-F to find, Mod-Alt-F to replace).
    search({ top: true, createPanel: readoSearchPanel }),
    // Mirror the cursor position into the status bar; track unsaved edits.
    // Only the primary pane writes the shared cursor/dirty state.
    EditorView.updateListener.of((u) => {
      if (!ctx.primary) return;
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        const col = head - line.from + 1;
        useCursor.getState().set(line.number, col);
        // Persist the cursor per file (debounced, like the scroll save) so it
        // can be restored on reopen alongside the scroll offset.
        clearTimeout(ctx.cursorSaveTimer.current);
        ctx.cursorSaveTimer.current = window.setTimeout(() => {
          useSessions
            .getState()
            .saveCursor(useProject.getState().root, ctx.relPath, line.number, col);
        }, 300);
      }
      if (u.docChanged && !u.transactions.some((tr) => tr.annotation(ExternalReload))) {
        useEditorActions.getState().setDirty(true);
        setLastEdit(u.state.selection.main.head);
        // Auto Save (after-delay): debounce a write while the user types.
        if (useSettings.getState().autoSave === "afterDelay") {
          clearTimeout(ctx.autoSaveTimer.current);
          ctx.autoSaveTimer.current = window.setTimeout(ctx.autoSave, 1000);
        }
      }
    }),
    // Auto Save (on-focus-change): write when the editor loses focus.
    EditorView.domEventHandlers({
      blur: () => {
        if (useSettings.getState().autoSave === "onFocusChange") ctx.autoSave();
        return false;
      },
    }),
    // "Create task" from an LSP diagnostic tooltip: open the composer for the
    // problem's line, prefilled with the message as an actionable task.
    EditorView.updateListener.of((u) => {
      for (const tr of u.transactions) {
        for (const eff of tr.effects) {
          if (eff.is(explainSymbolAt)) {
            ctx.explainSymbol(eff.value.pos);
            continue;
          }
          if (!eff.is(taskFromDiagnostic)) continue;
          const line = u.state.doc.lineAt(eff.value.from).number;
          ctx.openComposerFor(line, line, { body: eff.value.message, type: "bug" });
        }
      }
    }),
    landingField,
    blockField,
    linkField,
    filePathFacet.of(ctx.path),
    gotoDefinitionHandlers,
    // F12 jumps to the definition of the symbol at the cursor.
    keymap.of([
      { key: "F12", run: (v) => (goToDefinitionAt(v, v.state.selection.main.head), true) },
      { key: "Mod-F12", run: (v) => (goToImplementationAt(v, v.state.selection.main.head), true) },
    ]),
    // Go to line — Cmd/Ctrl+G (VS Code), alongside the default Cmd+Alt+G.
    keymap.of([{ key: "Mod-g", run: gotoLine }]),
    // Shift+F12 — find references (project-wide search for the symbol).
    keymap.of([{ key: "Shift-F12", run: findReferencesAt }]),
    // Alt+F12 — peek the definition inline.
    keymap.of([{ key: "Alt-F12", run: () => ctx.peekDefinition() }]),
    ctx.gutterComp.of(commentGutter(ctx.lineComments, ctx.openThreadAtLine)),
    ctx.changedComp.of(changedLinesHighlight(ctx.changedLines)),
    ctx.bookmarkComp.of(bookmarkGutter(ctx.bookmarkLines, ctx.toggleBookmarkLine)),
    ctx.blameComp.of([]),
    ctx.lspComp.of([]),
    ctx.tabSizeComp.of(EditorState.tabSize.of(useDocInfo.getState().indentSize)),
    // Create-comment gesture (spec: a dedicated key on a selection).
    keymap.of([{ key: "Mod-Shift-m", run: ctx.startComposer }]),
    // Save when editing.
    keymap.of([{ key: "Mod-s", run: () => (ctx.saveFile(), true) }]),
    // Undo/redo: the history field plus its keymap (Mod-z / Mod-Shift-z).
    // These bindings live in historyKeymap, not defaultKeymap.
    history(),
    keymap.of([...historyKeymap, ...defaultKeymap, ...searchKeymap, ...foldKeymap]),
    // Editing is normally available; read-first is about the clean default
    // view, not read-only. The exception is PR mode, where the buffer is a
    // git ref's content and must not be edited into the working tree.
    editableExtension(!ctx.pinned),
    readoAppearance,
    // Mark diagnostics along the scrollbar so problems are easy to find.
    diagnosticsRuler,
    ctx.wrapComp.of(ctx.wrap ? EditorView.lineWrapping : []),
    ctx.whitespaceComp.of(ctx.renderWhitespace ? highlightWhitespace() : []),
    ctx.focusComp.of(focusExtension(ctx.focusMode)),
    ctx.langComp.of([]),
  ];
}

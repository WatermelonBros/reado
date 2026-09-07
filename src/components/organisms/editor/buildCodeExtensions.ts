import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  selectLine,
} from "@codemirror/commands"
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language"
import { lintKeymap } from "@codemirror/lint"
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { type Compartment, EditorState, type Extension } from "@codemirror/state"
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  highlightWhitespace,
  keymap,
  rectangularSelection,
} from "@codemirror/view"
import type { MutableRefObject } from "react"
import type { CommentType } from "@/lib/api"
import { bookmarkGutter } from "@/lib/bookmarkGutter"
import { changedLinesHighlight } from "@/lib/changedLines"
import { readoAppearance } from "@/lib/codemirror"
import { commentGutter, type LineComments } from "@/lib/commentGutter"
import { setLastEdit, useDocInfo } from "@/lib/docInfo"
import { cursorsToLineEnds, insertLineAbove, insertLineBelow } from "@/lib/editorCommands"
import { explainSymbolAt, taskFromDiagnostic } from "@/lib/lspActions"
import { occurrenceHighlight } from "@/lib/occurrenceHighlight"
import { diagnosticsRuler } from "@/lib/overviewRuler"
import { readoSearchPanel } from "@/lib/searchPanel"
import { contributedLanguage, contributedSnippets } from "@/lib/snippetSupport"
import { useCursor, useEditorActions, useProject, useSessions, useSettings } from "@/lib/store"
import { expandSelection, shrinkSelection, syntaxSelection } from "@/lib/syntaxSelection"
import {
  activeLineExt,
  blockField,
  ExternalReload,
  editableExtension,
  filePathFacet,
  findReferencesAt,
  focusExtension,
  goToDefinitionAt,
  goToImplementationAt,
  gotoDefinitionHandlers,
  indentGuidesExt,
  landingField,
  lineNumbersExt,
  linkField,
  rulerExt,
} from "./extensions"

/** Everything the CodeMirror extensions array references that is not a
 *  top-level import: the compartments, the initial modes/flags it reads, the
 *  per-file data, the timer refs the updateListener drives, and the callbacks
 *  the array invokes. Kept as a single ctx so the array can move out of the
 *  "create the editor once per file" effect verbatim. */
export interface CodeExtensionsCtx {
  // Compartments.
  lineNumbersComp: Compartment
  activeLineComp: Compartment
  bracketComp: Compartment
  rulerComp: Compartment
  indentGuidesComp: Compartment
  gutterComp: Compartment
  changedComp: Compartment
  /** The diff gutter (lines changed since HEAD), empty when the setting is off. */
  diffComp: Compartment
  bookmarkComp: Compartment
  blameComp: Compartment
  lspComp: Compartment
  tabSizeComp: Compartment
  /** The indentation unit auto-indent and Tab insert (tabs, or N spaces). */
  indentUnitComp: Compartment
  wrapComp: Compartment
  /** Swatches beside colour literals; empty when the setting is off. */
  colorComp: Compartment
  whitespaceComp: Compartment
  focusComp: Compartment
  langComp: Compartment
  // Initial modes / flags read to seed the compartments.
  lineNumbersMode: "off" | "on" | "relative"
  activeLineMode: "off" | "gutter" | "line" | "both"
  bracketMatchingOn: boolean
  rulerColumn: number
  indentGuidesMode: "off" | "all" | "active"
  wrap: boolean
  /** Built by CodeView, which owns the click handler. */
  colorSwatchesExt: Extension
  renderWhitespace: boolean
  focusMode: boolean
  primary: boolean
  pinned: boolean
  path: string
  relPath: string
  // Per-file data.
  lineComments: LineComments
  changedLines: Array<[number, number]>
  bookmarkLines: Set<number>
  // Timer refs used by the updateListener.
  autoSaveTimer: MutableRefObject<number | undefined>
  cursorSaveTimer: MutableRefObject<number | undefined>
  // Callbacks the array invokes.
  openThreadAtLine: (line: number, ids: string[]) => void
  toggleBookmarkLine: (line: number) => void
  startComposer: (view: EditorView) => boolean
  saveFile: () => void
  peekDefinition: () => boolean
  explainSymbol: (pos: number) => void
  openComposerFor: (
    start: number,
    end: number,
    prefill?: { body?: string; type?: CommentType },
  ) => void
  autoSave: () => void
}

/** The indentation unit of the document the status bar last measured: a tab, or
 *  as many spaces as it detected. */
export function detectedIndentUnit(): string {
  const { indentKind, indentSize } = useDocInfo.getState()
  return indentKind === "tabs" ? "\t" : " ".repeat(indentSize)
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
    dropCursor(),
    // Typing behaviours every editor has: auto-closing pairs (and the matching
    // Backspace), and re-indenting a line as you type its closing token.
    closeBrackets(),
    indentOnInput(),
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
    // The cursor is shared state, so only the primary pane writes it; the dirty
    // flag is per file, so both panes must — the split pane edits its own file
    // and would otherwise never auto-save.
    EditorView.updateListener.of((u) => {
      if (ctx.primary && (u.selectionSet || u.docChanged)) {
        const head = u.state.selection.main.head
        const line = u.state.doc.lineAt(head)
        const col = head - line.from + 1
        useCursor.getState().set(line.number, col)
        // Persist the cursor per file (debounced, like the scroll save) so it
        // can be restored on reopen alongside the scroll offset.
        clearTimeout(ctx.cursorSaveTimer.current)
        ctx.cursorSaveTimer.current = window.setTimeout(() => {
          useSessions
            .getState()
            .saveCursor(useProject.getState().root, ctx.relPath, line.number, col)
        }, 300)
      }
      if (u.docChanged && !u.transactions.some((tr) => tr.annotation(ExternalReload))) {
        useEditorActions.getState().setDirty(ctx.relPath, true)
        setLastEdit(u.state.selection.main.head)
        // Auto Save (after-delay): debounce a write while the user types.
        if (useSettings.getState().autoSave === "afterDelay") {
          clearTimeout(ctx.autoSaveTimer.current)
          ctx.autoSaveTimer.current = window.setTimeout(ctx.autoSave, 1000)
        }
      }
    }),
    // Auto Save (on-focus-change): write when the editor loses focus.
    EditorView.domEventHandlers({
      blur: () => {
        if (useSettings.getState().autoSave === "onFocusChange") ctx.autoSave()
        return false
      },
    }),
    // "Create task" from an LSP diagnostic tooltip: open the composer for the
    // problem's line, prefilled with the message as an actionable task.
    EditorView.updateListener.of((u) => {
      for (const tr of u.transactions) {
        for (const eff of tr.effects) {
          if (eff.is(explainSymbolAt)) {
            ctx.explainSymbol(eff.value.pos)
            continue
          }
          if (!eff.is(taskFromDiagnostic)) continue
          const line = u.state.doc.lineAt(eff.value.from).number
          ctx.openComposerFor(line, line, { body: eff.value.message, type: "bug" })
        }
      }
    }),
    landingField,
    blockField,
    linkField,
    filePathFacet.of(ctx.path),
    contributedSnippets(ctx.relPath),
    contributedLanguage(ctx.path),
    gotoDefinitionHandlers,
    // F12 jumps to the definition of the symbol at the cursor.
    keymap.of([
      {
        key: "F12",
        run: (v) => {
          goToDefinitionAt(v, v.state.selection.main.head)
          return true
        },
      },
      {
        key: "Mod-F12",
        run: (v) => {
          goToImplementationAt(v, v.state.selection.main.head)
          return true
        },
      },
    ]),
    // Go to line — Ctrl+G, like VS Code on every platform. Not Cmd+G on macOS:
    // there that combo is Find Next, which searchKeymap still provides.
    keymap.of([{ key: "Mod-g", mac: "Ctrl-g", run: gotoLine }]),
    // Shift+F12 — find references (project-wide search for the symbol).
    keymap.of([{ key: "Shift-F12", run: findReferencesAt }]),
    // Alt+F12 — peek the definition inline.
    keymap.of([{ key: "Alt-F12", run: () => ctx.peekDefinition() }]),
    ctx.gutterComp.of(commentGutter(ctx.lineComments, ctx.openThreadAtLine)),
    ctx.changedComp.of(changedLinesHighlight(ctx.changedLines)),
    ctx.diffComp.of([]),
    ctx.bookmarkComp.of(bookmarkGutter(ctx.bookmarkLines, ctx.toggleBookmarkLine)),
    ctx.blameComp.of([]),
    ctx.lspComp.of([]),
    ctx.tabSizeComp.of(EditorState.tabSize.of(useDocInfo.getState().indentSize)),
    // What Enter, Tab and indent/outdent actually insert. Without this every
    // file is re-indented with CodeMirror's 2-space default, whatever it uses.
    ctx.indentUnitComp.of(indentUnit.of(detectedIndentUnit())),
    // Create-comment gesture (spec: a dedicated key on a selection).
    keymap.of([{ key: "Mod-Shift-m", run: ctx.startComposer }]),
    // VS Code editing keys CodeMirror has commands for but doesn't bind.
    keymap.of([
      { key: "Mod-l", run: selectLine },
      { key: "Mod-Enter", run: insertLineBelow },
      { key: "Mod-Shift-Enter", run: insertLineAbove },
      { key: "Shift-Alt-i", run: cursorsToLineEnds },
    ]),
    // Save when editing.
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          ctx.saveFile()
          return true
        },
      },
    ]),
    // Undo/redo: the history field plus its keymap (Mod-z / Mod-Shift-z).
    // These bindings live in historyKeymap, not defaultKeymap.
    history(),
    // `indentWithTab` last of the four: Tab is a real key with real fallbacks
    // (accepting a completion, leaving the editor for the next control), so it
    // must not outrank them.
    keymap.of([
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...foldKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    // Editing is normally available; read-first is about the clean default
    // view, not read-only. The exception is PR mode, where the buffer is a
    // git ref's content and must not be edited into the working tree.
    editableExtension(!ctx.pinned),
    readoAppearance,
    // Mark diagnostics along the scrollbar so problems are easy to find.
    diagnosticsRuler,
    ctx.wrapComp.of(ctx.wrap ? EditorView.lineWrapping : []),
    ctx.colorComp.of(ctx.colorSwatchesExt),
    ctx.whitespaceComp.of(ctx.renderWhitespace ? highlightWhitespace() : []),
    ctx.focusComp.of(focusExtension(ctx.focusMode)),
    ctx.langComp.of([]),
  ]
}

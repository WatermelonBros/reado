import { forEachDiagnostic } from "@codemirror/lint"
import { selectSelectionMatches } from "@codemirror/search"
import type { EditorView } from "@codemirror/view"
import {
  readText as clipboardReadText,
  writeText as clipboardWriteText,
} from "@tauri-apps/plugin-clipboard-manager"
import type { TFunction } from "i18next"
import type { CommentType } from "@/lib/api"
import { organizeImports } from "@/lib/codeActions"
import { compareWithSaved, formatDocument } from "@/lib/docInfo"
import { hasServer, renameSymbolAt } from "@/lib/lsp"
import { useEditorActions, useProject } from "@/lib/store"
import {
  findReferencesAt,
  goToDefinitionAt,
  goToImplementationAt,
  goToTypeDefinitionAt,
} from "./extensions"

export interface EditorMenuItem {
  label: string
  run: () => void
  separatorBefore?: boolean
}

/** What the right-click menu needs from the view it was opened on. */
export interface EditorMenuContext {
  t: TFunction
  pinned: boolean
  path: string
  relPath: string
  explainSymbol: (pos: number) => void
  explainSelection: (asNote: boolean) => void
  peekDefinition: () => boolean
  openActionMenu: () => Promise<void>
  openComposerFor: (
    startLine: number,
    endLine: number,
    prefill?: { body?: string; type?: CommentType },
  ) => void
}

/** The editor context-menu actions for the clicked position `pos`. */
export function editorContextMenuItems(
  view: EditorView,
  pos: number,
  {
    t,
    pinned,
    path,
    relPath,
    explainSymbol,
    explainSelection,
    peekDefinition,
    openActionMenu,
    openComposerFor,
  }: EditorMenuContext,
): EditorMenuItem[] {
  const word = view.state.wordAt(pos)
  const isRepo = useProject.getState().git.isRepo
  // A language-server diagnostic at the clicked line — offered as a quick
  // "create task" so the problem can become an anchored task without hovering.
  const clickLine = view.state.doc.lineAt(pos)
  let diagMessage: string | null = null
  forEachDiagnostic(view.state, (d, from, to) => {
    if (diagMessage) return
    if (to >= clickLine.from && from <= clickLine.to) diagMessage = d.message
  })
  const hasSelection = !view.state.selection.main.empty
  // With no selection, cut and copy take the whole line — the way they do in
  // VS Code, and the reason the pair is worth reaching for without selecting
  // anything first. `to` spans the line break so a cut removes the line rather
  // than leaving a blank one behind.
  const clipRange = () => {
    const sel = view.state.selection.main
    if (!sel.empty)
      return { from: sel.from, to: sel.to, text: view.state.sliceDoc(sel.from, sel.to) }
    const line = view.state.doc.lineAt(sel.head)
    return {
      from: line.from,
      to: Math.min(line.to + 1, view.state.doc.length),
      text: `${line.text}\n`,
    }
  }
  return [
    // The webview has no native context menu, so the clipboard verbs have to
    // be here or right-click offers no way to copy at all.
    !pinned && {
      label: t("editor.cut"),
      run: () => {
        const { from, to, text } = clipRange()
        void clipboardWriteText(text).catch(() => {})
        view.dispatch({ changes: { from, to, insert: "" } })
      },
    },
    {
      label: t("editor.copy"),
      run: () => void clipboardWriteText(clipRange().text).catch(() => {}),
    },
    !pinned && {
      label: t("editor.paste"),
      run: () => {
        void clipboardReadText()
          .then((text) => text && view.dispatch(view.state.replaceSelection(text)))
          .catch(() => {})
      },
    },
    word && {
      label: t("editor.goToDef"),
      separatorBefore: true,
      run: () => goToDefinitionAt(view, pos),
    },
    hasServer(path) &&
      word && {
        label: t("editor.goToTypeDef"),
        run: () => goToTypeDefinitionAt(view, pos),
      },
    hasServer(path) &&
      word && {
        label: t("editor.goToImpl"),
        run: () => goToImplementationAt(view, pos),
      },
    hasServer(path) &&
      word && {
        label: t("editor.explainSymbol"),
        run: () => explainSymbol(pos),
      },
    word && {
      label: t("editor.peekDef"),
      run: () => {
        view.dispatch({ selection: { anchor: pos } })
        peekDefinition()
      },
    },
    word && {
      label: t("editor.findRefs"),
      run: () => {
        view.dispatch({ selection: { anchor: pos } })
        findReferencesAt(view)
      },
    },
    !pinned &&
      hasServer(path) &&
      word && {
        label: t("editor.renameSymbol"),
        run: () => {
          view.dispatch({ selection: { anchor: pos } })
          view.focus()
          renameSymbolAt(view)
        },
      },
    hasSelection && {
      label: t("editor.allOccurrences"),
      run: () => selectSelectionMatches(view),
    },
    hasServer(path) && {
      label: t("lsp.quickFix"),
      separatorBefore: true,
      run: () => void openActionMenu(),
    },
    hasServer(path) && {
      label: t("lsp.organizeImports"),
      run: () => void organizeImports(),
    },
    diagMessage && {
      label: t("lsp.createTaskFromProblem"),
      run: () =>
        openComposerFor(clickLine.number, clickLine.number, { body: diagMessage!, type: "bug" }),
    },
    {
      label: t("comment.new"),
      run: () => {
        const line = view.state.doc.lineAt(pos).number
        openComposerFor(line, line)
      },
    },
    { label: t("editor.explain"), run: () => explainSelection(false) },
    { label: t("editor.explainNote"), run: () => explainSelection(true) },
    // A pinned (PR-ref) buffer is read-only — formatting mutates it but the
    // save is a no-op, so don't offer it.
    !pinned && { label: t("editor.format"), run: () => void formatDocument() },
    // Only when there is something unsaved to compare — otherwise the diff is
    // guaranteed empty and the item is a dead end.
    !pinned &&
      useEditorActions.getState().isDirty(relPath) && {
        label: t("diff.compareWithSaved"),
        run: () => compareWithSaved(),
      },
    isRepo && {
      label: t("diff.toggle"),
      run: () => useEditorActions.getState().setDiffing(!useEditorActions.getState().diffing),
    },
  ].filter(Boolean) as EditorMenuItem[]
}

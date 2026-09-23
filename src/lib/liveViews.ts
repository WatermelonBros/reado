import type { EditorView } from "@codemirror/view"
import { t } from "@/i18n"
import { type EditorConfig, readFile } from "@/lib/api"
import { notify, notifyError } from "@/lib/notice"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { type Eol, useDocInfo } from "./docInfo"

/**
 * Every mounted editor view, with the project-relative path it is editing.
 *
 * `useDocInfo.view` is the *focused* pane; Save All has to reach the split pane
 * too. Only the mounted panes can hold unsaved text at all — switching a tab
 * away unmounts its view and flushes it — so this set is the whole of it.
 */
export const liveViews = new Map<
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
export const fileConfigs = new Map<string, EditorConfig>()

export function setEditorConfig(rel: string, config: EditorConfig | null): void {
  if (config?.applies) fileConfigs.set(rel, config)
  else fileConfigs.delete(rel)
}

export const editorConfigOf = (rel: string): EditorConfig | undefined => fileConfigs.get(rel)

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

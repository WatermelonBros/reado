import type { EditorView } from "@codemirror/view"
import { type RefObject, useState } from "react"
import { writeFile } from "@/lib/api"
import { applyEol, applyHygiene, encodingFor, eolFor, saveAs, textToSave } from "@/lib/docInfo"
import { createLogger, safeError } from "@/lib/logger"
import { fileSaved } from "@/lib/lsp"
import { noteSelfWrite } from "@/lib/readProgress"
import { useEditorActions } from "@/lib/store"
import { isUntitled, useUntitled } from "@/lib/untitled"

const log = createLogger("editor")

/** Writing one editor's buffer back to disk: on demand, on close, and on Auto Save. */
export function useEditorSave(
  viewRef: RefObject<EditorView | null>,
  {
    path,
    relPath,
    fileRoot,
    pinned,
  }: { path: string; relPath: string; fileRoot: string; pinned: boolean },
) {
  // A failed write (read-only file, permission, disk full). Surfaced as a small
  // dismissable banner so a save error is never swallowed silently.
  const [saveError, setSaveError] = useState(false)

  // Save the buffer to disk (Cmd/Ctrl+S). Never in PR mode: the bytes are the
  // PR's (from a ref), so writing them would clobber the user's working tree.
  const saveFile = async () => {
    const view = viewRef.current
    if (!view || pinned) return
    // A scratch buffer has nowhere to be written back to: saving one is Save As.
    if (isUntitled(path)) return saveAs()
    // Opt-in save pipeline, applied only on write (never on read): format on
    // save, then trim trailing whitespace and/or ensure a final newline. A
    // formatter that fails or hangs is reported but never blocks the write.
    const text = await textToSave(view)
    if (viewRef.current !== view) return // the tab changed while formatting ran
    noteSelfWrite(relPath) // our own save — don't let it mark the file unread
    writeFile(fileRoot, relPath, text)
      .then(() => {
        useEditorActions.getState().setDirty(relPath, false)
        setSaveError(false) // clear any prior failure on a successful save
        fileSaved(view) // the formatter may have rewritten it; re-ask the server
      })
      .catch((e) => {
        // The inline banner is the contextual surface; also log the raw error so
        // a save failure is never fully swallowed for diagnostics.
        log.error("file save failed", { path: relPath, error: safeError(e) })
        setSaveError(true)
      })
  }

  // Closing (or switching away from) a file with unsaved edits: write what is in
  // the buffer, right now. `saveFile` cannot be reused — it drops the write when
  // the tab changed under it, which is exactly the case here — and formatting is
  // skipped on purpose: the formatter resolves "the active document", which by
  // this point is the file being switched *to*.
  const flushOnClose = (view: EditorView, root: string) => {
    // The scratch buffer's disk is the store. This is what makes switching to
    // another tab and back keep the text: the view unmounts, and its content
    // has to land somewhere before it goes.
    if (isUntitled(path)) {
      useUntitled.getState().setText(path, view.state.doc.toString())
      useEditorActions.getState().setDirty(relPath, false)
      return
    }
    noteSelfWrite(relPath)
    writeFile(
      root,
      relPath,
      applyEol(applyHygiene(view.state.doc.toString(), relPath), eolFor(view)),
      encodingFor(view),
    )
      .then(() => useEditorActions.getState().setDirty(relPath, false))
      .catch((e) => log.error("flush on close failed", { path: relPath, error: safeError(e) }))
  }

  // Auto Save: write only when there are unsaved edits (avoids needless writes).
  const autoSave = () => {
    if (!useEditorActions.getState().isDirty(relPath)) return
    // Auto Save must not open a Save As dialog behind the user's back — for a
    // scratch buffer it means "park the text", which is all there is to do.
    const view = viewRef.current
    if (isUntitled(path)) {
      if (view) useUntitled.getState().setText(path, view.state.doc.toString())
      return
    }
    void saveFile()
  }

  return { saveFile, flushOnClose, autoSave, saveError, setSaveError }
}

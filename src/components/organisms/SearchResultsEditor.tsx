/**
 * The search results, as text you can edit.
 *
 * Replace-all is a blunt instrument and one-at-a-time is slow; a careful rename
 * wants every hit visible at once, edited by hand, with the three that shouldn't
 * change simply left alone. Applying rewrites exactly the rows you touched.
 *
 * A dialog rather than a tab: Reado's tabs are file paths, and this is not a
 * file. Making it one would mean inventing a virtual-document type for a surface
 * you open, use and close.
 */

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import type { SearchMatch } from "@/lib/api"
import { readoAppearance } from "@/lib/codemirror"
import { useFileUndo } from "@/lib/fileUndo"
import { notify, notifyError } from "@/lib/notice"
import { applyResultEdits, buildResultsDoc, pendingEdits, sameShape } from "@/lib/searchResults"
import { mod } from "@/lib/shortcuts"
import { useProject } from "@/lib/store"

interface Props {
  matches: SearchMatch[]
  open: boolean
  onClose: () => void
  /** Re-run the search once the files have changed underneath it. */
  onApplied: () => void
}

export function SearchResultsEditor({ matches, open, onClose, onApplied }: Props) {
  const { t } = useTranslation()
  // A callback ref, not a `useRef`: `Modal` is an Ark dialog with `lazyMount`,
  // so this host is mounted a commit *after* `open` flips. An effect keyed on
  // `open` therefore ran while the ref was still null, bailed, and — its deps
  // unchanged — never ran again. The dialog opened empty: no results, no
  // editor, just "Apply 0 changes".
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [edited, setEdited] = useState("")
  const doc = useMemo(() => buildResultsDoc(matches), [matches])

  // One editor per opening: the document is built from the results as they were
  // when you opened it, and re-seeding a live one mid-edit would drop the edits.
  useEffect(() => {
    if (!open || !host) return
    const view = new EditorView({
      doc: doc.text,
      parent: host,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        readoAppearance,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setEdited(u.state.doc.toString())
        }),
      ],
    })
    viewRef.current = view
    setEdited(doc.text)
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [open, host, doc])

  const edits = pendingEdits(doc, edited)
  const shapeOk = sameShape(doc, edited)

  const apply = async () => {
    try {
      const { files, backups } = await applyResultEdits(edits)
      // One action on the undo stack, however many files it touched — the same
      // guarantee Replace All gives.
      if (backups.length > 0) useFileUndo.getState().record({ kind: "replace", backups })
      notify("info", t("search.resultsApplied", { files }))
      useProject.getState().bumpTree()
      onApplied()
      onClose()
    } catch (e) {
      notifyError("searchResults", t("search.resultsShape"), e)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      ariaLabel={t("search.resultsTitle")}
      className="flex h-[min(720px,86vh)] w-[min(900px,94vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="m-0 flex-1 text-lg font-semibold">{t("search.resultsTitle")}</h2>
        <IconButton
          label={t("settings.close")}
          icon={<CloseIcon className="h-4 w-4" />}
          onClick={onClose}
        />
      </header>
      <p className="flex-none px-4 pt-3 text-xs leading-relaxed text-faint">
        {t("search.resultsHint", { key: `${mod}Z` })}
      </p>
      <div ref={setHost} className="min-h-0 flex-1 overflow-auto p-2" />
      <footer className="flex flex-none items-center justify-end gap-3 border-t border-line px-4 py-3">
        <span className="flex-1 text-xs text-muted">
          {!shapeOk
            ? t("search.resultsShape")
            : edits.length === 0
              ? t("search.resultsNone")
              : null}
        </span>
        <Button
          variant="primary"
          disabled={!shapeOk || edits.length === 0}
          onClick={() => void apply()}
        >
          {t("search.resultsApply", { count: edits.length })}
        </Button>
      </footer>
    </Modal>
  )
}

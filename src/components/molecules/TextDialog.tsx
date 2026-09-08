/**
 * A dialog for editing a chunk of Reado's own configuration as plain text.
 *
 * Two of these exist — the settings JSON and the keybindings — and they are the
 * same dialog: read the current state into a textarea, let the reader rewrite
 * it, apply, and say what happened. Only the text and what applying it means
 * differ, so those are the props and the rest is here.
 *
 * The reload is deliberately tied to `open` alone. Both dialogs apply by writing
 * to a store they also read from, and an effect that reloaded on every change to
 * that store would fire straight after Apply and wipe the message explaining
 * what Apply just did.
 */
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { Textarea } from "@/components/atoms/Textarea"

interface TextDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** A line above the field saying what the text is and how it is read. */
  hint: string
  /** The text as it stands. Called afresh on every open, so the dialog shows
   *  what is in force now rather than what was there when it last closed. */
  load: () => string
  /** Apply the edited text; what it returns is what the dialog reports. The
   *  field is reloaded from `load` afterwards, so it settles on canonical text
   *  rather than on whatever the reader happened to type. */
  onApply: (draft: string) => string
  applyLabel: string
  /** Extra footer buttons, to the left of Apply. */
  actions?: (api: { draft: string; reload: () => void }) => ReactNode
}

export function TextDialog({
  open,
  onClose,
  title,
  hint,
  load,
  onApply,
  applyLabel,
  actions,
}: TextDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  // Held in a ref so reloading doesn't depend on the caller passing a stable
  // callback — every one of these closes over a store read.
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(() => {
    setDraft(loadRef.current())
    setStatus(null)
  }, [])
  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      ariaLabel={title}
      className="flex max-h-[80vh] w-[min(720px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="m-0 flex-1 text-lg font-semibold">{title}</h2>
        <IconButton
          label={t("settings.close")}
          icon={<CloseIcon className="h-4 w-4" />}
          onClick={onClose}
        />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <p className="text-xs leading-relaxed text-faint">{hint}</p>
        <Textarea
          mono
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          rows={18}
          className="min-h-0 flex-1 resize-none bg-canvas text-xs"
        />
        {status && <p className="text-xs leading-relaxed text-muted">{status}</p>}
      </div>
      <footer className="flex flex-none items-center justify-end gap-2 border-t border-line px-4 py-3">
        {actions?.({ draft, reload })}
        <Button
          variant="primary"
          onClick={() => {
            const message = onApply(draft)
            setDraft(loadRef.current())
            setStatus(message)
          }}
        >
          {applyLabel}
        </Button>
      </footer>
    </Modal>
  )
}

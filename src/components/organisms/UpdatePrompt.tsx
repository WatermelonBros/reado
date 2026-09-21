/**
 * Custom in-app update experience: a styled modal when an update is available,
 * a small "update available" indicator (top-right) once dismissed, and a toast
 * for "up to date" / error feedback. Replaces the native updater dialogs.
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { useUpdate } from "@/lib/update"

export function UpdatePrompt() {
  const { version, notes, open, installing, toast } = useUpdate()
  const dismiss = useUpdate((s) => s.dismiss)
  const install = useUpdate((s) => s.install)
  const clearToast = useUpdate((s) => s.clearToast)
  const { t } = useTranslation()

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(clearToast, 4500)
    return () => clearTimeout(id)
  }, [toast, clearToast])

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(o) => !o && dismiss()}
        ariaLabel={t("update.title")}
        className="w-[min(460px,calc(100vw-2rem))]"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="m-0 text-sm font-semibold text-ink">{t("update.title")}</h2>
          <IconButton
            label={t("update.later")}
            icon={<CloseIcon />}
            onClick={dismiss}
            disabled={installing}
          />
        </div>

        <div className="px-4 py-3">
          <p className="m-0 text-sm text-ink">
            {t("update.available", { version: version ?? "" })}
          </p>
          {notes && (
            <div className="prose-reado mt-3 max-h-60 overflow-y-auto text-base text-muted">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
          <Button size="sm" onClick={dismiss} disabled={installing}>
            {t("update.later")}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void install()} disabled={installing}>
            {installing ? t("update.installing") : t("update.install")}
          </Button>
        </div>
      </Modal>

      {/* Indicator: available but dismissed. Sits in the title bar's right end —
          the wrapper is the bar's height (h-9) so the pill is vertically centered
          in it regardless of the pill's own height. */}
      {/* Toast: up-to-date / error. */}
      {toast && (
        <div
          role="status"
          className={`animate-rise fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-md border px-3 py-2 text-xs shadow-[var(--shadow)] ${
            toast.kind === "error"
              ? "border-line-strong bg-overlay text-marker"
              : "border-line bg-overlay text-ink"
          }`}
        >
          {toast.text}
        </div>
      )}
    </>
  )
}

/**
 * The "update available" pill, shown once the prompt has been dismissed.
 *
 * It used to position itself — `fixed top-0 right-3 z-[105]` — which put it on
 * top of the title bar's own trailing controls (Discord, and the sidebar / panel
 * / secondary-sidebar / layout toggles all live in exactly that strip). Anyone
 * who postponed an update lost those four buttons until they took it, which is
 * a poor trade for a reminder. It is now laid out *by* the title bar, so the
 * controls move aside instead of disappearing underneath.
 */
export function UpdateIndicator() {
  const { update, dismissed, open, version } = useUpdate()
  const reopen = useUpdate((s) => s.reopen)
  const { t } = useTranslation()
  if (!update || !dismissed || open) return null
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={reopen}
      title={t("update.available", { version: version ?? "" })}
      className="animate-fade flex-none rounded-full border-line-strong bg-overlay shadow-[var(--shadow)]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {t("update.indicator")}
    </Button>
  )
}

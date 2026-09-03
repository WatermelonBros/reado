/**
 * The app-wide transient notice toasts (bottom-centre stack), driven by
 * `useNotice`. Each toast owns its auto-dismiss timer and a symmetric enter/exit
 * transition (rise + fade); newest sits at the bottom and lifts the older ones.
 * Reduce-motion collapses the transition to instant via the global CSS rule.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { CheckIcon, CloseIcon, InfoIcon, WarningIcon } from "@/components/atoms/icons"
import { type Toast, useNotice } from "@/lib/notice"

/** How long a toast lingers before auto-dismissing. */
const LINGER_MS = 5000
/** Exit transition window before the toast unmounts (matches --motion-base). */
const EXIT_MS = 200

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation()
  const dismiss = useNotice((s) => s.dismiss)
  // `shown` drives the enter transition (flip to true on the next frame);
  // `leaving` drives the exit, after which the store entry is removed.
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    const linger = setTimeout(() => setLeaving(true), LINGER_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(linger)
    }
  }, [])

  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => dismiss(toast.id), EXIT_MS)
    return () => clearTimeout(id)
  }, [leaving, dismiss, toast.id])

  // A coloured 2px left border is the decorative-stripe habit; the kind is
  // carried by an icon instead, which also survives colour blindness and says
  // what it means rather than relying on a hue nobody explained.
  const Glyph =
    toast.kind === "error" ? WarningIcon : toast.kind === "success" ? CheckIcon : InfoIcon
  const tone =
    toast.kind === "error" ? "text-marker" : toast.kind === "success" ? "text-accent" : "text-faint"

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex max-w-[min(90vw,420px)] items-start gap-2 rounded-md border border-line bg-overlay py-2 pr-2 pl-3 text-xs text-ink shadow-[var(--shadow)] transition-[opacity,transform] duration-200 ease-[var(--ease,ease)] ${
        shown && !leaving ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <Glyph className={`mt-px h-3.5 w-3.5 flex-none ${tone}`} />
      <span className="min-w-0 flex-1 pt-px leading-snug break-words">{toast.text}</span>
      <IconButton
        size="xs"
        label={t("common.dismiss")}
        icon={<CloseIcon className="h-3.5 w-3.5" />}
        onClick={() => setLeaving(true)}
      />
    </div>
  )
}

export function Notice() {
  const notices = useNotice((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col-reverse items-center gap-2">
      {notices.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

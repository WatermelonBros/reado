/**
 * "This needs the window rebuilt."
 *
 * Only when it does. A theme applies as you pick it; a grammar or a snippet set
 * is compiled into an editor when a file opens, and a language server is a
 * process that stays connected — so those changes are invisible until the window
 * is rebuilt. Saying so every time would train the reader to ignore it, so the
 * prompt appears only after a change that actually needs one.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { useMarketplace } from "@/lib/marketplace"

export function ReloadNotice() {
  const { t } = useTranslation()
  const needed = useMarketplace((s) => s.reloadNeeded)
  if (!needed) return null

  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
        {t("ext.reloadNeeded")}
      </span>
      <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
        {t("ext.reload")}
      </Button>
    </div>
  )
}

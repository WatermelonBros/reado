/**
 * Allow or deny a phone pairing from outside the network.
 *
 * On the LAN a valid QR is enough; through a relay it isn't — a photographed QR
 * would let anyone in for five minutes. So the server holds a remote pairing and
 * asks here, with a code the phone shows too. Nothing is minted until Allow.
 */
import { listen } from "@tauri-apps/api/event"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/atoms/Modal"
import { type AnywherePairRequest, anywherePairAnswer } from "@/lib/api"
import { offSafe } from "@/lib/terminals"

export function AnywherePairConfirm() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<AnywherePairRequest[]>([])

  useEffect(() => {
    const pending = listen<AnywherePairRequest>("anywhere-pair-request", (e) =>
      setQueue((q) => [...q, e.payload]),
    )
    return () => {
      offSafe(pending)
    }
  }, [])

  const current = queue[0]
  const answer = (allow: boolean) => {
    if (!current) return
    setQueue((q) => q.slice(1))
    void anywherePairAnswer(current.id, allow)
  }

  return (
    <Modal
      open={!!current}
      onOpenChange={(o) => !o && answer(false)}
      ariaLabel={t("anywhere.confirmTitle", { name: current?.name ?? "" })}
      className="w-[min(400px,92vw)]"
    >
      {current && (
        <div className="px-6 py-6 text-center">
          <h2 className="m-0 text-sm font-medium">
            {t("anywhere.confirmTitle", { name: current.name })}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("anywhere.confirmBody")}</p>
          <p className="mt-5 font-mono text-3xl tracking-[0.3em] text-ink">
            {current.code.slice(0, 3)} {current.code.slice(3)}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => answer(false)}>{t("anywhere.deny")}</Button>
            <Button variant="primary" onClick={() => answer(true)}>
              {t("anywhere.allow")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

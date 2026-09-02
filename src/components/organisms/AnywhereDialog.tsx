/**
 * Reado Anywhere — the desktop pairing surface.
 *
 * Enable the opt-in LAN server, then scan the QR with a phone on the same
 * network (or VPN) to review from it. No account, no cloud. The QR encodes the
 * HTTPS address, the certificate fingerprint (the phone verifies it is reaching
 * the right desktop) and a **single-use pairing secret** — not a credential: the
 * phone spends it once at `/api/pair` to mint its own, which is what this dialog
 * then lists and can revoke one at a time.
 */
import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Checkbox } from "@/components/atoms/Checkbox"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { TrashIcon } from "@/components/atoms/icons"
import { Modal } from "@/components/atoms/Modal"
import { QrCode } from "@/components/atoms/QrCode"
import { Select } from "@/components/atoms/Select"
import {
  type AnywhereConfig,
  type AnywhereDevice,
  type AnywhereIface,
  type AnywhereInfo,
  anywhereConfig,
  anywhereDevices,
  anywhereDisable,
  anywhereEnable,
  anywhereInterfaces,
  anywhereNewPairing,
  anywhereRevoke,
  anywhereRevokeAll,
  anywhereSetBind,
  anywhereSetLifetimes,
  anywhereSetMdns,
  anywhereStatus,
} from "@/lib/api"
import { currentOS } from "@/lib/extensions"
import { usePalette } from "@/lib/store"

/** The QR payload: the address with the pairing secret + fingerprint in the
 * fragment, so neither ever hits a query string (or a server log). */
const payload = (i: AnywhereInfo) =>
  `${i.url}/#pair=${i.pairing}&fp=${encodeURIComponent(i.fingerprint)}`

/** "3 days ago", in the user's locale. `Intl` already knows every language we
 * ship, so the phrasing is not ours to translate. */
function lastSeen(seconds: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const delta = seconds - Date.now() / 1000
  const mins = delta / 60
  if (Math.abs(mins) < 60) return rtf.format(Math.round(mins), "minute")
  const hours = mins / 60
  if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour")
  return rtf.format(Math.round(hours / 24), "day")
}

/** The interface the backend picks when nothing is chosen. */
const AUTO = "auto"

const PRIMED_KEY = "reado.anywhere.primed"

export function AnywhereDialog() {
  const open = usePalette((s) => s.anywhereOpen)
  const toggle = usePalette((s) => s.toggleAnywhere)
  const { t, i18n } = useTranslation()

  const [info, setInfo] = useState<AnywhereInfo | null>(null)
  const [devices, setDevices] = useState<AnywhereDevice[]>([])
  const [config, setConfig] = useState<AnywhereConfig | null>(null)
  const [ifaces, setIfaces] = useState<AnywhereIface[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // macOS pops a system "allow local network access" prompt the moment the
  // server binds. We can't restyle that dialog, but we can explain it first with
  // our own step so it isn't a surprise — then let it fire.
  const [priming, setPriming] = useState(false)

  // The paired devices survive the server being off, so they load either way.
  const refresh = useCallback(() => {
    anywhereDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [])

  // Reflect the real server state whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setPriming(false)
    anywhereStatus()
      .then(setInfo)
      .catch(() => setInfo(null))
    refresh()
    anywhereConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
    anywhereInterfaces()
      .then(setIfaces)
      .catch(() => setIfaces([]))
  }, [open, refresh])

  // A phone that pairs while this dialog is open appears straight away — the
  // server emits when it mints a credential, so there is nothing to poll.
  useEffect(() => {
    if (!open) return
    const pending = listen("anywhere-devices-changed", refresh)
    return () => {
      void pending.then((off) => off())
    }
  }, [open, refresh])

  const enable = async () => {
    setBusy(true)
    setError(null)
    try {
      setInfo(await anywhereEnable())
      setPriming(false)
      localStorage.setItem(PRIMED_KEY, "1") // don't re-explain on later enables
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  // On macOS, explain the OS local-network prompt before triggering it — but only
  // the first time (afterwards the OS remembers the grant, so priming is noise).
  const requestEnable = () =>
    currentOS() === "mac" && !localStorage.getItem(PRIMED_KEY) ? setPriming(true) : enable()

  const disable = async () => {
    setBusy(true)
    try {
      await anywhereDisable()
      setInfo(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      await anywhereRevoke(id)
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  const revokeAll = async () => {
    try {
      await anywhereRevokeAll()
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  const pairAnother = async () => {
    setBusy(true)
    try {
      setInfo(await anywhereNewPairing())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Persist one preference and keep the local copy in step. */
  const patch = async (change: Partial<AnywhereConfig>, save: () => Promise<void>) => {
    if (!config) return
    setConfig({ ...config, ...change })
    try {
      await save()
    } catch (e) {
      setError(String(e))
    }
  }

  const copyUrl = () => {
    if (!info) return
    void navigator.clipboard.writeText(info.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => toggle(o)}
      ariaLabel={t("anywhere.title")}
      className="flex max-h-[86vh] w-[min(480px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="m-0 flex items-center gap-2 text-sm font-medium">
          {t("anywhere.title")}
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: info ? "var(--syn-string)" : "var(--border-strong)" }}
            aria-hidden
          />
        </h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-6 text-center">
        {info ? (
          <>
            <div className="rounded-xl bg-[var(--qr-surface)] p-4 shadow-[var(--shadow)]">
              <QrCode value={payload(info)} size={216} />
            </div>
            <p className="mt-5 max-w-[34ch] text-sm leading-relaxed text-muted">
              {t("anywhere.scanHint")}
            </p>

            <button
              type="button"
              onClick={copyUrl}
              title={t("anywhere.copy")}
              className="mt-4 max-w-full truncate rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink transition-colors hover:border-line-strong"
            >
              {copied ? t("anywhere.copied") : info.url}
            </button>
            <p className="mt-3 font-mono text-[10px] leading-relaxed break-all text-faint">
              {t("anywhere.fingerprint")}: {info.fingerprint}
            </p>
          </>
        ) : (
          <>
            <p className="max-w-[36ch] text-lg leading-relaxed text-ink/85">
              {t("anywhere.tagline")}
            </p>
            <p className="mt-2 max-w-[36ch] text-xs leading-relaxed text-faint">
              {t("anywhere.privacyNote")}
            </p>
          </>
        )}
        {priming && !info && (
          <div className="mt-4 max-w-[36ch] rounded-md border border-line-strong bg-surface p-3">
            <p className="text-base font-medium text-ink">{t("anywhere.primeTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t("anywhere.primeBody")}</p>
          </div>
        )}
        {error && <p className="mt-4 text-xs text-marker">{error}</p>}

        {info && (
          <Button
            variant="secondary"
            size="sm"
            onClick={pairAnother}
            disabled={busy}
            className="mt-5"
          >
            {t("anywhere.pairAnother")}
          </Button>
        )}

        <section className="mt-6 w-full border-t border-line pt-5 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-xs font-medium tracking-wide text-faint uppercase">
              {t("anywhere.devices")}
            </h3>
            {devices.length > 1 && (
              <Button variant="danger" size="sm" onClick={() => void revokeAll()}>
                {t("anywhere.revokeAll")}
              </Button>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-faint">{t("anywhere.noDevices")}</p>
          ) : (
            <ul className="m-0 mt-2 list-none p-0">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.name}</span>
                  <span className="flex-none text-[10px] text-faint">
                    {lastSeen(d.lastSeen, i18n.language)}
                  </span>
                  <IconButton
                    label={t("anywhere.revoke", { name: d.name })}
                    icon={<TrashIcon className="h-3.5 w-3.5" />}
                    onClick={() => void revoke(d.id)}
                    size="sm"
                    danger
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {config && (
          <section className="mt-5 w-full border-t border-line pt-5 text-left">
            <h3 className="m-0 text-xs font-medium tracking-wide text-faint uppercase">
              {t("anywhere.security")}
            </h3>

            <label className="mt-3 flex items-center justify-between gap-3 text-sm text-ink">
              <span className="min-w-0">{t("anywhere.iface")}</span>
              <Select
                value={config.bind ?? AUTO}
                ariaLabel={t("anywhere.iface")}
                options={[
                  { value: AUTO, label: t("anywhere.ifaceAuto") },
                  ...ifaces.map((i) => ({ value: i.addr, label: `${i.name} · ${i.addr}` })),
                ]}
                onChange={(v) => {
                  const bind = v === AUTO ? null : v
                  void patch({ bind }, () => anywhereSetBind(bind))
                }}
              />
            </label>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">{t("anywhere.ifaceHint")}</p>

            <div className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <span>{t("anywhere.idleDays")}</span>
                <Input
                  type="number"
                  min={0}
                  value={config.idleDays}
                  onChange={(e) => {
                    const idleDays = Number(e.target.value) || 0
                    void patch({ idleDays }, () => anywhereSetLifetimes(idleDays, config.maxDays))
                  }}
                  className="w-16 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <span>{t("anywhere.maxDays")}</span>
                <Input
                  type="number"
                  min={0}
                  value={config.maxDays}
                  onChange={(e) => {
                    const maxDays = Number(e.target.value) || 0
                    void patch({ maxDays }, () => anywhereSetLifetimes(config.idleDays, maxDays))
                  }}
                  className="w-16 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">
              {t("anywhere.lifetimeHint")}
            </p>

            <Checkbox
              className="mt-4 text-sm text-ink"
              checked={config.mdns}
              onChange={(on) => void patch({ mdns: on }, () => anywhereSetMdns(on))}
              label={t("anywhere.mdns")}
            />
            <p className="mt-1 text-[10px] leading-relaxed text-faint">{t("anywhere.mdnsHint")}</p>
          </section>
        )}
      </div>

      <footer className="flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={() => (priming ? setPriming(false) : toggle(false))}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          {priming ? t("common.cancel") : t("common.close")}
        </button>
        {info ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
          >
            {t("anywhere.stop")}
          </button>
        ) : priming ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t("anywhere.enabling") : t("anywhere.primeContinue")}
          </button>
        ) : (
          <button
            type="button"
            onClick={requestEnable}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t("anywhere.enabling") : t("anywhere.enable")}
          </button>
        )}
      </footer>
    </Modal>
  )
}

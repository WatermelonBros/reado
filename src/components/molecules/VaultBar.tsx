/**
 * The browser pane's credential strips.
 *
 * Both render *above* the pane body rather than over it: the page is a native
 * child window that covers its placeholder, so anything drawn on top of the body
 * would be behind the page. Pushing the body down instead lets the pane's
 * ResizeObserver re-park the webview — the strip is simply part of the chrome.
 *
 * `VaultBar` is the user asking their password manager for this page's login.
 * `AccessRequest` is the agent asking the user for this page — the refusal has
 * already been sent, so this prompt decides only what happens next.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { vaultCreate, vaultLookup, vaultOtp, vaultSecret, vaultStatus } from "@/lib/api"
import { originOf, usePreview } from "@/lib/preview"
import { useWorkspace } from "@/lib/store"
import type { FillResult, VaultItem, VaultStatus } from "@/lib/vault"
import {
  fillLoginScript,
  fillNewPasswordScript,
  fillOtpScript,
  pageString,
  USERNAME_JS,
  VAULT_CHIP_CLOSE_JS,
  vaultChipScript,
  vaultNoteScript,
} from "@/lib/vault"

const ROW = "flex items-center gap-2 px-2 py-1 text-xs"

/** Run a fill script in the page and register what it put there for redaction. */
async function fill(
  js: string,
  secret: string,
  evalInPage: (js: string) => Promise<string>,
): Promise<FillResult> {
  const raw = await evalInPage(js)
  const res = (JSON.parse(raw || "null") as FillResult | null) ?? { ok: false }
  if (res.ok) usePreview.getState().addSecret(secret)
  return res
}

export function VaultBar({
  url,
  evalInPage,
  onClose,
}: {
  url: string
  evalInPage: (js: string) => Promise<string>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [items, setItems] = useState<VaultItem[] | null>(null)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // The login we just filled. The strip used to close itself the moment a fill
  // landed, which took the one-time code with it — the second half of the login
  // it had just started. It stays; this is what it points at.
  const [filled, setFilled] = useState<string | null>(null)
  // The chip is drawn in the page itself — over it, where the login form is. The
  // strip is what's left for what the chip can't do (no CLI, a locked vault,
  // saving a new login) and for a page the bridge couldn't reach.
  const [chip, setChip] = useState(false)
  const pick = usePreview((s) => s.vaultPick)

  // The vault answers by *host*: `vault_lookup` resolves the URL to its host and
  // ranks stored logins against that, so every URL on one site asks the same
  // question and gets the same answer. Keyed on the full URL, this re-ran at each
  // step of a sign-in (email → password → 2FA) — and each run spawns one password
  // manager CLI process per stored login, every one of which makes macOS ask
  // "Reado would like to access data from other apps". That is how one login
  // turned into a stream of system dialogs.
  const origin = useMemo(() => originOf(url), [url])

  // Ask the backend what it is and what it has for this site. Re-runs when the
  // site changes, so the list is never about the previous origin.
  useEffect(() => {
    let alive = true
    void (async () => {
      const s = await vaultStatus()
      if (!alive) return
      setStatus(s)
      if (!s.backend || s.locked) return setItems(null)
      try {
        const found = await vaultLookup(origin)
        if (alive) setItems(found)
      } catch (e) {
        if (alive) setNote(String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [origin])

  const guard = async (run: () => Promise<void>) => {
    setBusy(true)
    setNote(null)
    try {
      await run()
    } catch (e) {
      setNote(String(e))
    } finally {
      setBusy(false)
    }
  }

  const report = (res: FillResult, item?: VaultItem) => {
    const text = res.ok
      ? t(item?.hasOtp ? "vault.filledThenOtp" : "vault.filled")
      : t(`vault.missing.${res.missing ?? "password"}`)
    if (res.ok) setFilled(item?.id ?? null)
    setNote(text)
    // Say it where the user is looking, which is the page, not the strip.
    if (chip) void evalInPage(vaultNoteScript(text)).catch(() => {})
  }

  /** Fetch this login's password and put it in the form. */
  const fillLogin = (it: VaultItem) =>
    guard(async () => {
      // One read, one approval prompt — and the only place the item's own fields
      // are seen. 1Password's list says a title and an account name; whether the
      // login also carries a one-time code is learned here, so fold it back into
      // the list (before the fill, so the chip redraws before the note lands).
      const { username, password, hasOtp } = await vaultSecret(it.id)
      const full = { ...it, username: username || it.username, hasOtp }
      if (full.hasOtp !== it.hasOtp || full.username !== it.username)
        setItems((prev) => prev?.map((i) => (i.id === it.id ? full : i)) ?? prev)
      report(await fill(fillLoginScript(full.username, password), password, evalInPage), full)
    })

  /** Fetch this login's current one-time code and put it in the form. */
  const fillCode = (it: VaultItem) =>
    guard(async () => {
      const code = await vaultOtp(it.id)
      report(await fill(fillOtpScript(code), code, evalInPage))
    })

  // Draw the chip in the page whenever there is something to offer, and take it
  // down when this strip goes away — a credential prompt must not outlive the
  // pane that owns it. `vault()` answers false on a page the bridge never
  // reached (it hasn't loaded yet, or it's a blank tab); the strip stays then.
  // Plain strings, not `t` itself: the translator is a fresh function on every
  // render, and a chip redrawn on every render is one that flickers and fights
  // whatever the user is doing in it.
  const chipTitle = t("vault.chipTitle")
  const otpLabel = t("vault.otp")
  useEffect(() => {
    if (!items?.length) return setChip(false)
    let alive = true
    void evalInPage(vaultChipScript(items, chipTitle, otpLabel))
      .then((raw) => alive && setChip(raw === "true"))
      .catch(() => alive && setChip(false))
    return () => {
      alive = false
      void evalInPage(VAULT_CHIP_CLOSE_JS).catch(() => {})
    }
  }, [items, evalInPage, chipTitle, otpLabel])

  // A click in the chip. It comes back through the capture bridge, so this is
  // where it turns into the same fill the strip's own buttons do.
  useEffect(() => {
    if (!pick) return
    usePreview.getState().setVaultPick(null)
    if (pick.kind === "close") return onClose()
    const it = items?.find((i) => i.id === pick.id)
    if (!it) return
    void (pick.kind === "otp" ? fillCode(it) : fillLogin(it))
    // `fillLogin`/`fillCode` are rebuilt each render; the pick identity is what
    // gates this, and acting on it twice would fetch the credential twice.
  }, [pick])

  const body = () => {
    if (!status) return <span className="text-faint">{t("vault.checking")}</span>
    if (!status.backend)
      return (
        <>
          <span className="min-w-0 flex-1 text-muted">{t("vault.noBackend")}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              // Where the CLI is listed, with the install command for this OS.
              const w = useWorkspace.getState()
              if (w.tool !== "extensions") w.selectTool("extensions")
            }}
          >
            {t("vault.openExtensions")}
          </Button>
        </>
      )
    if (status.locked)
      return (
        <>
          <span className="text-muted">{t("vault.locked")}</span>
          <input
            type="password"
            value={password}
            autoComplete="off"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              void guard(async () => {
                const { vaultUnlock } = await import("@/lib/api")
                await vaultUnlock(password)
                setPassword("")
                setStatus(await vaultStatus())
                setItems(await vaultLookup(origin))
              })
            }}
            aria-label={t("vault.masterPassword")}
            className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
          />
        </>
      )
    return (
      <>
        {items?.length ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {items.map((it) => (
              // One credential, two actions: a single bordered shell with a
              // divider, so the code button can't read as a different control at
              // a different size from the login it belongs to.
              <span
                key={it.id}
                className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-line"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-w-0 rounded-none"
                  disabled={busy}
                  onClick={() => void fillLogin(it)}
                >
                  <span className="truncate">{it.title}</span>
                  {it.username && <span className="truncate text-faint">{it.username}</span>}
                </Button>
                {it.hasOtp && (
                  <Button
                    size="sm"
                    variant={filled === it.id ? "primary" : "ghost"}
                    className="rounded-none border-line border-l"
                    disabled={busy}
                    onClick={() => void fillCode(it)}
                  >
                    {t("vault.otp")}
                  </Button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 text-muted">{t("vault.noMatch")}</span>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void guard(async () => {
              const host = new URL(url).host
              const username = pageString(await evalInPage(USERNAME_JS))
              const generated = await vaultCreate(url, host, username)
              report(await fill(fillNewPasswordScript(generated), generated, evalInPage))
            })
          }
        >
          {t("vault.create")}
        </Button>
      </>
    )
  }

  // The chip is up and carries the whole offer: a second copy in the chrome is
  // just the small, dim thing it was meant to replace.
  if (chip) return null

  return (
    <div className={`${ROW} flex-none border-b border-line bg-surface`}>
      {body()}
      {note && <span className="truncate text-marker">{note}</span>}
      <IconButton
        size="sm"
        label={t("vault.close")}
        icon={<CloseIcon className="h-3 w-3" />}
        onClick={onClose}
      />
    </div>
  )
}

/**
 * The agent asked to act on a page that holds a credential. Its command was
 * already refused — this is the user deciding whether the *next* one runs, with
 * the consequence spelled out rather than implied.
 */
export function AccessRequest({ url }: { url: string }) {
  const { t } = useTranslation()
  const grantPage = usePreview((s) => s.grantPage)
  const setAccessRequest = usePreview((s) => s.setAccessRequest)
  return (
    <div className={`${ROW} flex-none border-b border-line bg-surface`}>
      <span className="min-w-0 flex-1 text-ink">{t("vault.accessRequest")}</span>
      <Button size="sm" variant="secondary" onClick={() => setAccessRequest(null)}>
        {t("vault.deny")}
      </Button>
      <Button size="sm" variant="primary" onClick={() => grantPage(url)}>
        {t("vault.grant")}
      </Button>
    </div>
  )
}

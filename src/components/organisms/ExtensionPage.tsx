/**
 * An extension's own page, in the editor area.
 *
 * A row in a sidebar can hold a name, a publisher and two lines of blurb. It
 * cannot hold the thing that actually decides whether you want an extension:
 * what it looks like, what it covers, what its author had to say about it. That
 * lives in the README, and until now the only way to read one was to leave the
 * app.
 *
 * The page is deliberately the same shape whether the extension is installed or
 * not — the actions change, the reading does not.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import {
  BitwardenIcon,
  CheckIcon,
  CloseIcon,
  OnePasswordIcon,
  SealCheckIcon,
} from "@/components/atoms/icons"
import { ovsxReadme } from "@/lib/api"
import { currentOS, installCmd, VAULTS, type VaultExt } from "@/lib/extensions"
import { markdownRehype, markdownRemark, markdownUrlTransform } from "@/lib/markdown"
import { useMarketplace } from "@/lib/marketplace"
import { notify } from "@/lib/notice"
import { useWorkspace } from "@/lib/store"
import { vaultGuide } from "@/lib/vaultGuide"
import { Activate } from "./extensions/Activate"
import { EnableToggle } from "./extensions/EnableToggle"
import { compact, ExtensionIcon } from "./extensions/ExtensionRow"
import { ReloadNotice } from "./extensions/ReloadNotice"
import {
  curatedInfo,
  runInstall,
  useFormatterStatus,
  useLinuxPm,
  useServerStatus,
  useVaultStatus,
} from "./extensions/useCurated"

export function ExtensionPage() {
  const { t } = useTranslation()
  const reading = useWorkspace((s) => s.readingExtension)
  const listing = reading?.kind === "registry" ? reading.listing : undefined
  const close = useWorkspace((s) => s.readExtension)
  const installedAll = useMarketplace((s) => s.installed)
  const busy = useMarketplace((s) => s.busy)
  const latest = useMarketplace((s) => s.latest)

  // Hooks run for every render, so the curated branch below is chosen after
  // them, not instead of them.
  const [readme, setReadme] = useState<string | null>(null)
  // The reason, not just the fact: "no README published" and "the registry is
  // unreachable" want different things from the reader.
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (reading?.kind !== "registry") return
    let live = true
    setReadme(null)
    setFailed(null)
    ovsxReadme(reading.namespace, reading.name, reading.version)
      .then((md) => {
        if (live) setReadme(md)
      })
      .catch((e) => {
        if (live) setFailed(String(e))
      })
    return () => {
      live = false
    }
  }, [reading])

  // Escape closes it, like every other full-area view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  if (!reading) return null
  if (reading.kind === "curated") {
    const vault = VAULTS.find((v) => v.id === reading.id)
    return vault ? <VaultPage def={vault} /> : <CuratedPage id={reading.id} />
  }
  const id = `${reading.namespace}.${reading.name}`
  const installed = installedAll.find((e) => e.id === id)
  const updateTo = latest[id] && latest[id] !== installed?.version ? latest[id] : undefined
  const working = busy.includes(id)
  const title = installed?.displayName ?? listing?.displayName ?? reading.name

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-canvas">
      <header className="flex flex-none items-start gap-3 border-b border-line px-6 py-4">
        <ExtensionIcon icon={listing?.icon} name={title} size={12} />

        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-lg font-semibold text-ink">{title}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
            <span className="truncate">{reading.namespace}</span>
            {listing?.verified && (
              <SealCheckIcon className="h-3 w-3 flex-none text-ok" aria-label={t("ext.verified")} />
            )}
            {listing?.downloadCount ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {t("ext.downloads", { n: compact(listing.downloadCount) })}
                </span>
              </>
            ) : null}
            {installed && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">v{installed.version}</span>
              </>
            )}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {working ? (
              <span className="animate-pulse text-xs text-faint">
                {t(installed ? "ext.uninstalling" : "ext.installing")}
              </span>
            ) : installed ? (
              <>
                {updateTo && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      void useMarketplace
                        .getState()
                        .install({ ...installed, version: updateTo })
                        .catch((e) =>
                          notify(
                            "error",
                            t("ext.installFailed", { name: title, error: String(e) }),
                          ),
                        )
                    }
                  >
                    {t("ext.updateTo", { version: updateTo })}
                  </Button>
                )}
                <Activate ext={installed} />
                {/* Same switch as on the row, in the place you land when you
                    clicked through to decide about this extension. */}
                <EnableToggle id={installed.id} />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    void useMarketplace
                      .getState()
                      .uninstall(reading.namespace, reading.name)
                      .then(() => close(null))
                  }
                >
                  {t("ext.uninstall")}
                </Button>
              </>
            ) : listing ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void useMarketplace
                    .getState()
                    .install(listing)
                    .catch((e) =>
                      notify("error", t("ext.installFailed", { name: title, error: String(e) })),
                    )
                }
              >
                {t("ext.install")}
              </Button>
            ) : null}
          </div>
        </div>

        <IconButton label={t("settings.close")} icon={<CloseIcon />} onClick={() => close(null)} />
      </header>

      <ReloadNotice />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="prose-reado mx-auto max-w-[72ch]">
          {failed ? (
            <p className="text-sm leading-relaxed text-muted">
              {t("ext.readmeFailed")} <span className="text-faint">{failed}</span>
            </p>
          ) : readme === null ? (
            <p className="text-sm text-faint">{t("common.loading")}</p>
          ) : (
            // A published README is Markdown with raw HTML in it — badge rows,
            // centred headings — so it goes through the same pipeline as the
            // project's own docs rather than a stricter one that would show the
            // tags as text.
            <ReactMarkdown
              remarkPlugins={markdownRemark}
              rehypePlugins={markdownRehype}
              urlTransform={markdownUrlTransform}
            >
              {readme}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The page for one of Reado's own tools.
 *
 * No README — these are not packages — but everything a reader wants before
 * deciding: what it adds, whether this project asks for it, what it needs, and
 * the exact command that installs it, shown rather than hidden behind a button.
 */
function CuratedPage({ id }: { id: string }) {
  const { t } = useTranslation()
  const close = useWorkspace((s) => s.readExtension)
  const linuxPm = useLinuxPm()
  const servers = useServerStatus()
  const { status: formatters } = useFormatterStatus()

  const info = curatedInfo(id, servers.installed, formatters, linuxPm)
  if (!info) return null
  const { def, formatter, installed, cmd, declared } = info

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-canvas">
      <header className="flex flex-none items-start gap-3 border-b border-line px-6 py-4">
        <ExtensionIcon name={def.name} size={12} />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-lg font-semibold text-ink">{def.name}</h1>
          <p className="mt-0.5 text-xs text-faint">
            {t("ext.curated")} ·{" "}
            {t("ext.contributes", {
              kinds: formatter ? t("ext.kindFormatter") : t("ext.kindServer"),
            })}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {installed ? (
              <>
                <span className="flex items-center gap-1 text-xs text-ok">
                  <CheckIcon className="h-3.5 w-3.5" />
                  {t("ext.installed")}
                </span>
                <EnableToggle id={id} />
              </>
            ) : cmd ? (
              <Button variant="primary" size="sm" onClick={() => runInstall(cmd)}>
                {t("ext.install")}
              </Button>
            ) : (
              <span className="text-xs text-faint">{t("ext.manual")}</span>
            )}
          </div>
        </div>
        <IconButton label={t("settings.close")} icon={<CloseIcon />} onClick={() => close(null)} />
      </header>

      <ReloadNotice />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-[72ch] flex-col gap-5">
          <p className="text-sm leading-relaxed text-ink">{def.description}</p>

          {formatter && (
            <p className="text-sm leading-relaxed text-muted">
              {declared ? (
                <span className="text-ok">{t("ext.declared")}</span>
              ) : (
                <>
                  {t("ext.notDeclared")} — {t("ext.declaredByHint", { what: formatter.declaredBy })}
                </>
              )}
            </p>
          )}

          {def.requires && (
            <p className="text-sm text-muted">{t("ext.requires", { name: def.requires })}</p>
          )}

          {cmd && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-faint">{t("ext.installCommand")}</span>
              {/* Shown, not hidden behind the button: it runs in your terminal
                  with your package manager, and you should see what that is. */}
              <code className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink">
                {cmd}
              </code>
            </div>
          )}

          <p className="text-xs leading-relaxed text-faint">{t("ext.curatedWhy")}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * The page for a password manager's CLI.
 *
 * These have no README to fetch — they are a vendor's binary, not a package — and
 * the questions someone arrives with aren't answered by a description anyway:
 * *what is this for, why not the browser extension I already use, and what does
 * Reado do with my password once it has it.* So Reado writes the page itself.
 */
function VaultPage({ def }: { def: VaultExt }) {
  const { t, i18n } = useTranslation()
  const close = useWorkspace((s) => s.readExtension)
  const linuxPm = useLinuxPm()
  const vaults = useVaultStatus()
  const installed = Boolean(vaults.installed[def.id])
  const cmd = installCmd(def, currentOS(), linuxPm)
  const Mark = def.id === "op" ? OnePasswordIcon : BitwardenIcon

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-canvas">
      <header className="flex flex-none items-start gap-3 border-b border-line px-6 py-4">
        <ExtensionIcon icon={<Mark className="h-8 w-8" />} name={def.name} size={12} />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-lg font-semibold text-ink">{def.name}</h1>
          <p className="mt-0.5 text-xs text-faint">
            {t("ext.curated")} · {t("ext.contributes", { kinds: t("ext.kindVault") })}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {installed ? (
              <span className="flex items-center gap-1 text-xs text-ok">
                <CheckIcon className="h-3.5 w-3.5" />
                {t("ext.installed")}
              </span>
            ) : cmd ? (
              <Button variant="primary" size="sm" onClick={() => runInstall(cmd)}>
                {t("ext.install")}
              </Button>
            ) : (
              <span className="text-xs text-faint">{t("ext.manual")}</span>
            )}
          </div>
        </div>
        <IconButton label={t("settings.close")} icon={<CloseIcon />} onClick={() => close(null)} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="prose-reado mx-auto max-w-[72ch]">
          <ReactMarkdown remarkPlugins={markdownRemark} rehypePlugins={markdownRehype}>
            {vaultGuide(def.id, i18n.language)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

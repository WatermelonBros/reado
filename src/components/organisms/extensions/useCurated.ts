/**
 * The curated half of the catalogue: language servers and formatters.
 *
 * Both spawn a process, so neither can come from an open registry — the command
 * is chosen from a compiled allowlist and these lists are what name them. What
 * the panel needs from here is their standing on this machine and in this
 * project, so it can put them in the same list as everything else.
 */
import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useState } from "react"
import { t } from "@/i18n"
import {
  agentInstalled,
  type FormatterStatus,
  formatterStatus,
  linuxPackageManager,
  lspInstalled,
  lspInstalledAll,
  ptyKill,
  ptySpawn,
  submitToTerminal,
} from "@/lib/api"
import {
  currentOS,
  FORMATTERS,
  type FormatterExt,
  installCmd,
  LANG_SERVERS,
  type LangServerExt,
  type LinuxPm,
  VAULTS,
} from "@/lib/extensions"
import { createLogger } from "@/lib/logger"
import { refreshLspServers } from "@/lib/lsp"
import { notify } from "@/lib/notice"
import { useProject } from "@/lib/store"
import { offSafe } from "@/lib/terminals"

const log = createLogger("extensions")

/** What an install is meant to produce, so Reado can check that it did. */
export interface InstallTarget {
  kind: "server" | "formatter" | "vault"
  id: string
  /** Shown in the toasts. */
  name: string
}

/** Numbers the hidden install shells (no `Date.now`/`Math.random`). */
let installSeq = 0

/** Give up on an install that has produced no exit after this long, rather than
 *  leaving a PTY running forever behind a toast that never resolves. */
const INSTALL_TIMEOUT_MS = 15 * 60_000

/**
 * Install a curated tool in a PTY the user never sees.
 *
 * This used to type the command into the integrated terminal and reveal the
 * pane, which made installing an extension the user's errand: their terminal
 * hijacked, a command they have to watch scroll. Reado already has a shell — it
 * can run its own installs. What the user gets is a toast when it starts and one
 * when it lands; the output goes to the log, which is where a failed install is
 * worth reading.
 *
 * Success is decided by looking for the tool afterwards, not by parsing shell
 * output: `pty-exit` carries no status, and every shell reports one differently.
 */
export function runInstall(cmd: string, target?: InstallTarget): void {
  const id = `install-${++installSeq}`
  const name = target?.name ?? cmd
  notify("info", t("ext.curatedInstalling", { name }))

  // The tail of what the install printed — the only diagnostic left once the
  // terminal is hidden, so it goes to the log when the tool doesn't appear.
  let tail = ""
  const unOut = listen<string>(`pty-output-${id}`, (e) => {
    tail = (tail + decodeOutput(e.payload)).slice(-4000)
  })
  let done = false
  const finish = async () => {
    if (done) return
    done = true
    offSafe(unOut)
    offSafe(unExit)
    clearTimeout(timer)
    void ptyKill(id).catch(() => {})
    // The machine changed under every cached probe, whatever the outcome.
    forgetServerProbe()
    // Including the editor's own: a freshly installed server attaches to the file
    // that is already open, rather than to the next window.
    refreshLspServers()
    if (!target) return
    const ok = await verifyInstalled(target)
    if (ok) {
      notify("success", t("ext.curatedInstalled", { name }))
      return
    }
    log.error("install failed", { id: target.id, cmd, output: tail })
    notify("error", t("ext.curatedInstallFailed", { name }))
  }
  const unExit = listen(`pty-exit-${id}`, () => void finish())
  const timer = setTimeout(() => void finish(), INSTALL_TIMEOUT_MS)

  ptySpawn(id, useProject.getState().root || ".", 24, 200)
    .then(() => {
      // `exit` closes the shell when the install returns, which is what fires
      // `pty-exit`; it is spelled the same in every shell Reado can be pointed at.
      submitToTerminal(id, cmd, 200)
      submitToTerminal(id, "exit", 400)
    })
    .catch((e) => {
      log.error("install shell failed to start", { cmd, error: String(e) })
      void finish()
    })
  // The row stops saying "Install" as the tool appears, without waiting for the
  // shell to close (a package manager can linger after the binary is in place).
  for (const after of REPROBE_MS) {
    setTimeout(() => {
      forgetServerProbe()
      refreshLspServers()
    }, after)
  }
}

/** PTY output arrives base64-encoded (it is bytes, not text, on the wire). */
const decodeOutput = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))

/** Is the thing the install was for actually here now? */
async function verifyInstalled(target: InstallTarget): Promise<boolean> {
  try {
    if (target.kind === "server") return await lspInstalled(target.id, useProject.getState().root)
    // A vault's id is its CLI's name; formatters are looked up by rule id.
    if (target.kind === "vault") return await agentInstalled(target.id)
    const status = await formatterStatus(useProject.getState().root)
    return Boolean(status.find((f) => f.id === target.id)?.installed)
  } catch {
    return false
  }
}

/** When to look again after an install command was submitted. */
const REPROBE_MS = [4_000, 12_000, 30_000, 60_000]

/** The Linux package manager, probed once — install commands differ by distro. */
export function useLinuxPm(): LinuxPm | null {
  const [pm, setPm] = useState<LinuxPm | null>(null)
  useEffect(() => {
    if (currentOS() === "linux")
      linuxPackageManager()
        .then((v) => setPm(v as LinuxPm | null))
        .catch(() => {})
  }, [])
  return pm
}

/** The last probe, shared across mounts. */
let probed: Record<string, boolean> | null = null

/** Mounted status hooks, so forgetting the probe re-reads it where it is on
 *  screen instead of only on the next mount. */
const watchers = new Set<() => void>()

/** Forget it — called after an install command runs, since the machine just
 *  changed under the answer we cached. Formatters are re-read too: the same
 *  command can install one. */
export function forgetServerProbe(): void {
  probed = null
  for (const recheck of watchers) recheck()
}

/** Re-run `recheck` whenever the machine may have changed under us. */
function useProbeWatcher(recheck: () => void): void {
  useEffect(() => {
    watchers.add(recheck)
    return () => {
      watchers.delete(recheck)
    }
  }, [recheck])
}

/** Which language servers resolve on the user's real (login-shell) PATH. */
export function useServerStatus() {
  const [installed, setInstalled] = useState<Record<string, boolean>>(probed ?? {})
  const [checking, setChecking] = useState(false)

  const recheck = useCallback(() => {
    setChecking(true)
    lspInstalledAll(useProject.getState().root)
      .then((pairs) => {
        probed = Object.fromEntries(pairs)
        setInstalled(probed)
      })
      .catch(() => setInstalled({}))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    // Probing walks the login-shell PATH once per server; the answer doesn't
    // change while the app runs unless the user installs something, and the
    // re-check button is how they say so. Remount reads instead of re-probing.
    if (probed) setInstalled(probed)
    else recheck()
  }, [recheck])
  useProbeWatcher(recheck)

  return { installed, checking, recheck }
}

/** Which formatters are installed, and which the open project declares. */
export function useFormatterStatus() {
  const root = useProject((s) => s.root)
  const [status, setStatus] = useState<Record<string, FormatterStatus>>({})

  const recheck = useCallback(() => {
    if (!root) return setStatus({})
    formatterStatus(root)
      .then((list) => setStatus(Object.fromEntries(list.map((s) => [s.id, s]))))
      .catch(() => setStatus({}))
  }, [root])

  useEffect(() => {
    recheck()
  }, [recheck])
  useProbeWatcher(recheck)

  return { status, recheck }
}

/**
 * Which password-manager CLIs resolve on the user's real PATH.
 *
 * The same login-shell probe every other tool uses (`agent_installed`): someone
 * with the Bitwarden *app* installed has no CLI, and that is exactly the case the
 * Extensions list has to be honest about.
 */
export function useVaultStatus() {
  const [installed, setInstalled] = useState<Record<string, boolean>>({})

  const recheck = useCallback(() => {
    Promise.all(VAULTS.map((v) => agentInstalled(v.id).catch(() => false)))
      .then((flags) => setInstalled(Object.fromEntries(VAULTS.map((v, i) => [v.id, flags[i]]))))
      .catch(() => setInstalled({}))
  }, [])

  useEffect(() => {
    recheck()
  }, [recheck])
  useProbeWatcher(recheck)

  return { installed, recheck }
}

/**
 * One curated tool's standing, derived once.
 *
 * The row and the page were each working this out for themselves — which
 * formatter or server the id names, whether it's installed, its install command,
 * whether the project declares it — and had already drifted on which controls a
 * kind gets. Deriving it here is what keeps them agreeing.
 */
export interface CuratedInfo {
  def: FormatterExt | LangServerExt
  formatter?: FormatterExt
  installed: boolean
  /** The command that installs it on this OS, when there is a clean one. */
  cmd?: string
  /** Whether the open project asks for it. Formatters only. */
  declared?: boolean
}

export function curatedInfo(
  id: string,
  servers: Record<string, boolean>,
  formatters: Record<string, FormatterStatus>,
  linuxPm: LinuxPm | null,
): CuratedInfo | null {
  const formatter = FORMATTERS.find((f) => f.id === id)
  const def = formatter ?? LANG_SERVERS.find((s) => s.id === id)
  if (!def) return null
  return {
    def,
    formatter,
    installed: formatter ? Boolean(formatters[id]?.installed) : Boolean(servers[id]),
    cmd: installCmd(def, currentOS(), linuxPm),
    declared: formatter ? formatters[id]?.declared : undefined,
  }
}

/**
 * The curated half of the catalogue: language servers and formatters.
 *
 * Both spawn a process, so neither can come from an open registry — the command
 * is chosen from a compiled allowlist and these lists are what name them. What
 * the panel needs from here is their standing on this machine and in this
 * project, so it can put them in the same list as everything else.
 */
import { useCallback, useEffect, useState } from "react"
import {
  type FormatterStatus,
  formatterStatus,
  linuxPackageManager,
  lspInstalledAll,
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
} from "@/lib/extensions"
import { useProject } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** Run an install command in the integrated terminal, so the user sees exactly
 *  what happens and their own package manager does it. */
export function runInstall(cmd: string) {
  const term = useTerminals.getState()
  const id = term.activeId ?? term.add()
  // Reveal it. `add()` opens the panel, but reusing an existing pane didn't, so
  // clicking Install with the terminal closed ran the command out of sight and
  // looked like the button had done nothing at all.
  term.toggle(true)
  term.setActive(id)
  submitToTerminal(id, cmd, id === term.activeId ? 0 : 400)
  // The command runs in a shell that reports to nobody, so there is no
  // completion to await. Re-probe on a short bounded schedule instead: a small
  // install lands in seconds, a large one within the last window, and either way
  // the row stops saying "Install" on its own rather than waiting for a manual
  // re-check.
  for (const after of REPROBE_MS) setTimeout(forgetServerProbe, after)
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
    lspInstalledAll()
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

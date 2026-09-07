/** Cross-cutting React hooks: theme application and global keyboard shortcuts. */

import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { t } from "@/i18n"
import { OVERRIDDEN_TOKENS, tokensFor } from "./colorVision"
import { toRelative } from "./comments"
import { formatDocument, nextProblem, prevProblem } from "./docInfo"
import { useExtensions } from "./extensions"
import { allIconThemes, useIconTheme } from "./extIcons"
import { applyExtTheme, clearExtTheme } from "./extThemes"
import { useFileUndo } from "./fileUndo"
import { enabledExtensions, useMarketplace } from "./marketplace"
import { notify } from "./notice"
import { toggleDockArea } from "./panels"
import { useReadProgress } from "./readProgress"
import { isMacUA } from "./shortcuts"
import {
  type BuiltinTheme,
  isExtTheme,
  type ThemeName,
  toggleZenMode,
  useEditorActions,
  usePalette,
  useProject,
  useSettings,
  useWorkspace,
} from "./store"
import { useTerminals } from "./terminals"
import { checkForUpdates } from "./updater"
import { toggleFullscreen } from "./window"

/** Toggle the read/unread state of the active file (⌘⌥R). Read progress is keyed
 *  by project-relative path, so convert the absolute active path first. */
function toggleActiveRead(): void {
  const { root, active } = useProject.getState()
  if (!active) return
  const rel = toRelative(root, active)
  const isRead = useReadProgress.getState().read.has(rel)
  useReadProgress.getState().mark(root, rel, !isRead)
}

/** The dark Reado themes — used to match the native window (title bar) chrome. */
const DARK_THEMES: BuiltinTheme[] = ["reado-dark", "reado-high-contrast"]

/** Resolve the active theme from settings, OS preference and time of day. */
function resolveTheme(
  mode: string,
  theme: ThemeName,
  lightTheme: ThemeName,
  darkTheme: ThemeName,
): ThemeName {
  if (mode === "manual") return theme
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? darkTheme : lightTheme
  }
  // "auto" — Trust Reado: light during the day, dark in the evening/night.
  const hour = new Date().getHours()
  return hour >= 7 && hour < 19 ? lightTheme : darkTheme
}

/** Put the colour-vision mode on <html>, beside the theme rather than instead of
 *  it: the tokens it overrides are a small, meaning-carrying subset, so a reader
 *  keeps the theme they chose and gets a diff they can read. */
export function useApplyColorVision(): void {
  const mode = useSettings((s) => s.colorVision)
  useEffect(() => {
    const root = document.documentElement
    // Clear first: switching modes must not leave the previous one's tokens
    // behind, and "normal" means the theme's own palette, untouched.
    for (const name of OVERRIDDEN_TOKENS) root.style.removeProperty(`--${name}`)
    for (const [name, value] of Object.entries(tokensFor(mode))) {
      root.style.setProperty(`--${name}`, value)
    }
    // Also exposed as an attribute, so CSS can react to the mode itself rather
    // than only to the colours (a rule may want a different border, say).
    if (mode === "normal") root.removeAttribute("data-color-vision")
    else root.dataset.colorVision = mode
  }, [mode])
}

/** Keep the chosen icon theme loaded, and drop it when its extension goes away. */
export function useApplyIconTheme(): void {
  const chosen = useSettings((s) => s.iconTheme)
  const installed = useMarketplace((s) => s.installed)
  // Switching an extension off has to take effect now, not at the next restart:
  // the filter runs inside the effect, so the effect has to watch it.
  const disabled = useExtensions((s) => s.disabled)

  useEffect(() => {
    const theme = chosen
      ? allIconThemes(enabledExtensions(installed)).find((t) => t.id === chosen)
      : null
    // A theme whose extension was removed resolves to null, which is also how
    // "use Reado's own glyphs" is expressed — the tree just goes back to them.
    if (useIconTheme.getState().theme?.id !== theme?.id)
      void useIconTheme.getState().load(theme ?? null)
  }, [chosen, installed, disabled])
}

/** Apply the resolved theme to <html> and keep it live (system + time of day). */
export function useApplyTheme(): void {
  const { mode, theme, lightTheme, darkTheme } = useSettings()
  // Same reason as the icon theme: the enabled filter lives inside the effect.
  const disabledExtensions = useExtensions((s) => s.disabled)
  // Re-apply when the installed extensions arrive: at first paint the chosen
  // theme may be one Reado hasn't read off disk yet.
  const installed = useMarketplace((s) => s.installed)

  useEffect(() => {
    // Match the native window chrome (notably the Windows title bar, which is
    // otherwise the default light bar even under a dark theme).
    const matchChrome = (base: BuiltinTheme) => {
      getCurrentWindow()
        .setTheme(DARK_THEMES.includes(base) ? "dark" : "light")
        .catch(() => {})
    }
    const applyBuiltin = (name: BuiltinTheme) => {
      clearExtTheme()
      document.documentElement.dataset.theme = name
      matchChrome(name)
    }
    const apply = () => {
      const resolved = resolveTheme(mode, theme, lightTheme, darkTheme)
      if (!isExtTheme(resolved)) return applyBuiltin(resolved)
      // A contributed theme paints over a built-in base, so anything it doesn't
      // specify still has a coherent value. If its extension is gone, fall back
      // to that base rather than leaving the interface half-themed.
      void applyExtTheme(resolved).then((base) => {
        if (base) return matchChrome(base)
        // Its extension was uninstalled or disabled. Its polarity went with it,
        // so fall back to the one the machine asks for, and say so.
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
        applyBuiltin(dark ? "reado-dark" : "reado-light")
        // Only once the installed set is known: before that, "missing" is a
        // race with the first read from disk, not a fact about the user's setup.
        if (useMarketplace.getState().loaded) notify("info", t("theme.extMissing"))
      })
    }
    apply()

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", apply)
    // Re-evaluate the time-of-day theme once a minute in "auto" mode.
    const timer = mode === "auto" ? window.setInterval(apply, 60_000) : undefined
    return () => {
      mq.removeEventListener("change", apply)
      if (timer) clearInterval(timer)
    }
  }, [mode, theme, lightTheme, darkTheme, installed, disabledExtensions])
}

/** Periodically check for updates while the app stays open, plus when the window
 * regains focus, so the update prompt appears without needing a restart. */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    const INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours
    const THROTTLE_MS = 30 * 60 * 1000 // at most once per 30 min (focus churn)
    let last = 0
    const run = () => {
      const now = Date.now()
      if (now - last < THROTTLE_MS) return
      last = now
      void checkForUpdates(false)
    }
    // First check shortly after launch (covers project windows, which otherwise
    // never checked), then on an interval and whenever the window is refocused.
    const initial = window.setTimeout(run, 4000)
    const interval = window.setInterval(run, INTERVAL_MS)
    window.addEventListener("focus", run)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener("focus", run)
    }
  }, [])
}

/** Apply the interface zoom factor to the document. */
export function useApplyZoom(): void {
  const zoom = useSettings((s) => s.zoom)
  useEffect(() => {
    // Zoom only the content area (it consumes `--app-zoom`), leaving the title
    // bar — a sibling above it — fixed. Not the webview (its native zoom can't be
    // excluded) nor the document root (that scales the title bar too).
    document.documentElement.style.setProperty("--app-zoom", String(zoom))
  }, [zoom])
}

/** Damp non-essential UI motion. "system" follows the OS `prefers-reduced-motion`;
 *  the choice sets `data-reduce-motion` on the root, which the CSS honours by
 *  collapsing decorative transitions/animations. */
export function useApplyReduceMotion(): void {
  const mode = useSettings((s) => s.reduceMotion)
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => {
      const reduce = mode === "on" || (mode === "system" && mql.matches)
      document.documentElement.toggleAttribute("data-reduce-motion", reduce)
    }
    apply()
    if (mode !== "system") return
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [mode])
}

/** Keep global preferences in sync across windows. zustand `persist` writes to
 *  localStorage (shared per origin), but an already-open window won't see another
 *  window's change until it re-reads. The `storage` event fires in *other*
 *  windows on every write, so rehydrating the matching store there applies the
 *  change live — e.g. switching theme or toggling a setting updates every window.
 *  (Per-window UI like the sidebar tool and terminal layout are intentionally
 *  not synced.) */
export function useCrossWindowSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "reado.settings") void useSettings.persist.rehydrate()
      else if (e.key === "reado.extensions") void useExtensions.persist.rehydrate()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
}

/** Interface zoom bounds. */
const ZOOM_MIN = 0.6
const ZOOM_MAX = 2
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10))

/** Bind Reado's global keyboard shortcuts. */
export function useGlobalShortcuts(): void {
  const open = usePalette((s) => s.open)
  const toggleSettings = usePalette((s) => s.toggleSettings)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Format Document (Shift+Alt+F), like VS Code — not a Cmd/Ctrl shortcut.
      if (e.shiftKey && e.altKey && e.code === "KeyF") {
        e.preventDefault()
        void formatDocument()
        return
      }
      // Full screen on Windows/Linux, where ⌃⌘F doesn't exist and Ctrl+F is
      // Find. macOS gets ⌃⌘F below; F11 works there too, and costs nothing.
      if (e.key === "F11") {
        e.preventDefault()
        toggleFullscreen()
        return
      }
      // Next / previous problem (F8 / Shift+F8), like VS Code — no modifier.
      if (e.key === "F8") {
        e.preventDefault()
        if (e.shiftKey) prevProblem()
        else nextProblem()
        return
      }
      // Toggle word wrap (⌥Z), like VS Code. `e.code`, not `e.key`: with Option
      // held macOS composes (⌥Z is "Ω"). Checked before the modifier block, and
      // guarded against ⌥⌘Z (zen mode) below.
      if (e.code === "KeyZ" && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const s = useSettings.getState()
        s.set({ wrap: !s.wrap })
        return
      }
      // Ctrl+Tab / Ctrl+Shift+Tab cycle the open tabs — Ctrl on macOS too,
      // matching editors, so it is checked before the Cmd-only gate below.
      if (e.ctrlKey && e.key.toLowerCase() === "tab") {
        e.preventDefault()
        useProject.getState().cycleTab(e.shiftKey ? -1 : 1)
        return
      }
      // The command modifier: Cmd on macOS, Ctrl elsewhere. Never "either" —
      // macOS gives Ctrl+A/E/K/P/N to the editor (readline-style motion) and to
      // the terminal (tmux's prefix, kill-line, history), and claiming those for
      // workbench commands broke both.
      const mod = isMacUA ? e.metaKey : e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      // Full screen (⌃⌘F), like VS Code. Both modifiers, checked before the
      // plain Cmd/Ctrl block below, or `f` alone would be read as Find.
      if (key === "f" && e.ctrlKey && e.metaKey) {
        e.preventDefault()
        toggleFullscreen()
        return
      }
      // Zen mode. VS Code puts this on the ⌘K chord, which Reado can't have —
      // ⌘K is the command palette and opens on the first key, so the second
      // would land in its input. ⌥⌘Z instead (Ctrl+Alt+Z off macOS): one shape
      // that exists on every keyboard, unbound in Reado, and checked before the
      // plain Cmd/Ctrl+Z undo below.
      // `e.code`, not `e.key`: with Option held macOS composes (⌥Z is "Ω"), and
      // only the physical key is stable across layouts.
      if (e.code === "KeyZ" && e.altKey) {
        e.preventDefault()
        toggleZenMode()
        return
      }
      // Back / forward through the navigation history (Cmd/Ctrl+Alt+←/→).
      if (e.altKey && key === "arrowleft") {
        e.preventDefault()
        useProject.getState().goBack()
        return
      } else if (e.altKey && key === "arrowright") {
        e.preventDefault()
        useProject.getState().goForward()
        return
      }
      // Interface zoom: Cmd/Ctrl with +/=, -, or 0 to reset.
      if (key === "=" || key === "+") {
        e.preventDefault()
        const z = useSettings.getState().zoom
        useSettings.getState().set({ zoom: clampZoom(z + 0.1) })
        return
      } else if (key === "-") {
        e.preventDefault()
        const z = useSettings.getState().zoom
        useSettings.getState().set({ zoom: clampZoom(z - 0.1) })
        return
      } else if (key === "0") {
        e.preventDefault()
        useSettings.getState().set({ zoom: 1 })
        return
      }
      if (key === "p") {
        e.preventDefault()
        open("files")
      } else if (key === "k") {
        e.preventDefault()
        open("commands")
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault()
        open("search")
      } else if (key === "o" && e.shiftKey) {
        e.preventDefault()
        open("symbols")
      } else if (key === "m" && e.shiftKey) {
        // Create a comment from the current selection (or cursor line).
        e.preventDefault()
        useEditorActions.getState().requestCompose()
      } else if (key === ",") {
        e.preventDefault()
        toggleSettings(true)
      } else if (key === "j") {
        // Toggle the integrated terminal.
        e.preventDefault()
        useTerminals.getState().toggle()
      } else if (e.code === "KeyB" && e.altKey) {
        // Toggle the secondary sidebar (the right dock), as ⌥⌘B does elsewhere.
        // Physical key again — ⌥B composes to "∫" on macOS.
        e.preventDefault()
        toggleDockArea("right")
      } else if (key === "b") {
        // Toggle the sidebar.
        e.preventDefault()
        useWorkspace.getState().toggleSidebar()
      } else if (key === "z" && !e.shiftKey) {
        // Undo the last file operation (move / delete). The editor and text
        // inputs own their own undo, so defer to them when focused.
        const el = document.activeElement as HTMLElement | null
        const inField =
          !!el?.closest?.(".cm-editor") ||
          el?.tagName === "INPUT" ||
          el?.tagName === "TEXTAREA" ||
          !!el?.isContentEditable
        if (inField) return
        e.preventDefault()
        void useFileUndo.getState().undo()
      } else if (key === "t" && e.shiftKey) {
        // Reopen the most recently closed tab.
        e.preventDefault()
        useProject.getState().reopenClosed()
      } else if (key === "t") {
        // Go to symbol in the whole project.
        e.preventDefault()
        open("wsymbols")
      } else if (key === "\\") {
        // Toggle the split (side-by-side) editor.
        e.preventDefault()
        const p = useProject.getState()
        if (p.splitPath) p.closeSplit()
        else p.openSplit()
      } else if (key === "r" && e.altKey) {
        // Toggle read/unread for the active file (most frequent per-file verb).
        e.preventDefault()
        toggleActiveRead()
      } else if (key === "e" && e.shiftKey) {
        // Reveal the file tree.
        e.preventDefault()
        useWorkspace.getState().selectTool("files")
      } else if (key === "g" && e.shiftKey) {
        // Source control.
        e.preventDefault()
        useWorkspace.getState().selectTool("git")
      } else if (key === "c" && e.shiftKey) {
        // Comments panel.
        e.preventDefault()
        useWorkspace.getState().selectTool("comments")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, toggleSettings])

  // Mouse back/forward buttons (X1/X2) should walk Reado's read-history, not the
  // webview's page history (which would jump to the launcher). preventDefault on
  // mousedown stops the navigation; we act on mouseup so it fires once.
  useEffect(() => {
    const isNav = (b: number) => b === 3 || b === 4
    const block = (e: MouseEvent) => {
      if (isNav(e.button)) e.preventDefault()
    }
    const onUp = (e: MouseEvent) => {
      if (!isNav(e.button)) return
      e.preventDefault()
      const p = useProject.getState()
      if (e.button === 3) p.goBack()
      else p.goForward()
    }
    window.addEventListener("mousedown", block)
    window.addEventListener("auxclick", block)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousedown", block)
      window.removeEventListener("auxclick", block)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])
}

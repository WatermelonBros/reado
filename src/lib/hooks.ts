/** Cross-cutting React hooks: theme application and global keyboard shortcuts. */

import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { t } from "@/i18n"
import { CHORD_TIMEOUT_MS, matchChord, useChords } from "./chords"
import { OVERRIDDEN_TOKENS, tokensFor } from "./colorVision"
import { useExtensions } from "./extensions"
import { allIconThemes, useIconTheme } from "./extIcons"
import { applyExtTheme, clearExtTheme } from "./extThemes"
import { activeBindings, CHORDS, comboOf, commandFor } from "./keybindings"
import { currentContexts } from "./keyContext"
import { enabledExtensions, useMarketplace } from "./marketplace"
import { runMenuCommand } from "./menu"
import { notify } from "./notice"
import { isMacUA } from "./shortcuts"
import { type BuiltinTheme, isExtTheme, type ThemeName, useProject, useSettings } from "./store"
import { checkForUpdates } from "./updater"

/** Context names already reported as unknown, so a held-down key does not raise
 *  the same notice thirty times. */
const reportedContexts = new Set<string>()

/** Say once that a binding names a context that does not exist — a clause that
 *  silently never matches is indistinguishable from a broken shortcut. */
function notifyUnknownContext(names: string[]): void {
  const fresh = names.filter((n) => !reportedContexts.has(n))
  if (!fresh.length) return
  for (const n of fresh) reportedContexts.add(n)
  notify("error", t("sc.unknownContext", { names: fresh.join(", ") }))
}

/** How far a two-finger swipe has to travel to count as back/forward. Roughly a
 *  deliberate flick: short enough to feel immediate, long enough that nudging a
 *  scroll sideways never changes the file. */
const SWIPE_PX = 100

/** Quiet time that ends one swipe, so the momentum tail of a flick doesn't walk
 *  back through the history. */
const GESTURE_IDLE_MS = 300

/**
 * The nearest box under the pointer that claims it can scroll sideways.
 *
 * Only a claim: the editor's scroller reports a width past its box even with
 * wrap on, where there is nothing to scroll to. Whether it *really* scrolls is
 * settled by watching it — see the gesture handler.
 */
function sidewaysScroller(el: EventTarget | null): Element | null {
  // `instanceof` rather than a truthy check: a wheel event's target is the
  // window itself when nothing is under the pointer, and `getComputedStyle`
  // throws on anything that is not an element — inside a listener, that would
  // take the whole gesture down with it.
  for (let node = el instanceof Element ? el : null; node; node = node.parentElement) {
    if (node.scrollWidth - node.clientWidth <= 1) continue
    const overflow = getComputedStyle(node).overflowX
    if (overflow === "auto" || overflow === "scroll") return node
  }
  return null
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

/** Bind Reado's global keyboard shortcuts. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    let chordTimer: number | undefined
    const cancelChord = () => {
      clearTimeout(chordTimer)
      useChords.getState().cancel()
    }

    const onKey = (e: KeyboardEvent) => {
      // The second half of a `⌘K …` chord takes priority over everything: the
      // prefix is armed, so this keystroke belongs to it whatever it is.
      if (useChords.getState().pending) {
        e.preventDefault()
        cancelChord()
        if (e.key === "Escape") return
        // Modifier keys on their own are not the second key — ignore them and
        // keep waiting rather than cancelling on the way to ⌘S.
        if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) {
          useChords.getState().arm()
          chordTimer = window.setTimeout(cancelChord, CHORD_TIMEOUT_MS)
          return
        }
        const chord = matchChord(CHORDS, e.key, isMacUA ? e.metaKey : e.ctrlKey)
        if (chord) runMenuCommand(chord.command)
        return
      }

      // ⌘K arms the prefix instead of running anything. Checked before the
      // table so a user who rebinds something to ⌘K can't shadow it silently —
      // the prefix is structural, not a command.
      // Computed once: `comboOf` runs two regexes, and this handler sees every
      // keystroke in the window.
      const combo = comboOf(e)
      if (combo === "Mod+K") {
        e.preventDefault()
        useChords.getState().arm()
        chordTimer = window.setTimeout(cancelChord, CHORD_TIMEOUT_MS)
        return
      }

      // A combo can mean different things in different places; the contexts are
      // read now, from what is actually focused, not from a mirrored flag.
      const command = commandFor(
        activeBindings(useSettings.getState().keybindings).get(combo),
        currentContexts(),
        (names) => notifyUnknownContext(names),
      )
      if (!command) return
      // ⌘S and ⌘. are bound inside the editor too; when it handled the key
      // there is nothing left to do here. Every other command is window-level
      // and has no editor binding to conflict with.
      if (e.defaultPrevented) return
      // Undo is the one command whose meaning depends on where you are: the
      // editor and every text field own their own history, and only outside
      // them does ⌘Z mean "take back that file operation".
      if (command === "edit:undoFile") {
        const el = document.activeElement as HTMLElement | null
        const inField =
          !!el?.closest?.(".cm-editor") ||
          el?.tagName === "INPUT" ||
          el?.tagName === "TEXTAREA" ||
          !!el?.isContentEditable
        if (inField) return
      }
      e.preventDefault()
      runMenuCommand(command)
    }

    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      cancelChord()
    }
  }, [])

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

  // Two-finger swipe walks the same read-history. A trackpad sends a long stream
  // of small horizontal deltas, so the gesture is accumulated and fires once,
  // then stays disarmed until the stream stops — otherwise one flick would walk
  // back through five files.
  useEffect(() => {
    let travelled = 0
    let armed = true
    let idle = 0
    let open = false
    let watched: Element | null = null
    let watchedLeft = 0
    const endGesture = () => {
      travelled = 0
      open = false
      watched = null
    }
    const onWheel = (e: WheelEvent) => {
      // A gesture that is mostly vertical is scrolling, not navigation. This is
      // also what keeps a diagonal scroll from drifting into a file change.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
        endGesture()
        return
      }
      if (!open) {
        open = true
        watched = sidewaysScroller(e.target)
        watchedLeft = watched?.scrollLeft ?? 0
      }
      travelled += e.deltaX
      clearTimeout(idle)
      idle = window.setTimeout(() => {
        endGesture()
        armed = true
      }, GESTURE_IDLE_MS)
      if (!armed) return
      if (Math.abs(travelled) < SWIPE_PX) return
      armed = false
      // Something under the pointer actually moved: this was its scroll — a long
      // line being read to its end, a wide table — and not a navigation. Asking
      // afterwards rather than up front is the only reliable test: a box that
      // merely *claims* room (the editor's scroller does, even with wrap on)
      // would otherwise swallow every swipe.
      if (watched && watched.scrollLeft !== watchedLeft) return
      if (travelled < 0) useProject.getState().goBack()
      else useProject.getState().goForward()
    }
    window.addEventListener("wheel", onWheel, { passive: true })
    return () => {
      window.removeEventListener("wheel", onWheel)
      clearTimeout(idle)
    }
  }, [])
}

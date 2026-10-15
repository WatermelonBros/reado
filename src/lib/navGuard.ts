import { openUrl } from "@tauri-apps/plugin-opener"

/**
 * Keys the webview treats as browser navigation, which Reado is not.
 *
 * A webview is still a browser underneath: Backspace outside a text field goes
 * *back*, and back from Reado's only page unloads the app — the project, the open
 * editors, the terminal sessions, everything, with no undo. Alt+←/→ do the same.
 *
 * Nothing in Reado wants those gestures, so they are cancelled at the window,
 * before anything else sees them. Text fields keep Backspace: the guard only ever
 * fires when the keystroke is not going into something editable.
 */

/** Selector for the things a Backspace legitimately belongs to. */
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Is this keystroke going into a text field (CodeMirror and xterm included —
 *  both put a real editable element under the caret)? */
function intoEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== "function") return false
  return el.isContentEditable || !!el.closest(EDITABLE)
}

/** True when the event would navigate the webview and must be stopped. */
export function isNavigationKey(e: KeyboardEvent): boolean {
  if (e.key === "Backspace") return !intoEditable(e.target)
  // Alt+Arrow is back/forward in every browser; in Reado the arrows belong to
  // whatever is focused, and a text field uses Alt+← to move by word.
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.altKey && !e.metaKey && !e.ctrlKey) {
    return !intoEditable(e.target)
  }
  return false
}

/** Cancel those keystrokes for the life of the window. Capture phase, so a
 *  handler that stops propagation can't let one through — cancelling the default
 *  action only; every app shortcut on those keys still runs. */
export function guardNavigationKeys(win: Window = window): void {
  win.addEventListener(
    "keydown",
    (e) => {
      if (isNavigationKey(e)) e.preventDefault()
    },
    true,
  )
}

/** Where a click on this link must go instead of the webview: `"external"` for a
 *  web or mail link (the system browser), `"anchor"` for an in-page `#heading`,
 *  `"stay"` for anything else that would load a page (a relative README link
 *  resolves against the app's own origin). */
export function linkDestination(href: string, page: string): "external" | "anchor" | "stay" {
  if (href.startsWith("#")) return "anchor"
  try {
    const url = new URL(href, page)
    const here = new URL(page)
    // Compared by hand: a custom scheme's origin (tauri://, mailto:) is "null".
    if (url.protocol === here.protocol && url.host === here.host) return "stay"
    return /^(https?|mailto):$/.test(url.protocol) ? "external" : "stay"
  } catch {
    return "stay"
  }
}

/** A link clicked anywhere in the window — a README preview, a comment, release
 *  notes — would load its page *in place of Reado*, with no way back but quitting.
 *  Web links go to the system browser, `#anchors` scroll, anything else stays put. A handler
 *  that already dealt with the click (`preventDefault`) wins: this listens on the
 *  window, after React's own. Middle-click (`auxclick`) too. */
export function guardLinkClicks(win: Window = window, open: (url: string) => unknown = openUrl) {
  const app = win.location.href // the app's own page, read before any link could move it
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented) return
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute("href") ?? ""
    const where = linkDestination(href, app)
    e.preventDefault()
    if (where === "external") void open(a.href)
    // Not through the URL: the hash is Reado's own route (`#project=…`), and a
    // README's `#install` in its place drops the open project. Rendered markdown
    // prefixes ids with `user-content-`.
    if (where === "anchor") {
      const id = decodeURIComponent(href.slice(1))
      const doc = win.document
      ;(doc.getElementById(id) ?? doc.getElementById(`user-content-${id}`))?.scrollIntoView()
    }
  }
  win.addEventListener("click", onClick)
  win.addEventListener("auxclick", onClick)
}

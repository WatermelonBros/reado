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

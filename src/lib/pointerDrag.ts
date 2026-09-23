/**
 * Follow one pointer drag, from the press that started it to its end.
 *
 * Listens on `window`, so the drag keeps tracking once the pointer leaves the
 * handle. A drag doesn't always end in `pointerup`: the OS or the webview can take
 * the pointer away (`pointercancel`), or the window can lose focus mid-drag. The
 * listeners must come off in every one of those cases, otherwise the next
 * unrelated pointer move keeps resizing. An interrupted drag calls `onEnd(null)`.
 */
export function trackPointer(
  onMove: (ev: PointerEvent) => void,
  onEnd?: (ev: PointerEvent | null) => void,
): void {
  const end = (ev: PointerEvent | null) => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", up)
    window.removeEventListener("pointercancel", cancel)
    window.removeEventListener("blur", cancel)
    onEnd?.(ev)
  }
  const up = (ev: PointerEvent) => end(ev)
  const cancel = () => end(null)
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", up)
  window.addEventListener("pointercancel", cancel)
  window.addEventListener("blur", cancel)
}

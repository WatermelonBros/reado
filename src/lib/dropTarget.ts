/**
 * The element under an OS file drop, when it lands inside `container`.
 *
 * OS drops are delivered by Tauri (HTML5 drop events never fire with the OS
 * handler on) with a *physical*-pixel position, so it is scaled back to CSS
 * pixels before hit-testing. Null when nothing is there or the drop landed
 * outside `container`.
 */
export function osDropTarget(
  container: Element | null,
  position: { x: number; y: number },
): Element | null {
  if (!container) return null
  const dpr = window.devicePixelRatio || 1
  const el = document.elementFromPoint(position.x / dpr, position.y / dpr)
  return el && container.contains(el) ? el : null
}

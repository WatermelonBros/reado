import { currentOS } from "@/lib/extensions"

/**
 * The element under an OS file drop, when it lands inside `container`.
 *
 * OS drops are delivered by Tauri (HTML5 drop events never fire with the OS
 * handler on). Tauri types the position as physical pixels, but on macOS wry
 * fills it from `NSDraggingInfo.draggingLocation`, which is in points — already
 * CSS pixels. Dividing that by the Retina `devicePixelRatio` hit-tested half the
 * real coordinates, so a drop on anything right of or below the window's middle
 * (the terminal, above all) landed nowhere. Elsewhere the position really is
 * physical and is scaled back. Null when nothing is there or the drop landed
 * outside `container`.
 */
export function osDropTarget(
  container: Element | null,
  position: { x: number; y: number },
): Element | null {
  if (!container) return null
  const scale = currentOS() === "mac" ? 1 : window.devicePixelRatio || 1
  const el = document.elementFromPoint(position.x / scale, position.y / scale)
  return el && container.contains(el) ? el : null
}

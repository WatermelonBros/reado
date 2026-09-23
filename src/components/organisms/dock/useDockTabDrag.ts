import { type DockArea, type DropTarget, findPanel, type PanelId, useLayout } from "@/lib/layout"
import { openPanel } from "@/lib/panels"
import { trackPointer } from "@/lib/pointerDrag"

/** Resolve the dock target under a screen point by walking up from the element
 *  there — an empty-area rail, a group's strip (stack), or a group body (split). */
function dropTargetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null
  const rail = el.closest<HTMLElement>("[data-dock-rail]")
  if (rail) return { area: rail.dataset.area as DockArea, groupId: null, zone: "split" }
  const cell = el.closest<HTMLElement>("[data-dock-cell]")
  if (!cell) return null
  const area = cell.dataset.area as DockArea
  const groupId = cell.dataset.groupId ?? null
  const onStrip = !!el.closest<HTMLElement>("[data-dock-strip]")
  return { area, groupId, zone: onStrip ? "stack" : "split" }
}

/**
 * Drag a dock tab (pointer-based). Below a small threshold it's a click (activate
 * the tab); past it, it's a drag — the target under the pointer is applied on up.
 */
export function useDockTabDrag() {
  const move = useLayout((s) => s.move)
  const activate = useLayout((s) => s.activate)
  return (e: React.PointerEvent, id: PanelId) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { setDragging, setDropTarget } = useLayout.getState()
    const startX = e.clientX
    const startY = e.clientY
    let active = false
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
        active = true
        setDragging(id)
      }
      setDropTarget(dropTargetAt(ev.clientX, ev.clientY))
    }
    trackPointer(onMove, (ev) => {
      // Interrupted: drop the drag without applying it (and without the click).
      if (!ev) {
        setDragging(null)
        setDropTarget(null)
        return
      }
      if (!active) {
        activate(id)
        // Clicking a closed tab (the terminal's, which stays on the strip) opens
        // it — a tab that shows nothing when pressed reads as broken.
        openPanel(id)
        return
      }
      const target = dropTargetAt(ev.clientX, ev.clientY)
      const from = findPanel(useLayout.getState().layout, id)
      // Apply unless it lands back on its own group (a no-op that would just churn).
      if (target && target.groupId !== from?.groupId) {
        if (target.zone === "stack" && target.groupId) {
          move(id, target.area, { targetGroupId: target.groupId })
        } else {
          move(id, target.area, { split: true })
        }
      }
      setDragging(null)
      setDropTarget(null)
    })
  }
}

import { getCurrentWindow } from "@tauri-apps/api/window"
import { type RefObject, useCallback, useEffect, useRef } from "react"
import {
  previewClearState,
  previewClose,
  previewOpen,
  previewSetBounds,
  previewSetZoom,
} from "@/lib/api"
import { useLayout } from "@/lib/layout"
import { usePreview } from "@/lib/preview"
import { useProject, useSettings } from "@/lib/store"

/**
 * Keep the native preview window parked over the pane's placeholder: open it
 * when the placeholder has a size, close it when it has none, and follow every
 * resize, re-layout and window move.
 */
export function usePreviewBounds(bodyRef: RefObject<HTMLDivElement | null>) {
  const openedRef = useRef(false)
  const lastBounds = useRef({ x: 0, y: 0, w: 0, h: 0, z: 1 })
  const device = usePreview((s) => s.device)
  const paneWidth = usePreview((s) => s.paneWidth)
  const browserZoom = usePreview((s) => s.browserZoom)
  const inspectorPos = usePreview((s) => s.inspectorPos)
  const inspectorSize = usePreview((s) => s.inspectorSize)
  const zoom = useSettings((s) => s.zoom) || 1
  // Re-park the webview when the dock layout changes (a splitter drag resizes the
  // pane; the ResizeObserver can miss the settled size mid-drag).
  const dockLayout = useLayout((s) => s.layout)

  // The pane rect for the child window: centred at the chosen device size (scaled
  // by the page zoom), or filling the pane in responsive mode.
  const computeBounds = useCallback(() => {
    const el = bodyRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    const dev = usePreview.getState().device
    const bz = usePreview.getState().browserZoom
    let x = r.left
    let w = r.width
    let h = r.height
    if (dev) {
      w = Math.min(dev.w * bz, r.width)
      h = Math.min(dev.h * bz, r.height)
      x = r.left + (r.width - w) / 2
    }
    return { x, y: r.top, w, h, z: bz }
  }, [])

  // Reposition the (already-open) child window; keep zoom in sync.
  const syncBounds = useCallback(() => {
    const b = computeBounds()
    if (!b) return
    void previewSetBounds(b.x, b.y, b.w, b.h)
    if (Math.abs(lastBounds.current.z - b.z) > 0.001) void previewSetZoom(b.z)
    lastBounds.current = b
  }, [computeBounds])

  // Open/navigate the child window at `url` (create-or-navigate — self-heals if the
  // window went away). Used on first open, URL changes, and dead→live reloads.
  const openAt = useCallback(
    (url: string) => {
      const b = computeBounds()
      if (!b) return
      openedRef.current = true
      void previewOpen(url, b.x, b.y, b.w, b.h)
      if (Math.abs(lastBounds.current.z - b.z) > 0.001) void previewSetZoom(b.z)
      lastBounds.current = b
    },
    [computeBounds],
  )

  useEffect(() => {
    openAt(usePreview.getState().url)
    const el = bodyRef.current
    if (!el) return
    // If the webview isn't up yet (bounds were 0 at mount, e.g. on reopen), create
    // it once the placeholder has a real size; otherwise just re-park it.
    const ro = new ResizeObserver(() => {
      // No box at all — the dock region is collapsed. The preview is a real OS
      // child window, so it doesn't hide with its placeholder: close it, and
      // let the branch below re-open it when the region comes back.
      if (!computeBounds()) {
        if (openedRef.current) {
          openedRef.current = false
          void previewClose()
        }
        return
      }
      if (openedRef.current) syncBounds()
      else openAt(usePreview.getState().url)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      openedRef.current = false
      void previewClose()
      // Drop the MCP mirror so the agent's tools report "no preview" once closed.
      const r = useProject.getState().root
      if (r) void previewClearState(r)
    }
  }, [syncBounds, openAt, computeBounds])

  // Re-park when the device, pane width, or interface zoom changes. Zoom matters:
  // it's a CSS transform, so the ResizeObserver doesn't fire — but the pane's
  // on-screen rect (what the child window needs) does move.
  useEffect(() => {
    syncBounds()
  }, [device, paneWidth, zoom, browserZoom, inspectorSize, inspectorPos, dockLayout, syncBounds])

  // The preview is a child window in screen coordinates, so it must follow the
  // host window when it moves or resizes.
  useEffect(() => {
    const win = getCurrentWindow()
    const uns: Array<() => void> = []
    void win.onMoved(() => syncBounds()).then((u) => uns.push(u))
    void win.onResized(() => syncBounds()).then((u) => uns.push(u))
    return () => {
      for (const u of uns) u()
    }
  }, [syncBounds])

  return { computeBounds, syncBounds, openAt, openedRef }
}

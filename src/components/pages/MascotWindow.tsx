/**
 * The companion window's whole page: a transparent sheet with the owl in the
 * corner the user parked it in.
 *
 * It is a second webview on the same bundle (`#mascot`) — which means its own
 * JavaScript, and its own copy of every store. It does not see the main window's
 * events: what it shows arrives as a broadcast (`followMascotState`), and it
 * never decides anything itself.
 *
 * The page is click-through everywhere except the character and its bubble.
 * Because a window that ignores the pointer never sees hover either, the
 * interactive rectangle is measured here and handed to Rust, which watches the
 * cursor and turns the pass-through off only while it is inside.
 */

import { listen } from "@tauri-apps/api/event"
import { useEffect, useRef, useState } from "react"
import type { Corner } from "@/components/organisms/mascot/corner"
import { MascotCompanion } from "@/components/organisms/mascot/MascotCompanion"
import { mascotHitRect, mascotRaise } from "@/lib/api"
import { useApplyTheme } from "@/lib/hooks"
import { followMascotConfig, followMascotState, useMascot } from "@/lib/mascot"
import { useSettings } from "@/lib/store"

export function MascotWindow() {
  const state = useMascot((s) => s.state)
  const text = useMascot((s) => s.text)
  const hush = useMascot((s) => s.hush)
  // Read once from this window's own settings (correct at load), then kept in
  // step by the main window — a webview never hears about another's store.
  const [corner, setCorner] = useState<Corner>(useSettings.getState().mascotCorner)
  const [size, setSize] = useState(useSettings.getState().mascotSize)
  // Only so the rectangle below is re-declared when the character goes away and
  // a bar takes its place — a different shape, in a different spot.
  const [tucked, setTucked] = useState(false)
  // The backend polls the cursor to decide when this window accepts clicks, so
  // it is also the only thing that knows when the pointer arrives.
  const [pointerOver, setPointerOver] = useState(false)
  const hit = useRef<HTMLDivElement>(null)
  // The companion is a window of Reado's, so it wears Reado's theme: the tokens
  // the bubble and the tab are painted with are set on <html> by this, and a
  // window that never ran it would show the defaults.
  useApplyTheme()

  useEffect(() => {
    const off = followMascotConfig((c) => {
      setCorner(c.corner as Corner)
      setSize(c.size)
    })
    return () => void off.then((f) => f()).catch(() => {})
  }, [])

  useEffect(() => {
    const off = listen<boolean>("mascot-hover", (e) => setPointerOver(e.payload))
    return () => void off.then((f) => f()).catch(() => {})
  }, [])

  // The state is decided in the main window, where the facts land.
  useEffect(() => {
    const off = followMascotState()
    return () => void off.then((f) => f()).catch(() => {})
  }, [])

  // Tell the backend which part of this window is solid — everything else lets
  // the pointer through. Re-measured on every change that moves it: a bubble
  // appearing, a corner, a size. The observer alone would never fire, because
  // the page itself is always the whole window.
  useEffect(() => {
    const el = hit.current
    if (!el) return
    const publish = () => {
      // Every part that can be clicked, not just the character: a control
      // outside this rectangle is a control the window lets the pointer straight
      // through, which is a button nobody can press.
      const boxes = [
        ...el.querySelectorAll("[data-mascot-hit],[data-mascot-bubble],[data-mascot-tuck]"),
      ].map((n) => (n as HTMLElement).getBoundingClientRect())
      // Nothing solid left — the window is a sheet of glass, and saying so is
      // what stops it swallowing clicks meant for what is behind it.
      if (boxes.length === 0) {
        void mascotHitRect(0, 0, 0, 0).catch(() => {})
        return
      }
      // A few pixels of grace around it: the pass-through is toggled by a poll,
      // so a pointer arriving fast at a three-pixel bar would otherwise reach it
      // before the window has started accepting clicks.
      const grace = 6
      const x = Math.min(...boxes.map((b) => b.left)) - grace
      const y = Math.min(...boxes.map((b) => b.top)) - grace
      const right = Math.max(...boxes.map((b) => b.right)) + grace
      const bottom = Math.max(...boxes.map((b) => b.bottom)) + grace
      void mascotHitRect(x, y, right - x, bottom - y).catch(() => {})
    }
    // Once after the frame that drew the change, and once after the character
    // has finished sliding: the boxes move for as long as the transition runs.
    const raf = requestAnimationFrame(publish)
    const settled = window.setTimeout(publish, 360)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settled)
    }
  }, [state, text, corner, size, tucked])

  // Where it sits and how big it is are settings, deliberately — not a drag.
  // One value decides the corner, and everything positional is derived from it.
  return (
    <div
      ref={hit}
      className="h-screen w-screen overflow-hidden bg-transparent"
      onContextMenu={(e) => {
        // Reado's own menu has no business over the companion; its only
        // secondary action is going away.
        e.preventDefault()
        useSettings.getState().set({ mascot: false })
      }}
    >
      <MascotCompanion
        state={state}
        text={text}
        corner={corner}
        size={size}
        onDismissBubble={hush}
        // Clicking the owl does the one thing its state implies; the backend
        // knows which window to raise and which pane handed back.
        onClick={() => void mascotRaise().catch(() => {})}
        onTuckChange={setTucked}
        pointerOver={pointerOver}
      />
    </div>
  )
}

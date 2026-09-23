/**
 * One styled tooltip for the whole app.
 *
 * WKWebView (Tauri on macOS) doesn't render native `title` tooltips, so buttons
 * that set `title=…` show nothing on hover. This surfaces them ourselves: hover
 * any element carrying a `title` and, after a short delay, a small themed bubble
 * appears near it. It reuses the `title` attributes already on the app's icon
 * buttons — no per-button wiring. The native attribute is stashed while shown so
 * a platform that *does* honour it can't double up.
 *
 * Mounted once at the app root (outside the zoom transform layer) so its
 * `position: fixed` coordinates map to the viewport.
 */
import { useEffect, useRef, useState } from "react"

type Tip = { x: number; y: number; text: string; above: boolean }

export function GlobalTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const ref = useRef<{ el: HTMLElement | null; title: string | null; timer: number }>({
    el: null,
    title: null,
    timer: 0,
  })

  useEffect(() => {
    const clear = () => {
      window.clearTimeout(ref.current.timer)
      // Restore the stashed native title on the element we hid it on.
      if (ref.current.el && ref.current.title != null) {
        ref.current.el.setAttribute("title", ref.current.title)
      }
      ref.current.el = null
      ref.current.title = null
      setTip(null)
    }

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const el = target?.closest<HTMLElement>("[title]")
      // A control with a tooltip of its own, inside the titled element — a tab's
      // close button, inside the tab that titles itself with its path — speaks
      // for itself: showing the outer title too stacks two bubbles on top of
      // each other.
      const own = target?.closest('[data-scope="tooltip"][data-part="trigger"]')
      if (own && el?.contains(own)) return clear()
      if (!el || el === ref.current.el) return
      clear() // switching targets — reset any pending/shown tip first
      const text = el.getAttribute("title")?.trim()
      if (!text) return
      ref.current.el = el
      ref.current.title = el.getAttribute("title")
      el.removeAttribute("title") // suppress any native tooltip
      ref.current.timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        const x = Math.min(Math.max(r.left + r.width / 2, 60), window.innerWidth - 60)
        const above = window.innerHeight - r.bottom < 44
        setTip({ x, y: above ? r.top - 6 : r.bottom + 6, text, above })
      }, 350)
    }

    const onOut = (e: MouseEvent) => {
      if (!ref.current.el) return
      const to = e.relatedTarget as Node | null
      if (to && ref.current.el.contains(to)) return // moved to a child — keep
      clear()
    }

    document.addEventListener("mouseover", onOver)
    document.addEventListener("mouseout", onOut)
    document.addEventListener("mousedown", clear, true)
    window.addEventListener("scroll", clear, true)
    window.addEventListener("blur", clear)
    return () => {
      clear()
      document.removeEventListener("mouseover", onOver)
      document.removeEventListener("mouseout", onOut)
      document.removeEventListener("mousedown", clear, true)
      window.removeEventListener("scroll", clear, true)
      window.removeEventListener("blur", clear)
    }
  }, [])

  if (!tip) return null
  return (
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-[200] -translate-x-1/2 rounded-md border border-line bg-overlay px-2 py-1 text-xs leading-snug text-ink shadow-[var(--shadow)] ${
        tip.above ? "-translate-y-full" : ""
      }`}
      style={{
        left: tip.x,
        top: tip.y,
        // `left` on its own makes the browser size the bubble against what is
        // left of the viewport: the `-translate-x-1/2` below moves it at paint
        // time, long after layout has decided the width. Near the right edge —
        // where most of the status bar lives — that space runs out, and at
        // `left: 1190` in a 1280-wide window a one-line label was given 89px and
        // wrapped into four. `max-content` sizes the bubble by its own text; the
        // max-width keeps the centred box inside the window.
        width: "max-content",
        maxWidth: `min(320px, ${Math.min(tip.x, window.innerWidth - tip.x) * 2 - 8}px)`,
      }}
    >
      {tip.text}
    </div>
  )
}

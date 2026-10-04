/**
 * The dimmed backdrop of an Ark UI tour, cut out around the card and the target.
 * Shared by the app's own first-run tour and project tours: each wraps its parts
 * in `data-tour-scope` so the scrim measures its own tour's card, not the other's.
 */
import { useEffect, useRef } from "react"

/** Sent when a tour's target moves without the window resizing or scrolling. */
export const TOUR_LAYOUT = "reado:tour-layout"

/** SVG path for a rounded rectangle (one subpath). Exported for its own test:
 *  the radius clamp only bites on targets too small to drive through the tour. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const X = Math.round(x),
    Y = Math.round(y),
    W = Math.round(w),
    H = Math.round(h)
  return (
    `M${X + r} ${Y} H${X + W - r} A${r} ${r} 0 0 1 ${X + W} ${Y + r} ` +
    `V${Y + H - r} A${r} ${r} 0 0 1 ${X + W - r} ${Y + H} ` +
    `H${X + r} A${r} ${r} 0 0 1 ${X} ${Y + H - r} ` +
    `V${Y + r} A${r} ${r} 0 0 1 ${X + r} ${Y} Z`
  )
}

function intersects(a: DOMRect, b: DOMRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Build the clip-path (outer viewport rect + cut-outs) for the current step. */
function scrimPath(scope: string, target?: () => Element | null): string | null {
  const q = (part: string) =>
    document.querySelector<HTMLElement>(
      `[data-tour-scope="${scope}"] [data-scope="tour"][data-part="${part}"]`,
    )
  const card = q("content")
  if (!card) return null
  const cr = card.getBoundingClientRect()
  // Reject the garbage rect zag reports for a frame before it applies the
  // transform — the real card is never zero-sized nor pinned to the corner.
  if (cr.width <= 1 || cr.height <= 1 || (cr.x < 2 && cr.y < 2)) return null
  const W = window.innerWidth,
    H = window.innerHeight
  const holes: string[] = []
  // A tour that knows its target hands it over (it may scroll inside an editor);
  // otherwise zag's spotlight, which it sizes to the target.
  const spot = target?.() ?? q("spotlight")
  const sr = spot?.getBoundingClientRect()
  // Spotlight is hidden on target-less (dialog) steps.
  const hasTarget = !!spot && !spot.hasAttribute("hidden") && !!sr && sr.width > 1 && sr.height > 1
  if (hasTarget) holes.push(roundedRect(sr!.x - 4, sr!.y - 4, sr!.width + 8, sr!.height + 8, 8))
  // Skip the card hole when it's inside the target hole: overlapping holes cancel
  // under even-odd and would re-dim the card (the comment step targets the whole
  // editor, with the card inside it).
  if (!(hasTarget && intersects(cr, sr!))) {
    holes.push(roundedRect(cr.x - 6, cr.y - 6, cr.width + 12, cr.height + 12, 12))
  }
  return `M0 0 H${W} V${H} H0 Z ${holes.join(" ")}`
}

/**
 * Full-screen scrim with cut-outs. Unlike Ark's backdrop (one hole, none on
 * dialog steps), this dims the whole app on *every* step and punches holes around
 * the card and the highlighted target — both read as lit while the rest recedes.
 *
 * Re-cut is event-driven (step change, resize, scroll), NOT a 60fps loop: polling
 * getBoundingClientRect every frame forced reflows that fought zag's positioning
 * and made the card flash at the origin. After each trigger we poll only until the
 * path holds steady for two frames, then stop touching the DOM.
 */
export function TourScrim({
  open,
  stepIndex,
  scope,
  target,
}: {
  open: boolean
  stepIndex: number
  /** The `data-tour-scope` wrapping this tour's parts — two tours can coexist. */
  scope: string
  target?: () => Element | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    let raf = 0
    let prev = ""
    let tries = 0
    const settle = () => {
      const el = ref.current
      const path = scrimPath(scope, target)
      if (el && path) {
        if (path === prev) {
          el.style.clipPath = `path(evenodd, "${path}")`
          return // stable for two frames — stop polling
        }
        prev = path
      }
      if (tries++ < 40) raf = requestAnimationFrame(settle)
    }
    const restart = () => {
      cancelAnimationFrame(raf)
      prev = ""
      tries = 0
      raf = requestAnimationFrame(settle)
    }
    restart()
    window.addEventListener("resize", restart)
    window.addEventListener("scroll", restart, true)
    // The target moved inside its editor (a project tour lays its box out again).
    window.addEventListener(TOUR_LAYOUT, restart)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", restart)
      window.removeEventListener("scroll", restart, true)
      window.removeEventListener(TOUR_LAYOUT, restart)
    }
  }, [open, stepIndex, scope])
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[300]"
      style={{ display: open ? "block" : "none", background: "oklch(0.13 0.02 250 / 0.55)" }}
    />
  )
}

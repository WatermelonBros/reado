/**
 * What the mascot says, drawn rather than baked into the art.
 *
 * The bubble and its tail are **one SVG path**: an outline this thick shows every
 * join, and the usual CSS-triangle tail meets the bubble's border at a visible
 * seam. Measuring the text box and drawing the path at that exact size is the
 * price of one continuous line.
 *
 * Colours come from Reado's theme tokens: the companion is one of Reado's
 * windows, and a bubble painted in colours of its own would belong to nothing.
 */
import { useLayoutEffect, useRef, useState } from "react"
import type { Corner } from "./corner"

/** Reado's own tokens, so the bubble belongs to the theme the user chose rather
 *  than to a palette of its own. They are CSS variables, not values: the SVG
 *  reads them the same way the rest of the app does, and a theme change repaints
 *  it with no code involved. */
const FILL = "var(--color-surface)"
const INK = "var(--color-line-strong)"
const STROKE = 2
/** How far the tail sticks out past the bubble body, and how wide its base is. */
const TAIL = 15
const TAIL_BASE = 24
const RADIUS = 14

/**
 * The outline of a bubble `w`×`h` whose tail hangs off the bottom edge, its tip
 * `tipX` across. `h` includes the tail.
 *
 * Only the bottom case is written: a top tail is this same path flipped by the
 * SVG, which is why the two sides cannot drift apart.
 */
export function bubblePath(w: number, h: number, tipX: number): string {
  const r = Math.min(RADIUS, w / 2, (h - TAIL) / 2)
  const bh = h - TAIL // the body's own height
  // The tip is clamped as well as the base: a tail asked to point past the
  // bubble's own width would draw a spike across the screen.
  const tip = Math.max(r, Math.min(w - r, tipX))
  const base = Math.max(r + 2, Math.min(w - r - 2 - TAIL_BASE, tip - TAIL_BASE / 2))
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${bh - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${bh}`,
    `H ${base + TAIL_BASE}`,
    `L ${tip} ${h}`, // out to the tip…
    `L ${base} ${bh}`, // …and back to the edge
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${bh - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ")
}

/** Lines the bubble shows before it asks to be clicked, and the most it will
 *  ever show. Expanding is not "no limit": the window reserves a fixed height
 *  above the character, and a bubble taller than that has its top cut off by the
 *  window's own edge — losing exactly the words the reader starts from. Ten
 *  lines hold the longest message `mascot_say` accepts. */
const CLAMP = 3
const CLAMP_FULL = 10

export function SpeechBubble({
  text,
  corner,
  maxWidth = 260,
  onDismiss,
}: {
  text: string
  corner: Corner
  maxWidth?: number
  onDismiss?: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [full, setFull] = useState(false)
  /** Is there more text than the bubble is showing? Only then does a click mean
   *  "show me the rest" — otherwise the first click means what a reader expects
   *  it to mean, which is "I have read it, go away". */
  const [clipped, setClipped] = useState(false)

  // Measure *before the browser paints*, not after: the outline is drawn to the
  // size of the text box, and a ResizeObserver reports it a frame late — so a
  // new, longer message was drawn inside the previous message's bubble for a
  // paint or two, and then jumped. `useLayoutEffect` closes that window; the
  // observer stays for the reflows nobody triggers, like a webfont arriving.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      setClipped(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [text, full])

  // A bubble on a bottom corner sits above the owl and points down at it; on a
  // top corner it sits below and points up. Either way the tip is on the side
  // the owl is parked, which is the side the tail must reach.
  const side = corner.startsWith("bottom") ? "bottom" : "top"
  const tipX = corner.endsWith("right") ? size.w - TAIL_BASE : TAIL_BASE

  return (
    <button
      type="button"
      data-mascot-bubble
      data-bubble-side={side}
      onClick={() => (clipped && !full ? setFull(true) : onDismiss?.())}
      className="relative block cursor-default text-left"
      style={{ maxWidth }}
    >
      {size.w > 0 && (
        <svg
          aria-hidden="true"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="pointer-events-none absolute inset-0"
        >
          <path
            d={bubblePath(size.w, size.h, tipX)}
            // A top tail is the bottom one turned over — no second path to keep
            // in step with the first.
            transform={side === "top" ? `scale(1,-1) translate(0,${-size.h})` : undefined}
            fill={FILL}
            stroke={INK}
            strokeWidth={STROKE}
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div
        ref={boxRef}
        role="status"
        // The cap, in the DOM: `-webkit-line-clamp` is a style no test
        // environment models, and this is the number that decides whether the
        // bubble can outgrow the window.
        data-clamp={full ? CLAMP_FULL : CLAMP}
        className="relative px-3.5 py-2.5 text-[13px] leading-snug font-medium text-ink"
        style={{
          // Room for the tail on whichever edge it hangs off, so the text never
          // sits on top of it.
          paddingTop: side === "top" ? 10 + TAIL : 10,
          paddingBottom: side === "bottom" ? 10 + TAIL : 10,
          display: "-webkit-box",
          WebkitLineClamp: full ? CLAMP_FULL : CLAMP,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {text}
      </div>
    </button>
  )
}

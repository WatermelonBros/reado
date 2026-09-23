import { type RefObject, useEffect, useRef, useState } from "react"
import type { Edge, Node } from "@/lib/knowledgeGraph"

/**
 * Lay the graph out by force, moving `nodesRef`'s nodes in place and
 * re-rendering the caller once per frame while it runs. Returns the reheat: a
 * ref to the function that restarts the cooled-down simulation (called when a
 * node is grabbed) — a ref so handlers always call the live one.
 */
export function useForceLayout(
  nodesRef: RefObject<Node[]>,
  edges: Edge[],
  { size, dragId }: { size: { w: number; h: number }; dragId: RefObject<string | null> },
): RefObject<() => void> {
  const [, setTick] = useState(0)
  const reheatRef = useRef<() => void>(() => {})

  // Force simulation with cooldown: it runs until the layout settles (low kinetic
  // energy) or a frame cap, then STOPS — so it doesn't re-render the whole SVG
  // forever (which made a large graph stutter and its nodes impossible to click
  // or drag). Grabbing a node reheats it.
  useEffect(() => {
    let raf = 0
    let frames = 0
    let running = false
    const MAX_FRAMES = 600
    const byId = (id: string) => nodesRef.current.find((n) => n.id === id)
    const step = () => {
      const ns = nodesRef.current
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i]
          const b = ns[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          const d2 = dx * dx + dy * dy || 1
          const f = 5200 / d2
          const d = Math.sqrt(d2)
          dx /= d
          dy /= d
          a.vx += dx * f
          a.vy += dy * f
          b.vx -= dx * f
          b.vy -= dy * f
        }
      }
      for (const e of edges) {
        const a = byId(e.a)
        const b = byId(e.b)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 130) * 0.012
        a.vx += (dx / d) * f
        a.vy += (dy / d) * f
        b.vx -= (dx / d) * f
        b.vy -= (dy / d) * f
      }
      let energy = 0
      for (const n of ns) {
        if (n.id === dragId.current) {
          n.vx = 0
          n.vy = 0
          continue
        }
        n.vx += (size.w / 2 - n.x) * 0.002
        n.vy += (size.h / 2 - n.y) * 0.002
        n.vx *= 0.86
        n.vy *= 0.86
        n.x = Math.max(24, Math.min(size.w - 24, n.x + n.vx))
        n.y = Math.max(24, Math.min(size.h - 24, n.y + n.vy))
        energy += n.vx * n.vx + n.vy * n.vy
      }
      frames++
      setTick((x) => x + 1)
      // Keep going while there's meaningful motion (or a node is being dragged),
      // up to a hard cap; otherwise settle and stop re-rendering. The threshold
      // scales with node count so large graphs also reach a stop.
      if ((energy > 0.03 * ns.length || dragId.current) && frames < MAX_FRAMES) {
        raf = requestAnimationFrame(step)
      } else {
        running = false
      }
    }
    const start = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(step)
    }
    reheatRef.current = () => {
      frames = 0
      start()
    }
    start()
    return () => {
      cancelAnimationFrame(raf)
      running = false
    }
  }, [edges])

  return reheatRef
}

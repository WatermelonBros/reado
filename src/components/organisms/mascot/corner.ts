/**
 * Which corner of the display the companion is parked in.
 *
 * It is **one value**, and everything that depends on it is derived here: which
 * way the bubble opens, which side its tail points, how the two stack. Any of
 * these written as a constant somewhere would make three of the four corners
 * work and the fourth look broken.
 */

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left"

export const CORNERS: Corner[] = ["bottom-right", "bottom-left", "top-right", "top-left"]

/** The layout a corner implies: the bubble always opens away from the two screen
 *  edges the companion is against. */
export function cornerLayout(corner: Corner): {
  /** The owl is at the bottom, so the bubble goes above it — and vice versa. */
  column: "column" | "column-reverse"
  /** Which edge the pair hugs. */
  align: "flex-end" | "flex-start"
} {
  return {
    column: corner.startsWith("bottom") ? "column" : "column-reverse",
    align: corner.endsWith("right") ? "flex-end" : "flex-start",
  }
}

// The tour's spotlight cut-out. A corner radius larger than half the target
// makes a self-intersecting path, so the highlight renders mangled or not at
// all — on exactly the small targets (an activity-bar icon) the tour points at.
import { describe, expect, it } from "vitest"
import { roundedRect } from "@/components/organisms/OnboardingTour"

/** The arc radii in the path, in order: `A<r> <r> …`. The sign is captured too
 *  — without it a negative radius yields no matches and `every()` on an empty
 *  array is vacuously true. */
const radii = (d: string) => {
  const found = [...d.matchAll(/A(-?\d+(?:\.\d+)?) /g)].map((m) => Number(m[1]))
  expect(found).toHaveLength(4)
  return found
}

describe("roundedRect", () => {
  it("clamps the radius to half the shorter side", () => {
    // A 10×10 icon asked for a radius of 8 — half is 5.
    expect(radii(roundedRect(0, 0, 10, 10, 8)).every((r) => r <= 5)).toBe(true)
    // A thin strip clamps on its height.
    expect(radii(roundedRect(0, 0, 200, 6, 12)).every((r) => r <= 3)).toBe(true)
  })

  it("leaves a radius that already fits alone", () => {
    expect(radii(roundedRect(0, 0, 200, 100, 8))).toEqual([8, 8, 8, 8])
  })

  it("never emits a negative radius", () => {
    expect(radii(roundedRect(0, 0, 40, 40, -5)).every((r) => r >= 0)).toBe(true)
  })

  it("closes the subpath so it can be used as a clip hole", () => {
    expect(roundedRect(1, 2, 30, 40, 4).trim().endsWith("Z")).toBe(true)
  })
})

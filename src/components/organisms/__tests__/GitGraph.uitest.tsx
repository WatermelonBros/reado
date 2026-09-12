// Lane assignment for the commit graph. This is the part that is wrong in a way
// a screenshot hides: the drawing looks plausible whatever the lanes say, so the
// shapes that matter — a branch leaving the trunk, a merge bringing it back, a
// lane freed for reuse — are asserted on the layout itself.
import { describe, expect, it } from "vitest"

import { layout } from "@/components/organisms/GitGraph"
import type { GraphCommit } from "@/lib/api"

const c = (hash: string, parents: string[] = []): GraphCommit => ({
  hash,
  parents,
  subject: hash,
  author: "me",
  date: "now",
  refs: [],
})

const laneOf = (commits: GraphCommit[]) => {
  const { placed } = layout(commits)
  return Object.fromEntries(placed.map((p) => [p.commit.hash, p.lane]))
}

describe("commit graph layout", () => {
  it("keeps a linear history in one lane", () => {
    const { placed, width } = layout([c("c", ["b"]), c("b", ["a"]), c("a")])
    expect(placed.map((p) => p.lane)).toEqual([0, 0, 0])
    expect(width).toBe(1)
  })

  it("gives a merge's second parent a lane of its own", () => {
    // m merges side into trunk:  m ─┬─ t ── base
    //                               └─ s ──┘
    const lanes = laneOf([c("m", ["t", "s"]), c("t", ["base"]), c("s", ["base"]), c("base")])
    expect(lanes.m).toBe(0)
    expect(lanes.t).toBe(0)
    expect(lanes.s).toBe(1)
    // The two lanes converge on the shared parent, which takes the leftmost.
    expect(lanes.base).toBe(0)
  })

  it("frees a lane once nothing is waiting in it", () => {
    // The side branch ends at `base`; a later independent root must reuse lane 1
    // rather than opening a third column.
    const { width } = layout([
      c("m", ["t", "s"]),
      c("t", ["base"]),
      c("s", ["base"]),
      c("base"),
      c("other"),
    ])
    expect(width).toBe(2)
  })

  it("places every commit exactly once, in the order given", () => {
    const commits = [c("c", ["b"]), c("b", ["a"]), c("a")]
    const { placed } = layout(commits)
    expect(placed.map((p) => p.commit.hash)).toEqual(["c", "b", "a"])
    expect(placed.map((p) => p.row)).toEqual([0, 1, 2])
  })

  it("survives a parent that is outside the window", () => {
    // The oldest commit shown still has a parent; its edge has nowhere to land,
    // and that must not be a crash or a negative lane.
    const { placed } = layout([c("b", ["a"])])
    expect(placed[0].edges).toEqual([{ parent: "a", lane: 0 }])
  })
})

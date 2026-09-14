// Dockable-panel layout reducers — pure model logic (areas / groups / tabs /
// move / split / remove). No React, no persistence. Runs on all 3 OSes.
import { describe, expect, it } from "vitest"
import {
  activatePanel,
  defaultLayout,
  findPanel,
  type Layout,
  movePanel,
  panelsInArea,
  removePanel,
  withBottomPanel,
} from "@/lib/layout"

/** The reducer fixture: one panel per area, so a test says what it means about
 *  moving and stacking rather than about whatever the shipped default holds. */
const base = (): Layout => ({
  areas: {
    left: { groups: [], size: 260 },
    right: {
      groups: [{ id: "g-browser", tabs: ["browser"], active: "browser", size: 1 }],
      size: 640,
    },
    bottom: {
      groups: [{ id: "g-terminal", tabs: ["terminal"], active: "terminal", size: 1 }],
      size: 320,
    },
  },
})

const mv = (
  l: Layout,
  p: string,
  area: "left" | "right" | "bottom",
  opts: { split?: boolean; targetGroupId?: string } = {},
) => movePanel(l, p, area, { ...opts, newGroupId: `g-${p}-${area}` })

describe("defaultLayout", () => {
  it("places terminal in bottom and browser on the right, matching today", () => {
    const l = defaultLayout()
    expect(findPanel(l, "terminal")).toEqual({ area: "bottom", groupId: "g-terminal" })
    expect(findPanel(l, "browser")).toEqual({ area: "right", groupId: "g-browser" })
    expect(findPanel(l, "nope")).toBeNull()
  })

  it("keeps Output and Problems as tabs beside the terminal, where VS Code puts them", () => {
    const g = defaultLayout().areas.bottom.groups[0]
    expect(g.tabs).toEqual(["terminal", "output", "problems"])
    // The terminal is what you look at when you open the bottom dock, and
    // switching to another tab leaves the other two in the group — a tab is not
    // a replacement for the panel beside it.
    expect(g.active).toBe("terminal")
    expect(activatePanel(defaultLayout(), "problems").areas.bottom.groups[0]).toMatchObject({
      tabs: ["terminal", "output", "problems"],
      active: "problems",
    })
  })
})

describe("withBottomPanel", () => {
  const add = (l: Layout, p: string) => withBottomPanel(l, p, `g-${p}`)

  it("adds the panel beside the terminal in a layout that predates it", () => {
    const l = add(add(base(), "output"), "problems")
    expect(l.areas.bottom.groups[0].tabs).toEqual(["terminal", "output", "problems"])
    // The active tab is left alone: the migration must not change what you see.
    expect(l.areas.bottom.groups[0].active).toBe("terminal")
  })

  it("leaves a layout that already places the panel exactly as it is", () => {
    const moved = mv(add(base(), "output"), "output", "right")
    expect(add(moved, "output")).toEqual(moved)
    // Including one where the user closed it out of the layout for good.
    const closed = removePanel(add(base(), "problems"), "problems")
    expect(add(closed, "problems").areas.bottom.groups[0].tabs).toEqual(["terminal", "problems"])
  })

  it("gives the panel its own bottom group when there is no terminal to sit beside", () => {
    const l = add(removePanel(base(), "terminal"), "output")
    expect(panelsInArea(l, "bottom")).toEqual(["output"])
  })
})

describe("movePanel", () => {
  it("splits a new group when moving into an empty area (browser beside nothing → own group)", () => {
    const l = mv(base(), "browser", "bottom", { split: true })
    // Bottom now has two groups: terminal, then browser beside it.
    const bottom = l.areas.bottom.groups
    expect(bottom).toHaveLength(2)
    expect(panelsInArea(l, "bottom")).toEqual(["terminal", "browser"])
    // Browser left the right area, which is now empty.
    expect(l.areas.right.groups).toHaveLength(0)
    expect(findPanel(l, "browser")).toEqual({ area: "bottom", groupId: "g-browser-bottom" })
  })

  it("joins the area's first group as a tab when not splitting (browser stacks on terminal)", () => {
    const l = mv(base(), "browser", "bottom")
    expect(l.areas.bottom.groups).toHaveLength(1)
    const g = l.areas.bottom.groups[0]
    expect(g.tabs).toEqual(["terminal", "browser"])
    expect(g.active).toBe("browser") // the moved panel becomes active
  })

  it("joins a specific target group when given its id", () => {
    // First split browser into its own bottom group, then move terminal into it.
    let l = mv(base(), "browser", "bottom", { split: true })
    const browserGroup = findPanel(l, "browser")!.groupId
    l = mv(l, "terminal", "bottom", { targetGroupId: browserGroup })
    const g = l.areas.bottom.groups.find((g) => g.id === browserGroup)!
    expect(g.tabs).toEqual(["browser", "terminal"])
    // Terminal's old group was emptied and pruned.
    expect(l.areas.bottom.groups).toHaveLength(1)
  })

  it("does not mutate the input layout", () => {
    const l = base()
    const before = JSON.stringify(l)
    mv(l, "browser", "bottom")
    expect(JSON.stringify(l)).toBe(before)
  })

  it("moving a panel already in the target area just relocates it, no duplication", () => {
    let l = mv(base(), "browser", "bottom", { split: true }) // browser in bottom
    l = mv(l, "browser", "bottom") // move it again, stacking onto terminal
    // Still exactly one occurrence of browser across the whole tree.
    const count = (["left", "right", "bottom"] as const)
      .flatMap((a) => l.areas[a].groups)
      .flatMap((g) => g.tabs)
      .filter((t) => t === "browser").length
    expect(count).toBe(1)
  })
})

describe("a detached console alongside terminal and browser", () => {
  it("docks the inspector as its own panel without disturbing the others", () => {
    // Detaching the console = placing an "inspector" panel in the bottom, beside
    // the terminal. All three then live in distinct groups.
    const l = mv(base(), "inspector", "bottom", { split: true })
    expect(findPanel(l, "terminal")).toEqual({ area: "bottom", groupId: "g-terminal" })
    expect(findPanel(l, "inspector")).toEqual({ area: "bottom", groupId: "g-inspector-bottom" })
    expect(findPanel(l, "browser")).toEqual({ area: "right", groupId: "g-browser" })
    expect(panelsInArea(l, "bottom")).toEqual(["terminal", "inspector"])
  })

  it("can stack the console onto the terminal as a tab", () => {
    let l = mv(base(), "inspector", "bottom", { split: true })
    const termGroup = findPanel(l, "terminal")!.groupId
    l = mv(l, "inspector", "bottom", { targetGroupId: termGroup })
    const g = l.areas.bottom.groups.find((x) => x.id === termGroup)!
    expect(g.tabs).toEqual(["terminal", "inspector"])
    expect(l.areas.bottom.groups).toHaveLength(1) // the inspector's own group was pruned
  })
})

describe("removePanel", () => {
  it("removes the panel and prunes the emptied group", () => {
    const l = removePanel(base(), "terminal")
    expect(findPanel(l, "terminal")).toBeNull()
    expect(l.areas.bottom.groups).toHaveLength(0)
  })

  it("keeps the group and fixes the active tab when a stacked panel is removed", () => {
    let l = mv(base(), "browser", "bottom") // [terminal, browser], active browser
    l = removePanel(l, "browser")
    const g = l.areas.bottom.groups[0]
    expect(g.tabs).toEqual(["terminal"])
    expect(g.active).toBe("terminal") // active fell back to a surviving tab
  })

  it("is a no-op for a panel that isn't placed", () => {
    const l = base()
    expect(removePanel(l, "ghost")).toEqual(l)
  })
})

describe("activatePanel", () => {
  it("switches the active tab within a stacked group", () => {
    let l = mv(base(), "browser", "bottom") // active browser
    l = activatePanel(l, "terminal")
    expect(l.areas.bottom.groups[0].active).toBe("terminal")
  })

  it("returns the same layout for an unplaced panel", () => {
    const l = defaultLayout()
    expect(activatePanel(l, "ghost")).toBe(l)
  })
})

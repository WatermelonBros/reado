// Editor groups: several panes, each with its own tabs, file and history.
//
// The model keeps the focused group's tabs/active/history in the store's own
// fields — every reader in the app already works on those — and the other
// groups beside them. These tests are about that swap being lossless.
import { beforeEach, describe, expect, it } from "vitest"
import { useProject } from "@/lib/store"

const P = () => useProject.getState()
const GIT = {
  isRepo: false,
  branch: null,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  hasUpstream: false,
  changedFiles: 0,
}

beforeEach(() => {
  useProject.setState({
    root: "/p",
    tabs: [],
    active: null,
    navStack: [],
    navIndex: -1,
    groups: [{ id: "g1", tabs: [], active: null, navStack: [], navIndex: -1 }],
    focusedGroup: "g1",
    closedTabs: [],
    pinnedTabs: [],
    previewPath: null,
  })
})

describe("splitting", () => {
  it("puts the file you were reading in a new group beside it", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    expect(P().groups.map((g) => g.id)).toEqual(["g1", "g2"])
    expect(P().focusedGroup).toBe("g2")
    expect(P().active).toBe("/p/a.ts")
    // The group left behind keeps what it had.
    expect(P().groups[0].tabs).toEqual(["/p/a.ts"])
  })

  it("gives a third file a third pane", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().splitGroup()
    expect(P().groups).toHaveLength(3)
  })
})

describe("each group keeps its own", () => {
  it("tabs and active file", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().open("/p/b.ts")
    expect(P().tabs).toEqual(["/p/a.ts", "/p/b.ts"])
    P().focusGroup("g1")
    expect(P().tabs).toEqual(["/p/a.ts"])
    expect(P().active).toBe("/p/a.ts")
  })

  it("history, so back in one pane does not move the other", () => {
    P().open("/p/a.ts")
    P().open("/p/b.ts")
    P().splitGroup()
    P().open("/p/c.ts")
    P().goBack()
    expect(P().active).toBe("/p/b.ts") // g2's own history
    P().focusGroup("g1")
    // g1 never moved: it is still where it was left.
    expect(P().active).toBe("/p/b.ts")
    P().goBack()
    expect(P().active).toBe("/p/a.ts")
  })

  it("does not lose edits to the group being left", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().open("/p/b.ts")
    P().focusGroup("g1")
    P().open("/p/x.ts")
    P().focusGroup("g2")
    expect(P().tabs).toEqual(["/p/a.ts", "/p/b.ts"])
  })
})

describe("focusing", () => {
  it("takes a position, for ⌘1…⌘9", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().focusGroup(0)
    expect(P().focusedGroup).toBe("g1")
    P().focusGroup(1)
    expect(P().focusedGroup).toBe("g2")
  })

  it("ignores a position that is not there", () => {
    P().focusGroup(5)
    expect(P().focusedGroup).toBe("g1")
  })

  it("opens a file into the group you are looking at", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().focusGroup("g1")
    P().open("/p/new.ts")
    expect(P().tabs).toContain("/p/new.ts")
    expect(P().groups.find((g) => g.id === "g2")?.tabs).not.toContain("/p/new.ts")
  })

  it("acts on another group's tab by focusing it first", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().open("/p/b.ts")
    P().activateInGroup("g1", "/p/a.ts")
    expect(P().focusedGroup).toBe("g1")
    expect(P().active).toBe("/p/a.ts")
  })
})

describe("closing", () => {
  it("closes the group when its last tab goes, and focuses a neighbour", () => {
    P().open("/p/a.ts")
    P().splitGroup()
    P().close("/p/a.ts")
    expect(P().groups.map((g) => g.id)).toEqual(["g1"])
    expect(P().focusedGroup).toBe("g1")
    expect(P().active).toBe("/p/a.ts")
  })

  it("never leaves the editor with no group at all", () => {
    P().open("/p/a.ts")
    P().close("/p/a.ts")
    expect(P().groups).toHaveLength(1)
    expect(P().tabs).toEqual([])
  })
})

describe("the session", () => {
  it("brings the arrangement back", () => {
    const groups = [
      { id: "g1", tabs: ["/p/a.ts"], active: "/p/a.ts", navStack: [], navIndex: -1 },
      { id: "g2", tabs: ["/p/b.ts"], active: "/p/b.ts", navStack: [], navIndex: -1 },
    ]
    P().init("/p", GIT, { tabs: ["/p/b.ts"], active: "/p/b.ts", groups, focusedGroup: "g2" })
    expect(P().groups).toHaveLength(2)
    expect(P().focusedGroup).toBe("g2")
  })

  it("reads a session written before groups existed as one group", () => {
    P().init("/p", GIT, { tabs: ["/p/a.ts"], active: "/p/a.ts" })
    expect(P().groups).toHaveLength(1)
    expect(P().groups[0].tabs).toEqual(["/p/a.ts"])
  })
})

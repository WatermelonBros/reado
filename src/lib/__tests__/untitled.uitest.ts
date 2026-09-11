// The scratch-buffer model: how a buffer with no path is named, told apart from
// a real one, and kept separate per project. (`uitest` because the store
// persists, and persistence wants a window.)
import { beforeEach, describe, expect, it } from "vitest"
import { useProject } from "@/lib/store"
import { isUntitled, nextUntitledId, untitledId, untitledName, useUntitled } from "@/lib/untitled"

beforeEach(() => {
  useUntitled.setState({ texts: {} })
  useProject.setState({ root: "/a" })
})

describe("naming", () => {
  it("tells a scratch buffer from a file, whatever the file is called", () => {
    expect(isUntitled(untitledId(3))).toBe(true)
    expect(isUntitled("/repo/src/a.ts")).toBe(false)
    // The one shape that could look like the prefix is still a path, not an id.
    expect(isUntitled("/repo/untitled:1")).toBe(false)
  })

  it("shows a name, not the id it is keyed by", () => {
    expect(untitledName(untitledId(2))).toBe("Untitled-2")
  })

  it("hands out the lowest free number, not the next one up", () => {
    expect(nextUntitledId([])).toBe("untitled:1")
    expect(nextUntitledId(["untitled:1", "/repo/a.ts"])).toBe("untitled:2")
    // #1 was closed: it comes back, rather than the count climbing all session.
    expect(nextUntitledId(["untitled:2", "untitled:3"])).toBe("untitled:1")
  })
})

describe("one Untitled-1 per project", () => {
  it("keeps each project's buffer to itself", () => {
    useUntitled.getState().setText("untitled:1", "from A")
    useProject.setState({ root: "/b" })
    expect(useUntitled.getState().textOf("untitled:1")).toBe("")
    useUntitled.getState().setText("untitled:1", "from B")
    useProject.setState({ root: "/a" })
    expect(useUntitled.getState().textOf("untitled:1")).toBe("from A")
  })

  it("drops one buffer without touching its neighbours", () => {
    useUntitled.getState().setText("untitled:1", "one")
    useUntitled.getState().setText("untitled:2", "two")
    useUntitled.getState().drop("untitled:1")
    expect(useUntitled.getState().textOf("untitled:1")).toBe("")
    expect(useUntitled.getState().textOf("untitled:2")).toBe("two")
  })
})

describe("the session", () => {
  it("brings scratch buffers back with the tabs, text and all", () => {
    useUntitled.getState().setText("untitled:1", "a draft")
    useProject.getState().init(
      "/a",
      {
        isRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
        changedFiles: 0,
      },
      { tabs: ["untitled:1", "/a/x.ts"], active: "untitled:1" },
    )
    expect(useProject.getState().tabs).toContain("untitled:1")
    expect(useUntitled.getState().textOf("untitled:1")).toBe("a draft")
  })
})

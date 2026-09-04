// Reading-bookmarks store: load/toggle/remove with the backend mirror mocked.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  getBookmarks: vi.fn(),
  setBookmarks: vi.fn(async () => {}),
}))

import { type Bookmark, getBookmarks, setBookmarks } from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"

const bm = (path: string, line: number): Bookmark => ({ path, line, snippet: "x" })

beforeEach(() => {
  vi.clearAllMocks()
  useBookmarks.setState({ bookmarks: [] })
})

describe("load", () => {
  it("fills the store from the backend", async () => {
    vi.mocked(getBookmarks).mockResolvedValue([bm("a.ts", 1)])
    await useBookmarks.getState().load("/root")
    expect(getBookmarks).toHaveBeenCalledWith("/root")
    expect(useBookmarks.getState().bookmarks).toEqual([bm("a.ts", 1)])
  })

  it("falls back to empty on a backend error", async () => {
    vi.mocked(getBookmarks).mockRejectedValue(new Error("boom"))
    useBookmarks.setState({ bookmarks: [bm("stale.ts", 9)] })
    await useBookmarks.getState().load("/root")
    expect(useBookmarks.getState().bookmarks).toEqual([])
  })
})

describe("toggle", () => {
  it("adds a new bookmark and persists", () => {
    useBookmarks.getState().toggle("/root", bm("a.ts", 3))
    expect(useBookmarks.getState().bookmarks).toEqual([bm("a.ts", 3)])
    expect(setBookmarks).toHaveBeenCalledWith("/root", [bm("a.ts", 3)])
  })

  it("removes a matching bookmark and persists", () => {
    useBookmarks.setState({ bookmarks: [bm("a.ts", 3), bm("b.ts", 5)] })
    useBookmarks.getState().toggle("/root", bm("a.ts", 3))
    expect(useBookmarks.getState().bookmarks).toEqual([bm("b.ts", 5)])
    expect(setBookmarks).toHaveBeenCalledWith("/root", [bm("b.ts", 5)])
  })

  it("swallows a persist error", () => {
    vi.mocked(setBookmarks).mockRejectedValueOnce(new Error("disk full"))
    expect(() => useBookmarks.getState().toggle("/root", bm("c.ts", 1))).not.toThrow()
  })
})

describe("remove", () => {
  it("drops the matching bookmark and persists the rest", () => {
    useBookmarks.setState({ bookmarks: [bm("a.ts", 3), bm("b.ts", 5)] })
    useBookmarks.getState().remove("/root", "a.ts", 3)
    expect(useBookmarks.getState().bookmarks).toEqual([bm("b.ts", 5)])
    expect(setBookmarks).toHaveBeenCalledWith("/root", [bm("b.ts", 5)])
  })

  it("is a no-op when nothing matches", () => {
    useBookmarks.setState({ bookmarks: [bm("a.ts", 3)] })
    useBookmarks.getState().remove("/root", "a.ts", 99)
    expect(useBookmarks.getState().bookmarks).toEqual([bm("a.ts", 3)])
  })
})

describe("toggling within one file", () => {
  it("removes only the bookmark on the same line", () => {
    const B = () => useBookmarks.getState()
    useBookmarks.setState({
      bookmarks: [
        { path: "a.ts", line: 3, snippet: "x" },
        { path: "a.ts", line: 9, snippet: "y" },
      ],
    })
    B().toggle("/r", { path: "a.ts", line: 3, snippet: "x" })
    // Matching on path alone would take the line-9 bookmark with it.
    expect(B().bookmarks).toEqual([{ path: "a.ts", line: 9, snippet: "y" }])
  })
})

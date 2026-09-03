// "Open as text" set: a per-session flag on paths whose rich rendering is bypassed.
import { beforeEach, describe, expect, it } from "vitest"
import { useTextView } from "@/lib/textView"

beforeEach(() => useTextView.setState({ force: new Set() }))

describe("openAsText", () => {
  it("flags a path", () => {
    useTextView.getState().openAsText("/a.svg")
    expect(useTextView.getState().force.has("/a.svg")).toBe(true)
  })

  it("is idempotent and keeps other paths", () => {
    useTextView.getState().openAsText("/a.svg")
    useTextView.getState().openAsText("/b.svg")
    useTextView.getState().openAsText("/a.svg")
    expect([...useTextView.getState().force].sort()).toEqual(["/a.svg", "/b.svg"])
  })

  it("replaces the set rather than mutating it (so subscribers re-render)", () => {
    const before = useTextView.getState().force
    useTextView.getState().openAsText("/a.svg")
    expect(useTextView.getState().force).not.toBe(before)
  })
})

describe("toggleText", () => {
  it("adds a path that isn't flagged", () => {
    useTextView.getState().toggleText("/a.md")
    expect(useTextView.getState().force.has("/a.md")).toBe(true)
  })

  it("removes a path that is", () => {
    useTextView.getState().openAsText("/a.md")
    useTextView.getState().toggleText("/a.md")
    expect(useTextView.getState().force.has("/a.md")).toBe(false)
  })

  it("only touches the toggled path", () => {
    useTextView.getState().openAsText("/keep.md")
    useTextView.getState().toggleText("/other.md")
    expect(useTextView.getState().force.has("/keep.md")).toBe(true)
  })
})

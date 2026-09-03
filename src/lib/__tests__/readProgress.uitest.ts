// Reading progress: the read/changed sets, the self-write suppression, and the
// content snapshots that make a later change reviewable as a delta.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  listRead: vi.fn(async () => [] as string[]),
  readFile: vi.fn(async () => ({ kind: "text", text: "body" })),
  setReadState: vi.fn(async () => {}),
}))

import { listRead, readFile, setReadState } from "@/lib/api"
import { noteSelfWrite, useReadProgress, wasSelfWrite } from "@/lib/readProgress"

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks keeps implementations — restore the happy path each time.
  vi.mocked(listRead).mockResolvedValue([])
  vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "body" })
  vi.mocked(setReadState).mockResolvedValue(undefined)
  useReadProgress.setState({ read: new Set(), changed: new Set() })
})
afterEach(() => vi.useRealTimers())

/** Let the promise chain inside mark()/markMany() settle. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe("self-write suppression", () => {
  it("reports a noted write once, then forgets it", () => {
    noteSelfWrite("src/a.ts")
    expect(wasSelfWrite("src/a.ts")).toBe(true)
    // Consumed: a *later* external edit to the same file must not be suppressed.
    expect(wasSelfWrite("src/a.ts")).toBe(false)
  })

  it("is false for a path we never wrote", () => {
    expect(wasSelfWrite("src/never.ts")).toBe(false)
  })

  it("expires so a much later change isn't mistaken for ours", () => {
    vi.useFakeTimers()
    noteSelfWrite("src/b.ts")
    vi.advanceTimersByTime(4001)
    expect(wasSelfWrite("src/b.ts")).toBe(false)
  })
})

describe("load", () => {
  it("fills the read set from the backend and clears pending deltas", async () => {
    useReadProgress.setState({ changed: new Set(["old.ts"]) })
    vi.mocked(listRead).mockResolvedValue(["a.ts", "b.ts"])
    await useReadProgress.getState().load("/root")
    expect(listRead).toHaveBeenCalledWith("/root")
    expect([...useReadProgress.getState().read].sort()).toEqual(["a.ts", "b.ts"])
    expect(useReadProgress.getState().changed.size).toBe(0)
  })

  it("falls back to empty when the backend fails", async () => {
    useReadProgress.setState({ read: new Set(["stale.ts"]) })
    vi.mocked(listRead).mockRejectedValue(new Error("no project"))
    await useReadProgress.getState().load("/root")
    expect(useReadProgress.getState().read.size).toBe(0)
  })
})

describe("mark", () => {
  it("marks read with the content passed in, without re-reading the file", async () => {
    useReadProgress.getState().mark("/root", "a.ts", true, "snapshot")
    expect(useReadProgress.getState().read.has("a.ts")).toBe(true)
    expect(setReadState).toHaveBeenCalledWith("/root", "a.ts", true, "snapshot")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("reading a file clears its pending delta", () => {
    useReadProgress.setState({ changed: new Set(["a.ts"]) })
    useReadProgress.getState().mark("/root", "a.ts", true, "x")
    expect(useReadProgress.getState().changed.has("a.ts")).toBe(false)
  })

  it("snapshots from disk when no content is given", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "from disk" })
    useReadProgress.getState().mark("/root", "a.ts", true)
    await flush()
    expect(setReadState).toHaveBeenCalledWith("/root", "a.ts", true, "from disk")
  })

  it("marks a binary file read with no snapshot", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 12 })
    useReadProgress.getState().mark("/root", "logo.png", true)
    await flush()
    expect(setReadState).toHaveBeenCalledWith("/root", "logo.png", true, undefined)
  })

  it("still records the read when the file can't be read", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("gone"))
    useReadProgress.getState().mark("/root", "a.ts", true)
    await flush()
    expect(setReadState).toHaveBeenCalledWith("/root", "a.ts", true)
  })

  it("unmarking drops the path and never snapshots", () => {
    useReadProgress.setState({ read: new Set(["a.ts"]) })
    useReadProgress.getState().mark("/root", "a.ts", false)
    expect(useReadProgress.getState().read.has("a.ts")).toBe(false)
    expect(setReadState).toHaveBeenCalledWith("/root", "a.ts", false)
    expect(readFile).not.toHaveBeenCalled()
  })

  it("keeps the optimistic mark when the persist fails", async () => {
    vi.mocked(setReadState).mockRejectedValueOnce(new Error("disk full"))
    useReadProgress.getState().mark("/root", "a.ts", true, "x")
    await flush()
    // Deliberately no rollback: a failed disk write must not un-read the file
    // under the reader's cursor.
    expect(useReadProgress.getState().read.has("a.ts")).toBe(true)
  })
})

describe("markMany", () => {
  it("is a no-op for an empty list — including no state notification", () => {
    // `setReadState` is never called either way (the loops just don't run), so
    // that alone proves nothing. The guard exists to avoid publishing fresh
    // Sets, which wakes every subscriber and re-renders the tree for nothing.
    const updates: unknown[] = []
    const unsub = useReadProgress.subscribe((st) => updates.push(st))
    useReadProgress.getState().markMany("/root", [], true)
    unsub()
    expect(updates).toHaveLength(0)
    expect(setReadState).not.toHaveBeenCalled()
  })

  it("marks a whole folder read in one state update", async () => {
    useReadProgress.setState({ changed: new Set(["a.ts"]) })
    // "One state update" is the claim in the name: a per-path `set()` would
    // re-render the tree once per file in a big folder.
    const updates: unknown[] = []
    const unsub = useReadProgress.subscribe((st) => updates.push(st))
    useReadProgress.getState().markMany("/root", ["a.ts", "b.ts"], true)
    unsub()
    expect(updates).toHaveLength(1)
    expect([...useReadProgress.getState().read].sort()).toEqual(["a.ts", "b.ts"])
    expect(useReadProgress.getState().changed.size).toBe(0)
    await flush()
    expect(setReadState).toHaveBeenCalledTimes(2)
  })

  it("unmarks in bulk without reading anything from disk", () => {
    useReadProgress.setState({ read: new Set(["a.ts", "b.ts"]) })
    useReadProgress.getState().markMany("/root", ["a.ts", "b.ts"], false)
    expect(useReadProgress.getState().read.size).toBe(0)
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe("changed flags", () => {
  it("marks and clears a delta", () => {
    useReadProgress.getState().markChanged("a.ts")
    expect(useReadProgress.getState().changed.has("a.ts")).toBe(true)
    useReadProgress.getState().clearChanged("a.ts")
    expect(useReadProgress.getState().changed.has("a.ts")).toBe(false)
  })

  it("clearing an unflagged path is a no-op", () => {
    useReadProgress.getState().markChanged("a.ts")
    useReadProgress.getState().clearChanged("other.ts")
    expect(useReadProgress.getState().changed.has("a.ts")).toBe(true)
  })
})

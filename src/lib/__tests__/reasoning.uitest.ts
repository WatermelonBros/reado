// The agent's live reasoning feed: mirrors `.reado/reasoning.jsonl`, pops itself
// open on the first thought of a run, and survives a project switch.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  reasoningRead: vi.fn(async () => []),
  reasoningClear: vi.fn(async () => {}),
}))

const move = vi.fn()
let placed = true
vi.mock("../layout", () => ({
  findPanel: () => (placed ? { id: "reasoning" } : null),
  useLayout: { getState: () => ({ layout: {}, move }) },
}))

import { reasoningClear, reasoningRead, type Thought } from "@/lib/api"
import { useReasoning } from "@/lib/reasoning"

const thought = (text: string): Thought => ({ ts: 1, kind: "note", text })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(reasoningRead).mockResolvedValue([])
  placed = true
  useReasoning.setState({ open: false, revealed: false, root: "", thoughts: [] })
})

describe("load", () => {
  it("mirrors the file into the store", async () => {
    vi.mocked(reasoningRead).mockResolvedValue([thought("thinking")])
    await useReasoning.getState().load("/root")
    expect(reasoningRead).toHaveBeenCalledWith("/root")
    expect(useReasoning.getState().thoughts).toEqual([thought("thinking")])
  })

  it("pops the panel open on the first thought of a run", async () => {
    vi.mocked(reasoningRead).mockResolvedValue([thought("thinking")])
    await useReasoning.getState().load("/root")
    expect(useReasoning.getState().open).toBe(true)
    expect(useReasoning.getState().revealed).toBe(true)
  })

  it("places the panel first when the saved layout predates it", async () => {
    placed = false
    vi.mocked(reasoningRead).mockResolvedValue([thought("thinking")])
    await useReasoning.getState().load("/root")
    expect(move).toHaveBeenCalledWith("reasoning", "bottom", { split: true })
  })

  it("doesn't re-pop after the user closed it", async () => {
    vi.mocked(reasoningRead).mockResolvedValue([thought("a")])
    await useReasoning.getState().load("/root")
    useReasoning.getState().close()
    vi.mocked(reasoningRead).mockResolvedValue([thought("a"), thought("b")])
    await useReasoning.getState().load("/root")
    expect(useReasoning.getState().open).toBe(false)
    expect(useReasoning.getState().thoughts).toHaveLength(2)
  })

  it("stays shut while the feed is empty", async () => {
    await useReasoning.getState().load("/root")
    expect(useReasoning.getState().open).toBe(false)
  })

  it("drops the previous project's feed and re-arms the auto-reveal", async () => {
    vi.mocked(reasoningRead).mockResolvedValue([thought("old")])
    await useReasoning.getState().load("/a")
    useReasoning.getState().close()
    vi.mocked(reasoningRead).mockResolvedValue([thought("new")])
    await useReasoning.getState().load("/b")
    expect(useReasoning.getState().thoughts).toEqual([thought("new")])
    expect(useReasoning.getState().open).toBe(true)
  })

  it("ignores a stale read that lands after the project changed", async () => {
    vi.mocked(reasoningRead).mockImplementation(async (root: string) => {
      if (root === "/a") {
        // The slow read: by the time it resolves we're in another project.
        useReasoning.setState({ root: "/b" })
        return [thought("stale")]
      }
      return []
    })
    await useReasoning.getState().load("/a")
    expect(useReasoning.getState().thoughts).toEqual([])
  })

  it("survives an unreadable feed", async () => {
    vi.mocked(reasoningRead).mockRejectedValue(new Error("no file"))
    await expect(useReasoning.getState().load("/root")).resolves.toBeUndefined()
    expect(useReasoning.getState().thoughts).toEqual([])
  })
})

describe("clear", () => {
  it("empties the feed and re-arms the auto-reveal", async () => {
    useReasoning.setState({ thoughts: [thought("a")], revealed: true })
    await useReasoning.getState().clear("/root")
    expect(reasoningClear).toHaveBeenCalledWith("/root")
    expect(useReasoning.getState().thoughts).toEqual([])
    expect(useReasoning.getState().revealed).toBe(false)
  })

  it("clears locally even when the backend call fails", async () => {
    vi.mocked(reasoningClear).mockRejectedValue(new Error("locked"))
    useReasoning.setState({ thoughts: [thought("a")] })
    await useReasoning.getState().clear("/root")
    expect(useReasoning.getState().thoughts).toEqual([])
  })
})

describe("toggle / close", () => {
  it("opens, placing the panel if the layout lacks it", () => {
    placed = false
    useReasoning.getState().toggle()
    expect(useReasoning.getState().open).toBe(true)
    expect(move).toHaveBeenCalled()
  })

  it("closing never touches the layout", () => {
    useReasoning.setState({ open: true })
    useReasoning.getState().toggle()
    expect(useReasoning.getState().open).toBe(false)
    expect(move).not.toHaveBeenCalled()
  })

  it("close is idempotent", () => {
    useReasoning.setState({ open: true })
    useReasoning.getState().close()
    expect(useReasoning.getState().open).toBe(false)
    useReasoning.getState().close()
    expect(useReasoning.getState().open).toBe(false)
    expect(move).not.toHaveBeenCalled()
  })
})

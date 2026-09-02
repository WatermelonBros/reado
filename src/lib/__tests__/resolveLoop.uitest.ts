// The async resolve loop store. Covers load/start/sync/tick/clear across success,
// empty and idle branches. Edges (api, agents, review, comments, notify) are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  anywherePublishLoop: vi.fn(() => Promise.resolve()),
  createFile: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve(null)),
  writeFile: vi.fn(() => Promise.resolve()),
}))
vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve(true)) }))
vi.mock("../review", () => ({
  composeReviewPromptForIds: vi.fn((ids: string[]) => `prompt:${ids.join(",")}`),
}))
const commentsState: { comments: Array<{ id: string; kind: string; state: string }> } = {
  comments: [],
}
vi.mock("../comments", () => ({ useComments: { getState: () => commentsState } }))
vi.mock("../notify", () => ({ notifyResolved: vi.fn(() => Promise.resolve()) }))

import { dispatchToAgent } from "@/lib/agents"
import { anywherePublishLoop, createFile, readFile, writeFile } from "@/lib/api"
import { notifyResolved } from "@/lib/notify"
import { type LoopState, useResolveLoop } from "@/lib/resolveLoop"
import { composeReviewPromptForIds } from "@/lib/review"

const flush = () => new Promise((r) => setTimeout(r))

const loop = (p: Partial<LoopState> = {}): LoopState => ({
  ids: ["a"],
  resolvedIds: [],
  status: "running",
  startedAt: 0,
  lastProgressAt: Date.now(),
  ...p,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readFile).mockReset()
  vi.mocked(readFile).mockResolvedValue(null as never)
  vi.mocked(createFile).mockResolvedValue(undefined as never)
  vi.mocked(writeFile).mockResolvedValue(undefined as never)
  vi.mocked(anywherePublishLoop).mockResolvedValue(undefined as never)
  vi.mocked(dispatchToAgent).mockResolvedValue(true)
  vi.mocked(notifyResolved).mockResolvedValue(undefined as never)
  commentsState.comments = []
  useResolveLoop.setState({ active: null })
})

describe("load", () => {
  it("ignores a missing store file", async () => {
    vi.mocked(readFile).mockResolvedValue(null as never)
    await useResolveLoop.getState().load("/p")
    expect(useResolveLoop.getState().active).toBeNull()
  })

  it("ignores a non-text store file", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary" } as never)
    await useResolveLoop.getState().load("/p")
    expect(useResolveLoop.getState().active).toBeNull()
  })

  it("resumes a still-running loop and syncs it", async () => {
    commentsState.comments = [{ id: "t1", kind: "task", state: "open" }]
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify(loop({ ids: ["t1"] })),
    } as never)
    await useResolveLoop.getState().load("/p")
    const active = useResolveLoop.getState().active
    expect(active?.ids).toEqual(["t1"])
    expect(active?.status).toBe("running")
  })

  it("does not resume a finished loop", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify(loop({ status: "finished" })),
    } as never)
    await useResolveLoop.getState().load("/p")
    expect(useResolveLoop.getState().active).toBeNull()
  })

  it("ignores malformed JSON", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "{ not json" } as never)
    await useResolveLoop.getState().load("/p")
    expect(useResolveLoop.getState().active).toBeNull()
  })
})

describe("start", () => {
  it("queues explicit ids, persists and dispatches the agent", async () => {
    await useResolveLoop.getState().start("/p", ["x", "y"], "sess")
    const active = useResolveLoop.getState().active
    expect(active?.ids).toEqual(["x", "y"])
    expect(active?.status).toBe("running")
    expect(active?.sessionId).toBe("sess")
    expect(composeReviewPromptForIds).toHaveBeenCalledWith(["x", "y"])
    expect(dispatchToAgent).toHaveBeenCalledWith("prompt:x,y")
    await flush()
    expect(createFile).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalled()
    expect(anywherePublishLoop).toHaveBeenCalled()
  })

  it("defaults to all open task comments when ids are empty", async () => {
    commentsState.comments = [
      { id: "o1", kind: "task", state: "open" },
      { id: "done1", kind: "task", state: "done" },
      { id: "n1", kind: "note", state: "open" },
    ]
    await useResolveLoop.getState().start("/p", [])
    expect(useResolveLoop.getState().active?.ids).toEqual(["o1"])
  })

  it("does nothing when there is nothing to queue", async () => {
    await useResolveLoop.getState().start("/p", [])
    expect(useResolveLoop.getState().active).toBeNull()
    expect(dispatchToAgent).not.toHaveBeenCalled()
  })
})

describe("blocked tasks", () => {
  it("are left out of the queue", async () => {
    commentsState.comments = [
      { id: "a", kind: "task", state: "open" },
      { id: "b", kind: "task", state: "blocked" },
    ]
    await useResolveLoop.getState().start("/p", [])
    // The agent already tried `b` and handed it back with a question.
    expect(useResolveLoop.getState().active?.ids).toEqual(["a"])
  })

  it("do not hold a loop open forever", () => {
    useResolveLoop.setState({ active: loop({ ids: ["a", "b"] }) })
    commentsState.comments = [
      { id: "a", kind: "task", state: "done" },
      { id: "b", kind: "task", state: "blocked" },
    ]
    useResolveLoop.getState().sync("/p")
    // The loop is done with `b`; the human is not.
    expect(useResolveLoop.getState().active?.status).toBe("finished")
  })
})

describe("unverified resolutions", () => {
  it("are not queued: the agent is finished, the human is not", async () => {
    commentsState.comments = [
      { id: "a", kind: "task", state: "open" },
      { id: "b", kind: "task", state: "resolved-unverified" },
    ]
    await useResolveLoop.getState().start("/p", [])
    expect(useResolveLoop.getState().active?.ids).toEqual(["a"])
  })

  it("are counted separately from the resolved ones", () => {
    useResolveLoop.setState({ active: loop({ ids: ["a", "b"] }) })
    commentsState.comments = [
      { id: "a", kind: "task", state: "done" },
      { id: "b", kind: "task", state: "resolved-unverified" },
    ]
    useResolveLoop.getState().sync("/p")
    const active = useResolveLoop.getState().active
    // `b` is not a resolution the loop can vouch for, so it isn't counted as one.
    expect(active?.resolvedIds).toEqual(["a"])
    expect(active?.unverifiedIds).toEqual(["b"])
    expect(active?.status).toBe("finished")
  })
})

describe("resume", () => {
  it("re-dispatches only the tasks still outstanding", async () => {
    useResolveLoop.setState({ active: loop({ ids: ["a", "b", "c"] }) })
    commentsState.comments = [
      { id: "a", kind: "task", state: "done" },
      { id: "b", kind: "task", state: "open" },
      { id: "c", kind: "task", state: "blocked" },
    ]
    const sent = useResolveLoop.getState().resume("/p")
    expect(sent).toBe(1)
    expect(composeReviewPromptForIds).toHaveBeenCalledWith(["b"])
  })

  it("dispatches nothing when everything queued is settled", () => {
    useResolveLoop.setState({ active: loop({ ids: ["a"] }) })
    commentsState.comments = [{ id: "a", kind: "task", state: "done" }]
    expect(useResolveLoop.getState().resume("/p")).toBe(0)
    expect(dispatchToAgent).not.toHaveBeenCalled()
    expect(useResolveLoop.getState().active?.status).toBe("finished")
  })

  it("is a no-op without an active loop", () => {
    useResolveLoop.setState({ active: null })
    expect(useResolveLoop.getState().resume("/p")).toBe(0)
  })
})

describe("failure", () => {
  it("fails the loop when the prompt never reached an agent", async () => {
    // No agent installed: dispatchToAgent reports it did not send.
    vi.mocked(dispatchToAgent).mockResolvedValue(false)
    commentsState.comments = [{ id: "a", kind: "task", state: "open" }]
    await useResolveLoop.getState().start("/p", ["a"])
    await flush()
    expect(useResolveLoop.getState().active?.status).toBe("failed")
  })

  it("fails the loop when the dispatch throws", async () => {
    vi.mocked(dispatchToAgent).mockRejectedValue(new Error("terminal gone"))
    commentsState.comments = [{ id: "a", kind: "task", state: "open" }]
    await useResolveLoop.getState().start("/p", ["a"])
    await flush()
    expect(useResolveLoop.getState().active?.status).toBe("failed")
  })

  it("persists the failure so a restart does not resume a dead loop", async () => {
    vi.mocked(dispatchToAgent).mockResolvedValue(false)
    commentsState.comments = [{ id: "a", kind: "task", state: "open" }]
    await useResolveLoop.getState().start("/p", ["a"])
    await flush()
    const calls = vi.mocked(writeFile).mock.calls
    const written = calls[calls.length - 1]?.[2] as string
    expect(JSON.parse(written).status).toBe("failed")
  })

  it("a failed loop stops tracking progress", () => {
    useResolveLoop.setState({ active: loop({ status: "failed" }) })
    commentsState.comments = [{ id: "a", kind: "task", state: "done" }]
    useResolveLoop.getState().sync("/p")
    // Not resurrected into "finished" by comments resolving later.
    expect(useResolveLoop.getState().active?.status).toBe("failed")
  })

  it("does not fail a loop that already finished", () => {
    useResolveLoop.setState({ active: loop({ status: "finished" }) })
    useResolveLoop.getState().fail("/p", "dispatch")
    expect(useResolveLoop.getState().active?.status).toBe("finished")
  })

  it("is a no-op without an active loop", () => {
    useResolveLoop.setState({ active: null })
    useResolveLoop.getState().fail("/p", "dispatch")
    expect(useResolveLoop.getState().active).toBeNull()
  })
})

describe("sync", () => {
  it("records partial progress and bumps lastProgressAt", () => {
    // a is genuinely resolved (present + done); b is still open.
    commentsState.comments = [
      { id: "a", kind: "task", state: "done" },
      { id: "b", kind: "task", state: "open" },
    ]
    useResolveLoop.setState({ active: loop({ ids: ["a", "b"], lastProgressAt: 1 }) })
    useResolveLoop.getState().sync("/p")
    const active = useResolveLoop.getState().active
    expect(active?.resolvedIds).toEqual(["a"])
    expect(active?.status).toBe("running")
    expect(active?.lastProgressAt).toBeGreaterThan(1)
    expect(notifyResolved).not.toHaveBeenCalled()
  })

  it("finishes and notifies when every task resolves", () => {
    commentsState.comments = [{ id: "a", kind: "task", state: "done" }]
    useResolveLoop.setState({ active: loop({ ids: ["a"] }) })
    useResolveLoop.getState().sync("/p")
    const active = useResolveLoop.getState().active
    expect(active?.status).toBe("finished")
    expect(active?.resolvedIds).toEqual(["a"])
    expect(notifyResolved).toHaveBeenCalledWith(0)
  })

  it("does not count a deleted (gone) task as resolved", () => {
    // a is genuinely done; b was deleted while c is still open — b must fall
    // out of scope (not resolved) and must not prematurely finish the batch.
    commentsState.comments = [
      { id: "a", kind: "task", state: "done" },
      { id: "c", kind: "task", state: "open" },
    ]
    useResolveLoop.setState({ active: loop({ ids: ["a", "b", "c"] }) })
    useResolveLoop.getState().sync("/p")
    const active = useResolveLoop.getState().active
    expect(active?.resolvedIds).toEqual(["a"])
    expect(active?.status).toBe("running")
    expect(notifyResolved).not.toHaveBeenCalled()
  })

  it("is a no-op without an active loop", () => {
    useResolveLoop.getState().sync("/p")
    expect(useResolveLoop.getState().active).toBeNull()
  })

  it("is a no-op for a finished loop", () => {
    useResolveLoop.setState({ active: loop({ status: "finished" }) })
    useResolveLoop.getState().sync("/p")
    expect(notifyResolved).not.toHaveBeenCalled()
  })
})

describe("tick", () => {
  it("flags needs_approval when the agent has gone quiet", () => {
    useResolveLoop.setState({ active: loop({ lastProgressAt: Date.now() - 200_000 }) })
    useResolveLoop.getState().tick("/p")
    expect(useResolveLoop.getState().active?.status).toBe("needs_approval")
  })

  it("leaves a recently-active loop running", () => {
    useResolveLoop.setState({ active: loop({ lastProgressAt: Date.now() }) })
    useResolveLoop.getState().tick("/p")
    expect(useResolveLoop.getState().active?.status).toBe("running")
  })

  it("is a no-op when not running", () => {
    useResolveLoop.setState({ active: loop({ status: "needs_approval" }) })
    useResolveLoop.getState().tick("/p")
    expect(useResolveLoop.getState().active?.status).toBe("needs_approval")
  })
})

describe("clear", () => {
  it("clears the loop and persists null", async () => {
    useResolveLoop.setState({ active: loop() })
    useResolveLoop.getState().clear("/p")
    expect(useResolveLoop.getState().active).toBeNull()
    await flush()
    expect(writeFile).toHaveBeenCalledWith("/p", expect.any(String), "null")
    expect(anywherePublishLoop).toHaveBeenCalledWith(null)
  })
})

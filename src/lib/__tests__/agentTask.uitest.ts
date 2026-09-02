// The shared agent-task runner: the five states, the poll loop's tolerance for a
// file that isn't there yet, cancellation (registry, supersede, caller signal),
// retry with backoff, and the in-flight registry. The agent dispatch and the
// notice surface are mocked at the edges.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve()) }))
vi.mock("../notice", () => ({ notifyError: vi.fn() }))

import { dispatchToAgent } from "@/lib/agents"
import { POLL_MS, runAgentTask, useAgentTasks } from "@/lib/agentTask"
import { notifyError } from "@/lib/notice"

/** A task with the boring parts filled in: identity text, a 3-tick budget. */
const run = <T = string>(over: Partial<Parameters<typeof runAgentTask<T>>[0]> = {}) =>
  runAgentTask<T>({
    id: "task",
    labelKey: "synopsis.title",
    prompt: "do the thing",
    poll: () => Promise.resolve(null),
    parse: ((text: string) => text) as (raw: string) => T | undefined,
    timeoutMs: 3 * POLL_MS,
    ...over,
  })

/** Advance `n` poll ticks, letting each tick's async work settle. */
const ticks = (n: number) => vi.advanceTimersByTimeAsync(n * POLL_MS)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useAgentTasks.setState({ running: [] })
})

afterEach(() => {
  for (const task of useAgentTasks.getState().running) useAgentTasks.getState().cancel(task.id)
  vi.useRealTimers()
})

describe("done", () => {
  it("dispatches the prompt and resolves with the parsed value", async () => {
    const task = run({ poll: () => Promise.resolve("RESULT") })
    expect(dispatchToAgent).toHaveBeenCalledWith("do the thing")
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "done", value: "RESULT" })
  })

  it("parses the raw result into a typed value", async () => {
    const task = run<number[]>({
      poll: () => Promise.resolve("[1,2]"),
      parse: (raw) => JSON.parse(raw) as number[],
    })
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "done", value: [1, 2] })
  })

  it("polls without dispatching when there is no prompt", async () => {
    const task = run({ prompt: undefined, poll: () => Promise.resolve("R") })
    expect(dispatchToAgent).not.toHaveBeenCalled()
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "done", value: "R" })
  })

  it("waits a full interval before the first read", async () => {
    const poll = vi.fn(() => Promise.resolve("R"))
    void run({ poll })
    expect(poll).not.toHaveBeenCalled()
    await ticks(1)
    expect(poll).toHaveBeenCalledOnce()
  })
})

describe("a result that isn't there yet", () => {
  it("keeps polling past null, empty and whitespace-only reads", async () => {
    const poll = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("   ")
      .mockResolvedValue("LATE")
    const task = run({ poll, timeoutMs: 9 * POLL_MS })
    await ticks(4)
    await expect(task).resolves.toEqual({ status: "done", value: "LATE" })
  })

  it("treats a failed read as not-yet-written, not as an error", async () => {
    const poll = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValue("R")
    const task = run({ poll, timeoutMs: 9 * POLL_MS })
    await ticks(2)
    await expect(task).resolves.toEqual({ status: "done", value: "R" })
  })

  it("keeps polling while parse returns undefined (a half-written file)", async () => {
    const parse = vi
      .fn<(raw: string) => string | undefined>()
      .mockReturnValueOnce(undefined)
      .mockReturnValue("WHOLE")
    const task = run({ poll: () => Promise.resolve("partial"), parse, timeoutMs: 9 * POLL_MS })
    await ticks(2)
    await expect(task).resolves.toEqual({ status: "done", value: "WHOLE" })
    expect(parse).toHaveBeenCalledTimes(2)
  })
})

describe("failed", () => {
  it("reports a throwing parse as failed, not as an empty success", async () => {
    const task = run({
      poll: () => Promise.resolve("{ not json"),
      parse: (raw) => JSON.parse(raw) as string,
    })
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "failed", value: null })
  })

  it("fails fast rather than burning the budget on the same bad file", async () => {
    const poll = vi.fn(() => Promise.resolve("bad"))
    const task = run({
      poll,
      parse: () => {
        throw new Error("malformed")
      },
      timeoutMs: 20 * POLL_MS,
    })
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "failed", value: null })
    expect(poll).toHaveBeenCalledOnce()
  })

  it("surfaces the failure on the notice surface", async () => {
    const task = run({
      poll: () => Promise.resolve("x"),
      parse: () => {
        throw new Error("malformed")
      },
    })
    await ticks(1)
    await task
    expect(notifyError).toHaveBeenCalledOnce()
  })
})

describe("timedOut", () => {
  it("gives up after the budget with nothing written", async () => {
    const task = run()
    await ticks(3)
    await expect(task).resolves.toEqual({ status: "timedOut", value: null })
  })

  it("polls exactly the budgeted number of times", async () => {
    const poll = vi.fn(() => Promise.resolve(null))
    const task = run({ poll, timeoutMs: 5 * POLL_MS })
    await ticks(5)
    await task
    expect(poll).toHaveBeenCalledTimes(5)
  })

  it("keeps a budget of at least one poll", async () => {
    const poll = vi.fn(() => Promise.resolve(null))
    const task = run({ poll, timeoutMs: 0 })
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "timedOut", value: null })
    expect(poll).toHaveBeenCalledOnce()
  })

  it("surfaces the timeout on the notice surface", async () => {
    const task = run()
    await ticks(3)
    await task
    expect(notifyError).toHaveBeenCalledOnce()
  })
})

describe("cancelled", () => {
  it("stops polling when cancelled through the registry", async () => {
    const poll = vi.fn(() => Promise.resolve(null))
    const task = run({ poll, timeoutMs: 20 * POLL_MS })
    await ticks(1)
    useAgentTasks.getState().cancel("task")
    await expect(task).resolves.toEqual({ status: "cancelled", value: null })
    const calls = poll.mock.calls.length
    await ticks(5)
    expect(poll).toHaveBeenCalledTimes(calls) // no polling after the cancel
  })

  it("does not announce a cancellation", async () => {
    const task = run({ timeoutMs: 20 * POLL_MS })
    useAgentTasks.getState().cancel("task")
    await task
    expect(notifyError).not.toHaveBeenCalled()
  })

  it("ignores a late result after the cancel", async () => {
    const task = run({ poll: () => Promise.resolve("LATE"), timeoutMs: 20 * POLL_MS })
    useAgentTasks.getState().cancel("task")
    await ticks(3)
    await expect(task).resolves.toEqual({ status: "cancelled", value: null })
  })

  it("honours a caller-supplied signal", async () => {
    const controller = new AbortController()
    const task = run({ signal: controller.signal, timeoutMs: 20 * POLL_MS })
    await ticks(1)
    controller.abort()
    await expect(task).resolves.toEqual({ status: "cancelled", value: null })
  })

  it("cancels one task without touching the others", async () => {
    const a = run({ id: "a", poll: () => Promise.resolve("A"), timeoutMs: 20 * POLL_MS })
    const b = run({ id: "b", timeoutMs: 20 * POLL_MS })
    useAgentTasks.getState().cancel("b")
    await expect(b).resolves.toMatchObject({ status: "cancelled" })
    await ticks(1)
    await expect(a).resolves.toEqual({ status: "done", value: "A" })
  })

  it("cancelling an unknown id is a no-op", () => {
    expect(() => useAgentTasks.getState().cancel("nobody")).not.toThrow()
  })

  it("a second task on the same id supersedes the first", async () => {
    const first = run({ poll: () => Promise.resolve(null), timeoutMs: 20 * POLL_MS })
    const second = run({ poll: () => Promise.resolve("SECOND"), timeoutMs: 20 * POLL_MS })
    await expect(first).resolves.toEqual({ status: "cancelled", value: null })
    await ticks(1)
    await expect(second).resolves.toEqual({ status: "done", value: "SECOND" })
  })
})

describe("retry", () => {
  it("re-dispatches after a backoff and can then succeed", async () => {
    const poll = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("bad")
      .mockResolvedValue("good")
    const task = run({
      poll,
      parse: (raw) => {
        if (raw === "bad") throw new Error("malformed")
        return raw
      },
      retries: 1,
    })
    await ticks(1) // first attempt fails on the malformed result
    expect(dispatchToAgent).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(2 * POLL_MS) // backoff
    expect(dispatchToAgent).toHaveBeenCalledTimes(2)
    await ticks(1)
    await expect(task).resolves.toEqual({ status: "done", value: "good" })
    expect(notifyError).not.toHaveBeenCalled()
  })

  it("reports the failure once the retries are spent", async () => {
    const task = run({ retries: 1, timeoutMs: 2 * POLL_MS })
    await vi.advanceTimersByTimeAsync(20 * POLL_MS)
    await expect(task).resolves.toEqual({ status: "timedOut", value: null })
    expect(dispatchToAgent).toHaveBeenCalledTimes(2)
    expect(notifyError).toHaveBeenCalledOnce()
  })

  it("does not retry a task that was cancelled", async () => {
    const task = run({ retries: 3, timeoutMs: 20 * POLL_MS })
    useAgentTasks.getState().cancel("task")
    await task
    expect(dispatchToAgent).toHaveBeenCalledOnce()
  })

  it("stops retrying once cancelled during the backoff", async () => {
    const task = run({ retries: 3, timeoutMs: 1 * POLL_MS })
    await ticks(1) // first attempt times out; the backoff starts
    useAgentTasks.getState().cancel("task")
    await expect(task).resolves.toEqual({ status: "cancelled", value: null })
    expect(dispatchToAgent).toHaveBeenCalledOnce()
  })
})

describe("in-flight registry", () => {
  it("lists a task while it polls and drops it when it finishes", async () => {
    const task = run({ poll: () => Promise.resolve("R") })
    expect(useAgentTasks.getState().running).toEqual([{ id: "task", labelKey: "synopsis.title" }])
    await ticks(1)
    await task
    expect(useAgentTasks.getState().running).toEqual([])
  })

  it("keeps one entry per id when a run supersedes another", async () => {
    const first = run({ timeoutMs: 20 * POLL_MS })
    const second = run({ timeoutMs: 20 * POLL_MS })
    expect(useAgentTasks.getState().running).toHaveLength(1)
    await first
    // The superseded run must not evict the entry belonging to its replacement.
    expect(useAgentTasks.getState().running).toHaveLength(1)
    useAgentTasks.getState().cancel("task")
    await second
    expect(useAgentTasks.getState().running).toEqual([])
  })

  it("tracks concurrent tasks separately", async () => {
    const a = run({ id: "a", poll: () => Promise.resolve("A") })
    const b = run({ id: "b", timeoutMs: 20 * POLL_MS })
    expect(useAgentTasks.getState().running.map((task) => task.id)).toEqual(["a", "b"])
    await ticks(1)
    await a
    expect(useAgentTasks.getState().running.map((task) => task.id)).toEqual(["b"])
    useAgentTasks.getState().cancel("b")
    await b
  })
})

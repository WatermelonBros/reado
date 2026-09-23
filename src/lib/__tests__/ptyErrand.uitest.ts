// A command run in a hidden shell: it ends on the shell's exit, on its backstop
// timer, or on request — and every way out kills the shell and drops both
// subscriptions, so a finished errand leaves nothing running behind it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  onLine: null as ((line: string) => void) | null,
  onExit: null as (() => void) | null,
  offLines: vi.fn(),
  offExit: vi.fn(),
}))
vi.mock("../api", () => ({
  onPtyExit: vi.fn(async (_id: string, cb: () => void) => {
    h.onExit = cb
    return h.offExit
  }),
  ptyKill: vi.fn(async () => {}),
  ptySpawn: vi.fn(async () => {}),
  submitToTerminal: vi.fn(),
}))
vi.mock("../terminals", () => ({
  listenPtyLines: vi.fn(async (_id: string, cb: (line: string) => void) => {
    h.onLine = cb
    return h.offLines
  }),
  offSafe: (off: (() => void) | null) => off?.(),
  plainText: (s: string) => s,
}))

import { ptyKill, ptySpawn, submitToTerminal } from "@/lib/api"
import { runHidden } from "@/lib/ptyErrand"

/** Let the subscriptions and the spawn settle. */
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe("runHidden", () => {
  it("types the command and an exit, and ends on the shell's exit", async () => {
    const run = runHidden("e1", "/root", "make test", { timeoutMs: 1000 })
    await settle()
    expect(ptySpawn).toHaveBeenCalledWith("e1", "/root", 24, 200)
    expect(submitToTerminal).toHaveBeenCalledWith("e1", "make test", 200)
    expect(submitToTerminal).toHaveBeenCalledWith("e1", "exit", 400)
    h.onLine?.("ok")
    h.onExit?.()
    await expect(run.done).resolves.toEqual({ reason: "exit", tail: "ok\n", error: undefined })
    expect(ptyKill).toHaveBeenCalledWith("e1")
    expect(h.offLines).toHaveBeenCalled()
    expect(h.offExit).toHaveBeenCalled()
  })

  it("an idle backstop measures silence, not the whole run", async () => {
    const run = runHidden("e2", "/root", "x", { timeoutMs: 1000, idle: true })
    await settle()
    await vi.advanceTimersByTimeAsync(900)
    h.onLine?.("still going")
    await vi.advanceTimersByTimeAsync(900)
    expect(ptyKill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    await expect(run.done).resolves.toMatchObject({ reason: "timeout" })
  })

  it("a plain backstop runs out however much is printed", async () => {
    const run = runHidden("e3", "/root", "x", { timeoutMs: 1000 })
    await settle()
    await vi.advanceTimersByTimeAsync(900)
    h.onLine?.("busy")
    await vi.advanceTimersByTimeAsync(100)
    await expect(run.done).resolves.toMatchObject({ reason: "timeout" })
  })

  it("stopped before it started, it never spawns and keeps no subscription", async () => {
    const run = runHidden("e4", "/root", "x", { timeoutMs: 1000 })
    run.stop()
    await settle()
    await expect(run.done).resolves.toMatchObject({ reason: "stopped" })
    expect(ptySpawn).not.toHaveBeenCalled()
    expect(h.offLines).toHaveBeenCalled()
    expect(h.offExit).toHaveBeenCalled()
  })

  it("reports a shell that would not start", async () => {
    vi.mocked(ptySpawn).mockRejectedValueOnce(new Error("no shell"))
    const run = runHidden("e5", "/root", "x", { timeoutMs: 1000 })
    await settle()
    const end = await run.done
    expect(end.reason).toBe("spawnFailed")
    expect(String(end.error)).toContain("no shell")
    expect(submitToTerminal).not.toHaveBeenCalled()
  })

  it("keeps only the last of the output", async () => {
    const run = runHidden("e6", "/root", "x", { timeoutMs: 1000, tailChars: 6 })
    await settle()
    h.onLine?.("first")
    h.onLine?.("second")
    run.stop()
    expect((await run.done).tail).toBe("econd\n")
  })
})

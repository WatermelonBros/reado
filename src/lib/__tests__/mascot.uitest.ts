// What the companion shows, and what it refuses to show. The rules here are the
// difference between a colleague and a paperclip, so they are tested rather than
// hoped for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentIsBusy, moodOf, useMascot } from "@/lib/mascot"

const reset = () => useMascot.setState({ state: "idle", text: undefined, seq: 0 })

beforeEach(() => {
  vi.useFakeTimers()
  reset()
})
afterEach(() => {
  useMascot.getState().hush()
  vi.useRealTimers()
})

describe("what a handoff turns into", () => {
  it("asks when the agent is blocked — that is the one that means come here", () => {
    useMascot.getState().handoff("blocked", "needs a token")
    expect(useMascot.getState()).toMatchObject({ state: "ask", text: "needs a token" })
  })

  it("settles when the agent is done, and when it failed", () => {
    useMascot.getState().handoff("done", "all green")
    expect(useMascot.getState().state).toBe("done")
    useMascot.getState().handoff("failed", "could not build")
    // A failure is news, not a question: it does not sit there asking.
    expect(useMascot.getState().state).toBe("done")
  })

  it("says nothing when the agent said nothing", () => {
    useMascot.getState().handoff("done", "")
    expect(useMascot.getState().text).toBeUndefined()
  })
})

describe("what it refuses to do", () => {
  it("does not talk over a standing question", () => {
    useMascot.getState().handoff("blocked", "which branch?")
    useMascot.getState().working()
    expect(useMascot.getState().state).toBe("ask")
  })

  it("does not wipe words that are still on screen", () => {
    // An agent's TUI keeps repainting after it has finished. Without this, the
    // summary it just printed is gone a tenth of a second later.
    useMascot.getState().handoff("done", "12 files, all green")
    useMascot.getState().working()
    expect(useMascot.getState()).toMatchObject({ state: "done", text: "12 files, all green" })
  })

  it("lets the bubble go on its own, and keeps a question's face", () => {
    useMascot.getState().handoff("done", "all green")
    vi.advanceTimersByTime(31_000)
    expect(useMascot.getState()).toMatchObject({ state: "idle", text: undefined })

    useMascot.getState().handoff("blocked", "which branch?")
    vi.advanceTimersByTime(31_000)
    // The words go; the question stands until someone answers it.
    expect(useMascot.getState()).toMatchObject({ state: "ask", text: undefined })
  })

  it("asks at most once a second however fast the pane paints", () => {
    const seen: number[] = []
    const off = useMascot.subscribe((s) => seen.push(s.seq))
    for (let i = 0; i < 50; i++) agentIsBusy()
    off()
    expect(seen.length).toBeLessThanOrEqual(1)
  })
})

describe("a test run", () => {
  it("asks when something failed and settles when nothing did", () => {
    useMascot.getState().tested(3)
    expect(useMascot.getState().state).toBe("ask")
    useMascot.getState().hush()
    useMascot.getState().tested(0)
    expect(useMascot.getState().state).toBe("done")
  })
})

describe("what an agent may name as a mood", () => {
  it("takes the four it knows", () => {
    for (const m of ["done", "ask", "think", "talk"]) expect(moodOf(m)).toBe(m)
  })

  it("falls back to talking for a word it invented", () => {
    // Undefined, not a guess: `say` reads this as "just say it".
    expect(moodOf("ecstatic")).toBeUndefined()
    expect(moodOf(undefined)).toBeUndefined()
    useMascot.getState().say("hello", moodOf("ecstatic"))
    expect(useMascot.getState().state).toBe("talk")
  })
})

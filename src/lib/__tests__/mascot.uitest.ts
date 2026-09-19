// What the companion shows, and what it refuses to show. The rules here are the
// difference between a colleague and a paperclip, so they are tested rather than
// hoped for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentAsked, agentIsBusy, moodOf, useMascot } from "@/lib/mascot"

const reset = () => {
  useMascot.setState({ state: "idle", text: undefined, seq: 0 })
  // The "has it handed back?" latch outlives the store — it is a fact about the
  // session, not about the face. Clear it too, or a test inherits the last one's.
  agentAsked()
}

// Never let the clock go backwards between tests. The once-a-second throttle in
// `agentIsBusy` is module state, so a test that advanced 30s followed by one
// that starts from the real clock again leaves it holding a timestamp in the
// future — and swallowing every paint the next test makes.
let clock = 600_000
beforeEach(() => {
  vi.useFakeTimers()
  clock += 600_000
  vi.setSystemTime(clock)
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

describe("when the work stops showing", () => {
  it("goes back to idle once the pane falls silent", () => {
    useMascot.getState().working()
    expect(useMascot.getState().state).toBe("think")
    vi.advanceTimersByTime(16_000)
    // No handoff ever came — plenty of agents never send one. A face stuck on
    // "working" is the one thing that makes the companion worth ignoring.
    expect(useMascot.getState().state).toBe("idle")
  })

  it("keeps thinking for as long as the pane keeps painting", () => {
    useMascot.getState().working()
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(10_000)
      useMascot.getState().working()
    }
    expect(useMascot.getState().state).toBe("think")
  })

  it("never takes back a face someone else has since shown", () => {
    useMascot.getState().working()
    useMascot.getState().handoff("blocked", "which branch?")
    vi.advanceTimersByTime(60_000)
    // The question outlives both clocks: the work one was cancelled, and the
    // bubble's leaves the face behind.
    expect(useMascot.getState().state).toBe("ask")
  })
})

describe("after the agent has handed the turn back", () => {
  const paint = () => {
    // Past the once-a-second throttle, so each call is a fresh sign of work.
    vi.advanceTimersByTime(1100)
    agentIsBusy()
  }

  it("does not go back to thinking because its pane is still moving", () => {
    useMascot.getState().handoff("done", "all green")
    vi.advanceTimersByTime(31_000) // the bubble goes; the face settles to idle
    expect(useMascot.getState().state).toBe("idle")
    paint()
    paint()
    // A TUI redraws its prompt for a while after it has finished. That is not
    // work, and saying it is was the whole complaint.
    expect(useMascot.getState().state).toBe("idle")
  })

  it("believes the pane again once someone answers the agent in it", () => {
    useMascot.getState().handoff("done", "all green")
    vi.advanceTimersByTime(31_000)
    agentAsked()
    paint()
    expect(useMascot.getState().state).toBe("think")
  })

  it("believes it again when Reado dispatches a prompt itself", () => {
    useMascot.getState().handoff("done", "all green")
    // The dispatch lands while the summary is still on screen, so the face does
    // not change yet — words that are still being read are never talked over.
    // The turn is the agent's again all the same, and its pane counts again.
    useMascot.getState().working()
    vi.advanceTimersByTime(31_000)
    paint()
    expect(useMascot.getState().state).toBe("think")
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

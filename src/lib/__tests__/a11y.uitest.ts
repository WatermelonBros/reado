// The live region and the cue are both opt-in, and the opt-in is the whole
// point: a live region that talks to everyone gets switched off, and a tone
// nobody asked for is worse than silence. So what is asserted here is mostly
// that both stay quiet until they are turned on.
import { beforeEach, describe, expect, it, vi } from "vitest"

import { __resetAudio, announce, cue, useAnnouncer } from "@/lib/a11y"
import { useSettings } from "@/lib/store"

/** A stand-in for WebAudio that records whether a tone was actually started. */
function stubAudio() {
  const start = vi.fn()
  const gain = {
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(() => ({ connect: vi.fn() })),
  }
  const osc = {
    type: "",
    frequency: { value: 0 },
    connect: vi.fn(() => gain),
    start,
    stop: vi.fn(),
  }
  const ctx = {
    state: "running",
    currentTime: 0,
    createOscillator: () => osc,
    createGain: () => gain,
    resume: vi.fn(),
    close: vi.fn(),
  }
  // A real function, not an arrow: `cue` calls it with `new`, and an arrow is
  // not a constructor — which the catch would swallow into "no cue played".
  vi.stubGlobal("AudioContext", function AudioContextStub() {
    return ctx
  } as unknown as typeof AudioContext)
  return { start, osc }
}

beforeEach(() => {
  useAnnouncer.setState({ message: "", nonce: 0, assertive: false })
  useSettings.setState({ screenReader: false, audioCues: false })
  vi.unstubAllGlobals()
  // The context is cached for the app's lifetime; each test gets a fresh one.
  __resetAudio()
})

describe("announcing", () => {
  it("says nothing at all with the setting off", () => {
    announce("the caret moved")
    expect(useAnnouncer.getState().message).toBe("")
  })

  it("carries the message once the reader has asked for it", () => {
    useSettings.setState({ screenReader: true })
    announce("Line 12, const x = 1")
    expect(useAnnouncer.getState().message).toBe("Line 12, const x = 1")
    expect(useAnnouncer.getState().assertive).toBe(false)
  })

  it("bumps the nonce so the same message announced twice is announced twice", () => {
    // A live region ignores an identical text written into it again; the nonce
    // is what re-mounts the node and makes the second one land.
    useSettings.setState({ screenReader: true })
    announce("2 results")
    const first = useAnnouncer.getState().nonce
    announce("2 results")
    expect(useAnnouncer.getState().nonce).toBe(first + 1)
  })

  it("can interrupt when what happened would otherwise be missed", () => {
    useSettings.setState({ screenReader: true })
    announce("3 failed", { assertive: true })
    expect(useAnnouncer.getState().assertive).toBe(true)
  })

  it("ignores an empty message rather than announcing nothing loudly", () => {
    useSettings.setState({ screenReader: true })
    announce("")
    expect(useAnnouncer.getState().nonce).toBe(0)
  })
})

describe("cues", () => {
  it("plays nothing with cues off", () => {
    const { start } = stubAudio()
    cue("error")
    expect(start).not.toHaveBeenCalled()
  })

  it("plays a lower tone for an error than for a success", () => {
    useSettings.setState({ audioCues: true })
    const { start, osc } = stubAudio()
    cue("error")
    const errorHz = osc.frequency.value
    cue("success")
    expect(start).toHaveBeenCalledTimes(2)
    expect(errorHz).toBeLessThan(osc.frequency.value)
  })

  it("survives a webview with no audio at all", () => {
    useSettings.setState({ audioCues: true })
    vi.stubGlobal("AudioContext", undefined)
    expect(() => cue("error")).not.toThrow()
  })
})

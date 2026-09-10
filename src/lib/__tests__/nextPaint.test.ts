/**
 * The frame-or-deadline rule, on its own. A window that is not rendering gets
 * no animation frames, so anything hung off `requestAnimationFrame` alone never
 * runs — the terminal opened black and a reactivated pane kept stale sizes.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { nextPaint } from "@/lib/nextPaint"

const noFrames = () => {
  const real = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (() => 0) as typeof globalThis.requestAnimationFrame
  return () => {
    globalThis.requestAnimationFrame = real
  }
}

afterEach(() => vi.useRealTimers())

describe("nextPaint", () => {
  it("still runs when no frame ever arrives", async () => {
    const restore = noFrames()
    vi.useFakeTimers()
    const fn = vi.fn()
    nextPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(fn).toHaveBeenCalledOnce()
    restore()
  })

  it("runs once, not twice, when the frame comes first", async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    nextPaint(fn)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledOnce()
  })

  it("does not run after it is cancelled", async () => {
    const restore = noFrames()
    vi.useFakeTimers()
    const fn = vi.fn()
    nextPaint(fn)()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).not.toHaveBeenCalled()
    restore()
  })
})

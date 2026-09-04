// Per-project settings (`.reado/config.json`): merge on open, debounced write-back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  readProjectConfig: vi.fn(async () => null as string | null),
  writeProjectConfig: vi.fn(async () => {}),
}))
vi.mock("../logger", () => ({ log: { warn: vi.fn() }, safeError: (e: unknown) => String(e) }))

let listener: ((s: Record<string, unknown>) => void) | null = null
const settings = {
  wrap: true,
  focusMode: false,
  codeFont: "JetBrains Mono",
  versionReado: true,
  theme: "dark", // not a per-project key — must never be written or applied
  set: vi.fn(),
}
vi.mock("../store", () => ({
  useSettings: {
    getState: () => settings,
    subscribe: (fn: (s: Record<string, unknown>) => void) => {
      listener = fn
      return () => {
        listener = null
      }
    },
  },
}))

import { readProjectConfig, writeProjectConfig } from "@/lib/api"
import { log } from "@/lib/logger"
import { loadProjectConfig, watchProjectConfig } from "@/lib/projectConfig"

beforeEach(() => {
  vi.clearAllMocks()
  listener = null
})
afterEach(() => vi.useRealTimers())

describe("loadProjectConfig", () => {
  it("applies only the per-project keys the file actually sets", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue(
      JSON.stringify({ wrap: false, theme: "light", nonsense: 1 }),
    )
    await loadProjectConfig("/root")
    expect(settings.set).toHaveBeenCalledWith({ wrap: false })
  })

  it("applies every known key when all are present", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue(
      JSON.stringify({ wrap: true, focusMode: true, codeFont: "Fira Code", versionReado: false }),
    )
    await loadProjectConfig("/root")
    expect(settings.set).toHaveBeenCalledWith({
      wrap: true,
      focusMode: true,
      codeFont: "Fira Code",
      versionReado: false,
    })
  })

  it("does nothing when the project has no config", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue(null)
    await loadProjectConfig("/root")
    expect(settings.set).not.toHaveBeenCalled()
  })

  it("does nothing when the config can't be read", async () => {
    vi.mocked(readProjectConfig).mockRejectedValue(new Error("no such file"))
    await loadProjectConfig("/root")
    expect(settings.set).not.toHaveBeenCalled()
  })

  it("ignores a malformed config instead of throwing, and logs it", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue("{ not json")
    await expect(loadProjectConfig("/root")).resolves.toBeUndefined()
    expect(settings.set).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })
})

describe("watchProjectConfig", () => {
  it("writes the per-project subset — and nothing else — after the debounce", () => {
    vi.useFakeTimers()
    watchProjectConfig("/root")
    listener?.(settings)
    expect(writeProjectConfig).not.toHaveBeenCalled() // still debouncing
    vi.advanceTimersByTime(600)
    const [root, json] = vi.mocked(writeProjectConfig).mock.calls[0]
    expect(root).toBe("/root")
    expect(JSON.parse(json)).toEqual({
      wrap: true,
      focusMode: false,
      codeFont: "JetBrains Mono",
      versionReado: true,
    })
  })

  it("coalesces a burst of changes into one write", () => {
    vi.useFakeTimers()
    watchProjectConfig("/root")
    listener?.(settings)
    vi.advanceTimersByTime(500)
    listener?.(settings)
    vi.advanceTimersByTime(500)
    expect(writeProjectConfig).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(writeProjectConfig).toHaveBeenCalledTimes(1)
  })

  it("stops listening and cancels a pending write on unsubscribe", () => {
    vi.useFakeTimers()
    const stop = watchProjectConfig("/root")
    listener?.(settings)
    stop()
    vi.advanceTimersByTime(1000)
    expect(writeProjectConfig).not.toHaveBeenCalled()
    expect(listener).toBeNull()
  })

  it("keeps watching after a write fails", () => {
    vi.useFakeTimers()
    vi.mocked(writeProjectConfig).mockRejectedValueOnce(new Error("readonly"))
    watchProjectConfig("/root")
    listener?.(settings)
    vi.advanceTimersByTime(600)
    // The rejection must not tear down the subscription — the next change
    // still reaches disk.
    listener?.(settings)
    vi.advanceTimersByTime(600)
    expect(writeProjectConfig).toHaveBeenCalledTimes(2)
  })
})

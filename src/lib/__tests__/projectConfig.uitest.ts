// Per-project settings (`.reado/config.json`): merge on open, and a write-back
// that only ever touches keys the project already declares.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  readProjectConfig: vi.fn(async () => null as string | null),
  writeProjectConfig: vi.fn(async () => {}),
}))
vi.mock("../logger", () => ({
  log: { warn: vi.fn() },
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  safeError: (e: unknown) => String(e),
}))
vi.mock("../notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

let listener: ((s: Record<string, unknown>) => void) | null = null
const settings = {
  wrap: true,
  wrapColumn: 0,
  focusMode: false,
  codeFont: "JetBrains Mono",
  versionReado: true,
  formatOnSave: true,
  formatOnPaste: false,
  formatOnType: false,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  defaultEol: "auto",
  excludeGlobs: [],
  searchExcludeGlobs: [],
  rulerColumn: 120,
  renderWhitespace: false,
  indentGuides: "all",
  largeFileGuardMb: 2,
  suggestOnTyping: false,
  autoSave: "afterDelay",
  autoSaveDelay: 1000,
  fileNesting: false,
  fileNestingRules: [],
  theme: "dark", // not a per-project key — must never be written or applied
  set: vi.fn(),
}
// Only `useSettings` is stubbed: the shared value validation reads the real
// `DEFAULTS` to check each key's shape, so replacing the whole module would
// leave it with nothing to compare against.
vi.mock("../store", async (orig) => ({
  ...(await orig<typeof import("../store")>()),
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
import {
  loadProjectConfig,
  PROJECT_KEYS,
  projectDeclares,
  saveSettingsToProject,
  watchProjectConfig,
} from "@/lib/projectConfig"

/** Open a project whose config declares exactly `cfg`. */
async function openWith(cfg: Record<string, unknown> | null) {
  vi.mocked(readProjectConfig).mockResolvedValue(cfg && JSON.stringify(cfg))
  await loadProjectConfig("/root")
}

beforeEach(async () => {
  vi.clearAllMocks()
  listener = null
  await openWith(null) // reset the declared set between tests
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe("loadProjectConfig", () => {
  it("applies only the per-project keys the file actually sets", async () => {
    await openWith({ wrap: false, theme: "light", nonsense: 1 })
    expect(settings.set).toHaveBeenCalledWith({ wrap: false })
  })

  it("covers the on-save and file-filtering keys a team actually shares", async () => {
    // The whole point of a project config is that "this repo formats on save"
    // travels through git. Reading/personal keys (theme, font size) never do.
    for (const k of ["formatOnSave", "trimTrailingWhitespace", "insertFinalNewline"]) {
      expect(PROJECT_KEYS).toContain(k)
    }
    for (const k of ["theme", "fontSize", "zoom", "lineHeight"]) {
      expect(PROJECT_KEYS).not.toContain(k)
    }
  })

  it("applies every known key when all are present", async () => {
    await openWith({ wrap: true, focusMode: true, codeFont: "Fira Code", versionReado: false })
    expect(settings.set).toHaveBeenCalledWith({
      wrap: true,
      focusMode: true,
      codeFont: "Fira Code",
      versionReado: false,
    })
  })

  it("does nothing when the project has no config", async () => {
    await openWith(null)
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
  it("writes back only the keys the project declares", async () => {
    await openWith({ wrap: false })
    vi.useFakeTimers()
    watchProjectConfig("/root")
    listener?.(settings)
    expect(writeProjectConfig).not.toHaveBeenCalled() // still debouncing
    vi.advanceTimersByTime(600)
    const [root, json] = vi.mocked(writeProjectConfig).mock.calls[0]
    expect(root).toBe("/root")
    // `wrap` is what the file declared; the other overridable keys are the
    // user's own preferences and stay out of the repository.
    expect(JSON.parse(json)).toEqual({ wrap: true })
  })

  it("leaves a project that declares nothing alone", async () => {
    // The regression this guards: changing a *global* preference used to write a
    // config.json into every open project, so every repo showed up dirty in git
    // after touching your own font.
    await openWith(null)
    vi.useFakeTimers()
    watchProjectConfig("/root")
    listener?.(settings)
    vi.advanceTimersByTime(1000)
    expect(writeProjectConfig).not.toHaveBeenCalled()
  })

  it("coalesces a burst of changes into one write", async () => {
    await openWith({ wrap: false })
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

  it("stops listening and cancels a pending write on unsubscribe", async () => {
    await openWith({ wrap: false })
    vi.useFakeTimers()
    const stop = watchProjectConfig("/root")
    listener?.(settings)
    stop()
    vi.advanceTimersByTime(1000)
    expect(writeProjectConfig).not.toHaveBeenCalled()
    expect(listener).toBeNull()
  })

  it("keeps watching after a write fails", async () => {
    await openWith({ wrap: false })
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

describe("saveSettingsToProject", () => {
  it("creates the file with the whole overridable subset, and starts tracking it", async () => {
    await openWith(null)
    expect(projectDeclares()).toEqual([])
    await saveSettingsToProject("/root")
    const [, json] = vi.mocked(writeProjectConfig).mock.calls[0]
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([...PROJECT_KEYS].sort())
    expect(projectDeclares()).toEqual([...PROJECT_KEYS])
  })

  it("reports a failure instead of leaving the project marked as tracked", async () => {
    await openWith(null)
    vi.mocked(writeProjectConfig).mockRejectedValueOnce(new Error("readonly"))
    await saveSettingsToProject("/root")
    expect(projectDeclares()).toEqual([])
  })
})

// syncClaudeTheme writes Reado's light/dark mode into the project's
// `.claude/settings.local.json` — merging, never clobbering.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
}))

import { createFile, readFile, writeFile } from "@/lib/api"
import { effectiveThemeMode, syncClaudeTheme } from "@/lib/claudeTheme"

const SETTINGS = "/root/.claude/settings.local.json"
const text = (t: string) => ({ kind: "text" as const, text: t })

// `effectiveThemeMode` probes the computed `--bg`, so the tests drive the mode
// by defining that token — otherwise every expectation would be whatever the
// function itself returned, and a hardcoded "dark" would pass.
const LIGHT = "rgb(255, 255, 255)"
const DARK = "rgb(24, 24, 27)"
const style = document.head.appendChild(document.createElement("style"))
const setBg = (color: string) => {
  style.textContent = `:root{--bg:${color}}`
}

/** The object we last wrote to the settings file. */
const written = () => JSON.parse(vi.mocked(writeFile).mock.calls[0][2])

beforeEach(() => {
  vi.clearAllMocks()
  setBg(LIGHT)
})

describe("effectiveThemeMode", () => {
  it("follows Reado's own background colour", () => {
    setBg(LIGHT)
    expect(effectiveThemeMode()).toBe("light")
    setBg(DARK)
    expect(effectiveThemeMode()).toBe("dark")
  })

  it("cleans up its probe element", () => {
    const before = document.body.childElementCount
    effectiveThemeMode()
    expect(document.body.childElementCount).toBe(before)
  })
})

describe("syncClaudeTheme", () => {
  it("does nothing without a project", async () => {
    await syncClaudeTheme("")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("builds the settings path without a doubled slash", async () => {
    vi.mocked(readFile).mockResolvedValue(text("{}"))
    await syncClaudeTheme("/root/")
    expect(readFile).toHaveBeenCalledWith("/root/", SETTINGS)
  })

  it("merges the theme into an existing file, keeping the user's other keys", async () => {
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify({ permissions: { allow: ["Bash"] } })),
    )
    await syncClaudeTheme("/root")
    expect(written()).toEqual({ permissions: { allow: ["Bash"] }, theme: "light" })
  })

  it("writes into an empty file", async () => {
    vi.mocked(readFile).mockResolvedValue(text("   "))
    await syncClaudeTheme("/root")
    expect(written()).toEqual({ theme: "light" })
  })

  it("is a no-op when the theme is already right", async () => {
    vi.mocked(readFile).mockResolvedValue(text(JSON.stringify({ theme: "light" })))
    await syncClaudeTheme("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("leaves an unparseable file alone", async () => {
    vi.mocked(readFile).mockResolvedValue(text("{ not json"))
    await syncClaudeTheme("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("leaves a JSON file that isn't an object alone", async () => {
    vi.mocked(readFile).mockResolvedValue(text("[1, 2]"))
    await syncClaudeTheme("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("leaves a non-text settings path alone", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 10 })
    await syncClaudeTheme("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("creates the file when it genuinely doesn't exist yet", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("no such file"))
    await syncClaudeTheme("/root")
    expect(createFile).toHaveBeenCalledWith("/root", SETTINGS)
    expect(written()).toEqual({ theme: "light" })
  })

  it("never clobbers a file that exists but couldn't be read", async () => {
    // createFile failing is the proof the file is there — a transient read error
    // must not turn someone's permissions/hooks into a bare {theme}.
    vi.mocked(readFile).mockRejectedValue(new Error("EBUSY"))
    vi.mocked(createFile).mockRejectedValue(new Error("exists"))
    await syncClaudeTheme("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("writes dark when Reado is dark", async () => {
    setBg(DARK)
    vi.mocked(readFile).mockResolvedValue(text("{}"))
    await syncClaudeTheme("/root")
    expect(written()).toEqual({ theme: "dark" })
  })

  it("swallows a failing write", async () => {
    vi.mocked(readFile).mockResolvedValue(text("{}"))
    vi.mocked(writeFile).mockRejectedValue(new Error("readonly"))
    await expect(syncClaudeTheme("/root")).resolves.toBeUndefined()
  })
})

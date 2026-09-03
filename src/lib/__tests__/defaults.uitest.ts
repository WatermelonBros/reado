// "Make Reado the default app": each backend outcome gets its own notice.
import { beforeEach, describe, expect, it, vi } from "vitest"
import tauriConf from "../../../src-tauri/tauri.conf.json"

vi.mock("../api", () => ({ setDefaultHandler: vi.fn() }))
vi.mock("../notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string, v?: unknown) => (v ? `${k}:${JSON.stringify(v)}` : k) }))

import { setDefaultHandler } from "@/lib/api"
import { makeDefaultApp, TEXT_EXTENSIONS } from "@/lib/defaults"
import { notify, notifyError } from "@/lib/notice"

beforeEach(() => vi.clearAllMocks())

describe("TEXT_EXTENSIONS", () => {
  it("has no duplicates", () => {
    expect(new Set(TEXT_EXTENSIONS).size).toBe(TEXT_EXTENSIONS.length)
  })

  it("claims the formats Reado is for", () => {
    // The subset check below can't see a *missing* entry — dropping "md" from a
    // Markdown-first reader would pass it.
    expect(TEXT_EXTENSIONS).toEqual(
      expect.arrayContaining(["md", "markdown", "mdx", "txt", "ts", "tsx", "rs", "py", "json"]),
    )
  })

  it("lists bare, lowercase extensions", () => {
    expect(TEXT_EXTENSIONS.filter((e) => e !== e.toLowerCase() || e.startsWith("."))).toEqual([])
  })

  // The list is only meaningful against the bundle: "make Reado the default"
  // can claim an extension the app never registered as a file association,
  // and the user would get a handler that never fires.
  it("claims nothing the bundle hasn't declared a file association for", () => {
    const declared: string[] = tauriConf.bundle.fileAssociations[0].ext
    expect(TEXT_EXTENSIONS.filter((e) => !declared.includes(e))).toEqual([])
  })
})

describe("makeDefaultApp", () => {
  it("reports how many associations were set (macOS)", async () => {
    vi.mocked(setDefaultHandler).mockResolvedValue({ kind: "set", count: 42 })
    await makeDefaultApp()
    expect(setDefaultHandler).toHaveBeenCalledWith(TEXT_EXTENSIONS)
    expect(notify).toHaveBeenCalledWith("info", 'defaultApp.done:{"count":42}')
  })

  it("points at the OS chooser when the platform opened one (Windows)", async () => {
    vi.mocked(setDefaultHandler).mockResolvedValue({ kind: "settings", count: 0 })
    await makeDefaultApp()
    expect(notify).toHaveBeenCalledWith("info", "defaultApp.settings")
  })

  it("falls back to manual instructions elsewhere", async () => {
    vi.mocked(setDefaultHandler).mockResolvedValue({ kind: "manual", count: 0 })
    await makeDefaultApp()
    expect(notify).toHaveBeenCalledWith("info", "defaultApp.manual")
  })

  it("surfaces a backend failure instead of silently doing nothing", async () => {
    vi.mocked(setDefaultHandler).mockRejectedValue(new Error("nope"))
    await makeDefaultApp()
    expect(notify).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalledWith("defaults", "defaultApp.failed", expect.any(Error))
  })
})

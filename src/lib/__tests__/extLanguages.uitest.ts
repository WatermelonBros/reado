/**
 * Language configuration contributed by an extension: the comment tokens and
 * auto-closing pairs a language gets when Reado has no pack of its own for it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn() }))
// The failure paths log, and the real logger reaches for the backend.
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

import type { InstalledExt } from "@/lib/api"
import { extRead } from "@/lib/api"
import {
  contributedLanguageData,
  languageConfig,
  preloadLanguageConfigs,
  resolvedLanguageId,
} from "@/lib/extLanguages"

const ext = (languages: unknown, id = "Pub.nix"): InstalledExt => ({
  id,
  namespace: "Pub",
  name: "nix",
  version: "1.0.0",
  displayName: "Nix",
  manifest: { contributes: { languages } as Record<string, unknown> },
})

const NIX = [{ id: "nix", extensions: [".nix"], configuration: "./language-configuration.json" }]

/** Parsed configurations are cached per extension for the process, so each test
 *  brings its own extension rather than reaching into that cache. */
let n = 0
const fresh = (languages: unknown = NIX) => ext(languages, `Pub.nix${n++}`)
const CONFIG = JSON.stringify({
  comments: { lineComment: "#" },
  autoClosingPairs: [["{", "}"], { open: "'", close: "'" }],
})

beforeEach(() => vi.mocked(extRead).mockReset())

describe("resolvedLanguageId", () => {
  it("lets a contributed language claim an extension Reado never heard of", () => {
    expect(resolvedLanguageId([fresh()], "flake.nix")).toBe("nix")
  })

  it("falls back to Reado's own table when nothing claims it", () => {
    expect(resolvedLanguageId([], "main.rs")).toBe("rust")
  })

  it("answers the bare extension for a language nobody names", () => {
    expect(resolvedLanguageId([], "a.zzz")).toBe("zzz")
  })
})

describe("languageConfig", () => {
  it("reads the file the contribution points at", async () => {
    vi.mocked(extRead).mockResolvedValue(CONFIG)
    const cfg = await languageConfig([fresh()], "nix")
    expect(cfg?.comments?.lineComment).toBe("#")
    expect(extRead).toHaveBeenCalledWith("Pub", "nix", "./language-configuration.json")
  })

  it("answers null for a language nothing describes", async () => {
    expect(await languageConfig([fresh()], "rust")).toBeNull()
    expect(extRead).not.toHaveBeenCalled()
  })

  it("answers null, quietly, when the file can't be read", async () => {
    vi.mocked(extRead).mockImplementationOnce(() => Promise.reject(new Error("gone")))
    expect(await languageConfig([fresh()], "nix")).toBeNull()
  })

  it("reads each file once", async () => {
    vi.mocked(extRead).mockResolvedValue(CONFIG)
    const one = fresh()
    await languageConfig([one], "nix")
    await languageConfig([one], "nix")
    expect(extRead).toHaveBeenCalledTimes(1)
  })

  it("ignores a contribution with no configuration file", async () => {
    expect(await languageConfig([fresh([{ id: "nix", extensions: [".nix"] }])], "nix")).toBeNull()
  })
})

describe("contributedLanguageData", () => {
  it("gives the editor nothing before the file has been read", () => {
    // Synchronous by design: the preload puts it in hand first.
    expect(contributedLanguageData([fresh()], "nix")).toEqual([])
  })

  it("gives the editor the language data once preloaded", async () => {
    vi.mocked(extRead).mockResolvedValue(CONFIG)
    const one = fresh()
    await preloadLanguageConfigs([one])
    expect(contributedLanguageData([one], "nix")).not.toEqual([])
  })

  it("gives nothing for a language nothing describes", () => {
    expect(contributedLanguageData([fresh()], "rust")).toEqual([])
  })

  it("gives nothing when the configuration says nothing usable", async () => {
    vi.mocked(extRead).mockResolvedValue(JSON.stringify({ brackets: [["{", "}"]] }))
    const one = fresh()
    await preloadLanguageConfigs([one])
    expect(contributedLanguageData([one], "nix")).toEqual([])
  })
})

describe("preloadLanguageConfigs", () => {
  it("reads every language an extension describes, once", async () => {
    vi.mocked(extRead).mockResolvedValue(CONFIG)
    const two = fresh([
      { id: "nix", configuration: "./a.json" },
      { id: "dhall", configuration: "./b.json" },
      { id: "noconfig" },
    ])
    await preloadLanguageConfigs([two])
    expect(extRead).toHaveBeenCalledTimes(2)
  })
})

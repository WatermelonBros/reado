/**
 * The classifier is the whole security boundary of the marketplace: it decides,
 * from a manifest alone, whether Reado will install something. These are the
 * shapes real registry entries actually take.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  ovsxInstalled: vi.fn(),
  ovsxInstall: vi.fn(),
  ovsxUninstall: vi.fn(async () => {}),
  ovsxLatest: vi.fn(async () => ({})),
}))
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))
vi.mock("@/lib/extLanguages", () => ({ preloadLanguageConfigs: vi.fn(async () => {}) }))

import type { ExtManifest } from "@/lib/api"
import { ovsxInstall, ovsxInstalled, ovsxLatest, ovsxUninstall } from "@/lib/api"
import { changeNeedsReload, classify, isInstallable, useMarketplace } from "@/lib/marketplace"

const manifest = (m: Partial<ExtManifest>): ExtManifest => m as ExtManifest

describe("classify", () => {
  it("calls a pure theme extension fully supported", () => {
    const c = classify(manifest({ contributes: { themes: [{ label: "Dusk", path: "./t.json" }] } }))
    expect(c).toEqual({ tier: "full", kinds: ["themes"] })
  })

  it("refuses an extension with a code entry point, however useful its data", () => {
    // Material Icon Theme's real shape: icons Reado could use, behind a code
    // entry point it will never load. The icons would work; the extension would
    // not, and half an extension with a footnote is not support.
    const c = classify(
      manifest({
        main: "./dist/extension.cjs",
        contributes: { iconThemes: [{ id: "material", path: "./i.json" }], commands: [{}] },
      }),
    )
    expect(c.tier).toBe("unsupported")
    expect(c.reason).toBe("code")
  })

  it("treats a web-only entry point as code too", () => {
    expect(classify(manifest({ browser: "./web.js", contributes: { snippets: [{}] } })).tier).toBe(
      "unsupported",
    )
  })

  it("refuses an extension pack — its contents wouldn't be there", () => {
    const c = classify(manifest({ extensionPack: ["a.b", "c.d"], contributes: { themes: [{}] } }))
    expect(c).toMatchObject({ tier: "unsupported", reason: "dependencies" })
  })

  it("offers only what it can deliver whole", () => {
    // The product's promise as one assertion: everything the marketplace shows
    // clears one bar, and there is no second, lesser bar underneath it.
    expect(isInstallable(manifest({ contributes: { themes: [{}] } }))).toBe(true)
    expect(isInstallable(manifest({ main: "./x.js", contributes: { themes: [{}] } }))).toBe(false)
  })

  it("refuses an extension that only runs code", () => {
    const c = classify(manifest({ main: "./x.js", contributes: { commands: [{}], views: {} } }))
    expect(c).toMatchObject({ tier: "unsupported", reason: "nothingUsable" })
    expect(isInstallable(manifest({ main: "./x.js", contributes: { commands: [{}] } }))).toBe(false)
  })

  it("refuses an extension with no manifest at all", () => {
    // Unclassifiable means not offered — never installed on the hope it's fine.
    expect(classify(null)).toMatchObject({ tier: "unsupported", reason: "noManifest" })
    expect(isInstallable(null)).toBe(false)
  })

  it("ignores an empty contribution list", () => {
    // `"themes": []` is not a theme extension.
    expect(classify(manifest({ contributes: { themes: [] } })).tier).toBe("unsupported")
  })

  it("reports every supported kind an extension contributes", () => {
    const c = classify(manifest({ contributes: { themes: [{}], snippets: [{}], menus: {} } }))
    expect(c.kinds).toEqual(["themes", "snippets"])
  })
})

describe("the installed store", () => {
  beforeEach(() => {
    vi.mocked(ovsxInstalled).mockReset()
    vi.mocked(ovsxInstall).mockReset()
    vi.mocked(ovsxUninstall).mockReset()
    useMarketplace.setState({ installed: [], busy: [], loaded: false, reloadNeeded: false })
  })

  const installed = (id: string, contributes: unknown = { themes: [{}] }) => ({
    id,
    namespace: id.split(".")[0],
    name: id.split(".")[1],
    version: "1.0.0",
    displayName: id,
    manifest: { contributes: contributes as Record<string, unknown> },
  })

  it("reads what's on disk and marks itself loaded", async () => {
    vi.mocked(ovsxInstalled).mockResolvedValue([installed("A.a")] as never)
    await useMarketplace.getState().refresh()
    expect(useMarketplace.getState().installed.map((e) => e.id)).toEqual(["A.a"])
    expect(useMarketplace.getState().loaded).toBe(true)
  })

  it("still marks itself loaded when the read fails", async () => {
    // Otherwise "your theme's extension is missing" would be a race forever.
    vi.mocked(ovsxInstalled).mockImplementationOnce(() => Promise.reject(new Error("nope")))
    await useMarketplace.getState().refresh()
    expect(useMarketplace.getState().loaded).toBe(true)
  })

  it("adds an install to the list and clears the busy flag", async () => {
    const ext = installed("A.a")
    vi.mocked(ovsxInstall).mockResolvedValue(ext as never)
    await useMarketplace
      .getState()
      .install({ id: "A.a", namespace: "A", name: "a", version: "1" } as never)
    expect(useMarketplace.getState().installed.map((e) => e.id)).toEqual(["A.a"])
    expect(useMarketplace.getState().busy).toEqual([])
  })

  it("replaces in place on an update rather than listing it twice", async () => {
    useMarketplace.setState({ installed: [installed("A.a")] as never })
    vi.mocked(ovsxInstall).mockResolvedValue({ ...installed("A.a"), version: "2.0.0" } as never)
    await useMarketplace
      .getState()
      .install({ id: "A.a", namespace: "A", name: "a", version: "2" } as never)
    expect(useMarketplace.getState().installed.length).toBe(1)
    expect(useMarketplace.getState().installed[0].version).toBe("2.0.0")
  })

  it("clears the busy flag even when an install fails", async () => {
    vi.mocked(ovsxInstall).mockImplementationOnce(() => Promise.reject(new Error("offline")))
    await expect(
      useMarketplace
        .getState()
        .install({ id: "A.a", namespace: "A", name: "a", version: "1" } as never),
    ).rejects.toThrow()
    expect(useMarketplace.getState().busy).toEqual([])
  })

  it("asks for a reload only when the change needs one", async () => {
    // A theme is re-read live; a grammar is compiled into an editor on open.
    vi.mocked(ovsxInstall).mockResolvedValue(installed("A.a") as never)
    await useMarketplace
      .getState()
      .install({ id: "A.a", namespace: "A", name: "a", version: "1" } as never)
    expect(useMarketplace.getState().reloadNeeded).toBe(false)

    vi.mocked(ovsxInstall).mockResolvedValue(installed("B.b", { grammars: [{}] }) as never)
    await useMarketplace
      .getState()
      .install({ id: "B.b", namespace: "B", name: "b", version: "1" } as never)
    expect(useMarketplace.getState().reloadNeeded).toBe(true)
  })

  it("drops an uninstalled extension from the list", async () => {
    useMarketplace.setState({ installed: [installed("A.a")] as never })
    await useMarketplace.getState().uninstall("A", "a")
    expect(useMarketplace.getState().installed).toEqual([])
  })

  it("finds one by id", () => {
    useMarketplace.setState({ installed: [installed("A.a")] as never })
    expect(useMarketplace.getState().byId("A.a")?.displayName).toBe("A.a")
    expect(useMarketplace.getState().byId("nope")).toBeUndefined()
  })
})

describe("changeNeedsReload", () => {
  it("is true for what the editor compiles in, false for what it re-reads", () => {
    expect(changeNeedsReload(manifest({ contributes: { grammars: [{}] } }))).toBe(true)
    expect(changeNeedsReload(manifest({ contributes: { snippets: [{}] } }))).toBe(true)
    expect(changeNeedsReload(manifest({ contributes: { languages: [{}] } }))).toBe(true)
    expect(changeNeedsReload(manifest({ contributes: { themes: [{}] } }))).toBe(false)
    expect(changeNeedsReload(manifest({ contributes: { iconThemes: [{}] } }))).toBe(false)
    expect(changeNeedsReload(null)).toBe(false)
  })
})

describe("checking for updates", () => {
  const ext = (id: string, version: string) =>
    ({
      id,
      namespace: id.split(".")[0],
      name: id.split(".")[1],
      version,
      manifest: manifest({}),
    }) as never

  beforeEach(() => {
    vi.clearAllMocks()
    useMarketplace.setState({ installed: [ext("Pub.a", "1.0.0")], latest: {} })
  })

  it("offers the newer version the registry names", async () => {
    vi.mocked(ovsxLatest).mockResolvedValue({ "Pub.a": "1.2.0" })
    await useMarketplace.getState().checkUpdates()
    expect(useMarketplace.getState().updateFor("Pub.a")).toBe("1.2.0")
  })

  it("offers nothing when the installed version is the published one", async () => {
    vi.mocked(ovsxLatest).mockResolvedValue({ "Pub.a": "1.0.0" })
    await useMarketplace.getState().checkUpdates()
    expect(useMarketplace.getState().updateFor("Pub.a")).toBeUndefined()
  })

  it("offers nothing for an extension the registry didn't answer for", async () => {
    // Unreachable and up-to-date must not look the same: absent means no offer,
    // never a version to update to.
    vi.mocked(ovsxLatest).mockResolvedValue({})
    await useMarketplace.getState().checkUpdates()
    expect(useMarketplace.getState().updateFor("Pub.a")).toBeUndefined()
  })

  it("survives an offline check without clearing what it knew", async () => {
    useMarketplace.setState({ latest: { "Pub.a": "1.2.0" } })
    vi.mocked(ovsxLatest).mockImplementationOnce(() => Promise.reject(new Error("offline")))
    await useMarketplace.getState().checkUpdates()
    expect(useMarketplace.getState().updateFor("Pub.a")).toBe("1.2.0")
  })

  it("asks nothing of the registry when nothing is installed", async () => {
    useMarketplace.setState({ installed: [] })
    await useMarketplace.getState().checkUpdates()
    expect(ovsxLatest).not.toHaveBeenCalled()
  })
})

describe("updating in place", () => {
  it("leaves the row where it was", async () => {
    // Filtering and appending sent the row you just updated to the bottom, so
    // the one thing you were looking at was the one thing that moved.
    const ext = (id: string, version: string) =>
      ({
        id,
        namespace: id.split(".")[0],
        name: id.split(".")[1],
        version,
        manifest: manifest({}),
      }) as never
    useMarketplace.setState({ installed: [ext("Pub.a", "1.0.0"), ext("Pub.b", "2.0.0")] })
    vi.mocked(ovsxInstall).mockResolvedValue(ext("Pub.a", "1.1.0"))
    await useMarketplace.getState().install({
      id: "Pub.a",
      namespace: "Pub",
      name: "a",
      version: "1.1.0",
    })
    expect(useMarketplace.getState().installed.map((e) => e.id)).toEqual(["Pub.a", "Pub.b"])
    expect(useMarketplace.getState().byId("Pub.a")?.version).toBe("1.1.0")
  })
})

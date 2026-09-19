// `.reado/extensions.json` (and VS Code's own) — what a repository says a reader
// of it needs. The file is written by the project, so parsing is defensive; the
// offer is made once per project per session and never installs anything.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  readFile: vi.fn(async () => null),
  lspInstalledAll: vi.fn(async () => [] as Array<[string, boolean]>),
  formatterStatus: vi.fn(async () => [] as Array<{ id: string; installed: boolean }>),
}))
vi.mock("@/lib/notice", () => ({ notify: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import { formatterStatus, lspInstalledAll, readFile } from "@/lib/api"
import { FORMATTERS, LANG_SERVERS, VAULTS } from "@/lib/extensions"
import { useMarketplace } from "@/lib/marketplace"
import { notify } from "@/lib/notice"
import {
  CURATED_EQUIVALENTS,
  missingRecommendations,
  offerRecommendations,
  parseRecommendations,
  RECOMMENDED_FILES,
  resetRecommendations,
} from "@/lib/recommended"
import { useWorkspace } from "@/lib/store"

/** Put a file at one of the paths recommendations are read from; every other
 *  path reads as absent, which is how precedence gets tested at all. */
const at = (rel: string, obj: unknown) =>
  vi
    .mocked(readFile)
    .mockImplementation(
      async (_root: string, path: string) =>
        (path.endsWith(rel) ? { kind: "text", text: JSON.stringify(obj) } : null) as never,
    )

const withFile = (obj: unknown) => at(RECOMMENDED_FILES[0], obj)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readFile).mockResolvedValue(null as never)
  vi.mocked(lspInstalledAll).mockResolvedValue([])
  vi.mocked(formatterStatus).mockResolvedValue([])
  resetRecommendations()
  useMarketplace.setState({ installed: [] })
  useWorkspace.setState({ recommended: [] })
})

describe("parseRecommendations", () => {
  it("reads VS Code's shape", () => {
    expect(parseRecommendations('{"recommendations":["Pub.one","Other.two"]}')).toEqual([
      "Pub.one",
      "Other.two",
    ])
  })

  it("drops entries that aren't a namespace.name id", () => {
    // The file is project-authored: a typo must cost that one line, not the file.
    expect(
      parseRecommendations('{"recommendations":["Pub.one",42,"nodot","a.b.c","", "with space.x"]}'),
    ).toEqual(["Pub.one"])
  })

  it("returns nothing for a file that isn't the expected shape", () => {
    expect(parseRecommendations("{ not json")).toEqual([])
    expect(parseRecommendations("{}")).toEqual([])
    expect(parseRecommendations('{"recommendations":"Pub.one"}')).toEqual([])
  })
})

describe("missingRecommendations", () => {
  it("leaves out what is already installed, ignoring case", () => {
    withFile({ recommendations: ["Pub.one", "Other.two"] })
    useMarketplace.setState({ installed: [{ id: "pub.ONE" }] as never })
    return expect(missingRecommendations("/repo")).resolves.toEqual(["Other.two"])
  })

  it("is empty when the project says nothing", async () => {
    await expect(missingRecommendations("/repo")).resolves.toEqual([])
  })

  it("reads VS Code's own file when the project keeps no Reado one", async () => {
    // A repository that already ships `.vscode/extensions.json` should not have
    // to keep a second copy of the same list.
    at(".vscode/extensions.json", { recommendations: ["Pub.one"] })
    await expect(missingRecommendations("/repo")).resolves.toEqual(["Pub.one"])
  })

  it("prefers the Reado file when a project keeps both", async () => {
    vi.mocked(readFile).mockImplementation(
      async (_root: string, path: string) =>
        ({
          kind: "text",
          text: JSON.stringify({
            recommendations: [path.includes(".reado") ? "Reado.wins" : "Vscode.loses"],
          }),
        }) as never,
    )
    await expect(missingRecommendations("/repo")).resolves.toEqual(["Reado.wins"])
  })

  it("counts a curated tool as satisfying the extension that installs it", async () => {
    // `rust-lang.rust-analyzer` means "install rust-analyzer", and the curated
    // Rust entry installs exactly that. Nagging for it on a machine that has it
    // is how a prompt earns being dismissed unread.
    at(RECOMMENDED_FILES[0], {
      recommendations: ["rust-lang.rust-analyzer", "esbenp.prettier-vscode"],
    })
    vi.mocked(lspInstalledAll).mockResolvedValue([["rust", true]])
    await expect(missingRecommendations("/repo")).resolves.toEqual(["esbenp.prettier-vscode"])
  })

  it("still asks for a curated tool that is not installed here", async () => {
    at(RECOMMENDED_FILES[0], { recommendations: ["rust-lang.rust-analyzer"] })
    vi.mocked(lspInstalledAll).mockResolvedValue([["rust", false]])
    await expect(missingRecommendations("/repo")).resolves.toEqual(["rust-lang.rust-analyzer"])
  })

  it("does not probe the machine when nothing recommended maps to a curated tool", async () => {
    // Two IPC calls on every project open, for the common project that names
    // none of them, is a cost with nothing on the other side.
    withFile({ recommendations: ["Pub.one"] })
    await missingRecommendations("/repo")
    expect(lspInstalledAll).not.toHaveBeenCalled()
    expect(formatterStatus).not.toHaveBeenCalled()
  })
})

describe("the curated equivalence map", () => {
  it("names only curated tools that exist", () => {
    // The map is written by hand against the manifests; a renamed or removed
    // entry would otherwise make a recommendation silently un-satisfiable.
    const ids = new Set([...LANG_SERVERS, ...FORMATTERS, ...VAULTS].map((e) => e.id))
    for (const [vscodeId, curated] of Object.entries(CURATED_EQUIVALENTS))
      expect(ids, `${vscodeId} points at a tool that is not in the catalogue`).toContain(curated)
  })

  it("is keyed by lower-case ids, since that is how it is looked up", () => {
    for (const id of Object.keys(CURATED_EQUIVALENTS)) expect(id).toBe(id.toLowerCase())
  })
})

describe("offerRecommendations", () => {
  it("mentions the missing ones and hands them to the Extensions panel", async () => {
    withFile({ recommendations: ["Pub.one"] })
    await offerRecommendations("/repo")
    expect(notify).toHaveBeenCalledWith("info", "ext.recommended")
    expect(useWorkspace.getState().recommended).toEqual(["Pub.one"])
  })

  it("says nothing twice for the same project", async () => {
    // Reopening a tab, or a re-render, must not re-nag.
    withFile({ recommendations: ["Pub.one"] })
    await offerRecommendations("/repo")
    await offerRecommendations("/repo")
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("stays quiet when everything recommended is installed", async () => {
    withFile({ recommendations: ["Pub.one"] })
    useMarketplace.setState({ installed: [{ id: "Pub.one" }] as never })
    await offerRecommendations("/repo")
    expect(notify).not.toHaveBeenCalled()
    expect(useWorkspace.getState().recommended).toEqual([])
  })

  it("never installs anything — it only reads", async () => {
    withFile({ recommendations: ["Pub.one"] })
    const install = vi.spyOn(useMarketplace.getState(), "install")
    await offerRecommendations("/repo")
    expect(install).not.toHaveBeenCalled()
  })
})

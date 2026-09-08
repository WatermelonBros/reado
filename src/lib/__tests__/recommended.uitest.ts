// `.reado/extensions.json` — what a repository says a reader of it needs. The
// file is written by the project, so parsing is defensive; the offer is made
// once per project per session and never installs anything.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ readReadoFile: vi.fn(async () => null as string | null) }))
vi.mock("@/lib/notice", () => ({ notify: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import { readReadoFile } from "@/lib/api"
import { useMarketplace } from "@/lib/marketplace"
import { notify } from "@/lib/notice"
import {
  missingRecommendations,
  offerRecommendations,
  parseRecommendations,
  resetRecommendations,
} from "@/lib/recommended"
import { useWorkspace } from "@/lib/store"

const withFile = (obj: unknown) => vi.mocked(readReadoFile).mockResolvedValue(JSON.stringify(obj))

beforeEach(() => {
  vi.clearAllMocks()
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
    vi.mocked(readReadoFile).mockResolvedValue(null)
    await expect(missingRecommendations("/repo")).resolves.toEqual([])
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

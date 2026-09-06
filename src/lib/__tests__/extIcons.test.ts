/**
 * File icons contributed by an extension.
 *
 * The part worth pinning is resolution order: an icon theme answers by exact
 * file name first, then by the longest extension, then by language id, and only
 * then with its generic file icon. Get that order wrong and `package.json` gets
 * the plain JSON glyph — which is exactly the detail a theme is chosen for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ extRead: vi.fn(), extAsset: vi.fn() }))

import type { InstalledExt } from "@/lib/api"
import { extAsset, extRead } from "@/lib/api"
import { allIconThemes, iconThemesOf, useIconTheme } from "@/lib/extIcons"

const ext = (contributes: unknown, id = "PKief.material-icon-theme"): InstalledExt => ({
  id,
  namespace: id.split(".")[0],
  name: id.split(".").slice(1).join("."),
  version: "1.0.0",
  displayName: "Material",
  manifest: { contributes: contributes as Record<string, unknown> },
})

const THEME = {
  iconDefinitions: {
    _file: { iconPath: "./icons/file.svg" },
    _folder: { iconPath: "./icons/folder.svg" },
    _folder_open: { iconPath: "./icons/folder-open.svg" },
    _js: { iconPath: "./icons/js.svg" },
    _spec: { iconPath: "./icons/spec.svg" },
    _npm: { iconPath: "./icons/npm.svg" },
    _src: { iconPath: "./icons/src.svg" },
    _glyph: { fontCharacter: "\\e001", fontColor: "#ff0000", fontId: "seti" },
  },
  fonts: [{ id: "seti" }],
  file: "_file",
  folder: "_folder",
  folderExpanded: "_folder_open",
  fileExtensions: { js: "_js", "spec.js": "_spec" },
  fileNames: { "package.json": "_npm" },
  folderNames: { src: "_src" },
  languageIds: { nix: "_glyph" },
}

const contribution = [{ id: "material", label: "Material", path: "./dist/icons.json" }]

async function load(theme: unknown = THEME) {
  vi.mocked(extRead).mockResolvedValue(JSON.stringify(theme))
  const [t] = allIconThemes([ext({ iconThemes: contribution })])
  await useIconTheme.getState().load(t)
  return t
}

beforeEach(() => {
  vi.mocked(extAsset).mockReset()
  vi.mocked(extAsset).mockResolvedValue("data:image/svg+xml;base64,AAA")
  useIconTheme.setState({ theme: null, file: null, assets: {}, pending: new Set() })
})

describe("iconThemesOf", () => {
  it("gives each contributed theme a stable, namespaced id", () => {
    const [t] = iconThemesOf(ext({ iconThemes: contribution }))
    expect(t.id).toBe("ext:PKief.material-icon-theme:material")
    expect(t.label).toBe("Material")
  })

  it("skips a contribution with no file", () => {
    expect(iconThemesOf(ext({ iconThemes: [{ id: "x" }] }))).toEqual([])
  })

  it("is empty for an extension contributing none", () => {
    expect(iconThemesOf(ext({ themes: [{}] }))).toEqual([])
  })
})

describe("resolving an icon", () => {
  it("answers nothing at all until a theme is loaded", () => {
    expect(useIconTheme.getState().resolve("a.js", false, false)).toBeNull()
  })

  it("prefers an exact file name over the extension", async () => {
    // `package.json` gets npm's icon, not the generic JSON one.
    await load()
    useIconTheme.getState().resolve("package.json", false, false)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/npm.svg")
  })

  it("prefers the longest matching extension", async () => {
    // `a.spec.js` is a spec file, not just a JavaScript one.
    await load()
    useIconTheme.getState().resolve("a.spec.js", false, false)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/spec.svg")
  })

  it("falls back to the theme's generic file icon", async () => {
    await load()
    useIconTheme.getState().resolve("a.unknownext", false, false)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/file.svg")
  })

  it("uses the open folder icon only when the folder is open", async () => {
    await load()
    useIconTheme.getState().resolve("docs", true, true)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/folder-open.svg")
  })

  it("gives a named folder its own icon", async () => {
    await load()
    useIconTheme.getState().resolve("src", true, false)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/src.svg")
  })

  it("matches whatever case the file uses", async () => {
    await load()
    useIconTheme.getState().resolve("PACKAGE.JSON", false, false)
    await vi.waitFor(() => expect(extAsset).toHaveBeenCalled())
    expect(vi.mocked(extAsset).mock.calls[0][2]).toBe("dist/icons/npm.svg")
  })

  it("returns the asset once it has been read, and reads it only once", async () => {
    await load()
    // The first ask starts the read and answers null, so Reado's own glyph
    // stands in for the one frame it takes.
    expect(useIconTheme.getState().resolve("a.js", false, false)).toBeNull()
    await vi.waitFor(() =>
      expect(useIconTheme.getState().assets._js).toBe("data:image/svg+xml;base64,AAA"),
    )
    expect(useIconTheme.getState().resolve("a.js", false, false)).toEqual({
      kind: "image",
      src: "data:image/svg+xml;base64,AAA",
    })
    useIconTheme.getState().resolve("a.js", false, false)
    expect(extAsset).toHaveBeenCalledTimes(1)
  })

  it("answers a font glyph without reading a file", async () => {
    await load()
    expect(useIconTheme.getState().resolve("a.nix", false, false)).toEqual({
      kind: "glyph",
      char: "\\e001",
      color: "#ff0000",
      family: "seti",
    })
    expect(extAsset).not.toHaveBeenCalled()
  })

  it("gives up quietly on an unreadable theme", async () => {
    vi.mocked(extRead).mockRejectedValue(new Error("gone"))
    const [t] = allIconThemes([ext({ iconThemes: contribution })])
    await useIconTheme.getState().load(t)
    expect(useIconTheme.getState().theme).toBeNull()
    expect(useIconTheme.getState().resolve("a.js", false, false)).toBeNull()
  })

  it("clears everything when the theme is unset", async () => {
    await load()
    await useIconTheme.getState().load(null)
    expect(useIconTheme.getState().file).toBeNull()
    expect(useIconTheme.getState().resolve("a.js", false, false)).toBeNull()
  })

  it("answers nothing for a definition the theme doesn't have", async () => {
    // A theme with lookup tables but no matching definition must not crash.
    await load({ fileExtensions: { js: "_missing" }, iconDefinitions: {} })
    expect(useIconTheme.getState().resolve("a.js", false, false)).toBeNull()
  })
})

// Workspaces: more than one folder in one window. Every backend call is
// root-scoped already, so the whole thing rests on `rootFor` naming the right
// folder for a path — get that wrong and a file from the second folder is
// written into the first.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  readReadoFile: vi.fn(async () => null as string | null),
  writeProjectConfig: vi.fn(async () => {}),
}))
vi.mock("@/lib/notice", () => ({ notify: vi.fn() }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }))

import { readReadoFile, writeProjectConfig } from "@/lib/api"
import { useProject } from "@/lib/store"
import {
  acrossRoots,
  loadWorkspace,
  parseWorkspace,
  removeWorkspaceFolder,
  rootFor,
  saveWorkspace,
  serializeWorkspace,
  workspaceRoots,
} from "@/lib/workspace"

beforeEach(() => {
  vi.clearAllMocks()
  useProject.setState({ root: "/a", roots: ["/a"], tabs: [], active: null })
})

describe("rootFor", () => {
  it("names the folder a path lives in", () => {
    expect(rootFor("/a/src/x.ts", ["/a", "/b"])).toBe("/a")
    expect(rootFor("/b/src/x.ts", ["/a", "/b"])).toBe("/b")
  })

  it("prefers the nearer folder when one is checked out inside another", () => {
    // The inner folder is the one whose `.reado/` and `.gitignore` actually
    // govern the file.
    expect(rootFor("/a/vendor/lib/x.ts", ["/a", "/a/vendor/lib"])).toBe("/a/vendor/lib")
  })

  it("doesn't mistake a sibling that shares a prefix", () => {
    // "/a-backup" starts with "/a" as a string but is a different folder.
    expect(rootFor("/a-backup/x.ts", ["/a", "/a-backup"])).toBe("/a-backup")
    expect(rootFor("/a-backup/x.ts", ["/a"])).toBe("/a") // falls back, not claimed
  })

  it("tolerates trailing slashes and Windows separators", () => {
    expect(rootFor("/a/src/x.ts", ["/a/"])).toBe("/a/")
    expect(rootFor("C:\\\\a\\\\src\\\\x.ts", ["C:\\\\a"])).toBe("C:\\\\a")
  })

  it("falls back to the primary folder for a path under none of them", () => {
    // Every single-folder call already assumed this; it must keep working.
    expect(rootFor("/elsewhere/x.ts", ["/a", "/b"])).toBe("/a")
  })

  it("reads the store when it isn't told the list", () => {
    useProject.setState({ root: "/a", roots: ["/a", "/b"] })
    expect(rootFor("/b/x.ts")).toBe("/b")
  })
})

describe("the folder list", () => {
  it("stores only the folders beyond the primary one", () => {
    // Where the file lives *is* the primary folder; writing it down again would
    // break the moment someone moved the checkout.
    expect(JSON.parse(serializeWorkspace(["/a", "/b", "/c"]))).toEqual({ folders: ["/b", "/c"] })
  })

  it("round-trips", () => {
    expect(parseWorkspace(serializeWorkspace(["/a", "/b"]))).toEqual(["/b"])
  })

  it("ignores a malformed or foreign file instead of failing to open", () => {
    expect(parseWorkspace("{ not json")).toEqual([])
    expect(parseWorkspace("{}")).toEqual([])
    expect(parseWorkspace('{"folders":[1,"", "/ok"]}')).toEqual(["/ok"])
  })

  it("reads nothing when the project has no workspace file", async () => {
    vi.mocked(readReadoFile).mockResolvedValue(null)
    await expect(loadWorkspace("/a")).resolves.toEqual([])
  })

  it("writes into the primary folder's .reado/, under its own name", async () => {
    useProject.setState({ root: "/a", roots: ["/a", "/b"] })
    await saveWorkspace()
    const [root, json, name] = vi.mocked(writeProjectConfig).mock.calls[0]
    expect(root).toBe("/a")
    expect(name).toBe("workspace.json")
    expect(JSON.parse(json)).toEqual({ folders: ["/b"] })
  })
})

describe("removeWorkspaceFolder", () => {
  it("closes the tabs that belonged to it", async () => {
    // Nothing would know which folder to save them against.
    useProject.setState({
      root: "/a",
      roots: ["/a", "/b"],
      tabs: ["/a/x.ts", "/b/y.ts"],
      active: "/b/y.ts",
    })
    await removeWorkspaceFolder("/b")
    expect(useProject.getState().roots).toEqual(["/a"])
    expect(useProject.getState().tabs).toEqual(["/a/x.ts"])
    expect(useProject.getState().active).toBeNull()
  })

  it("refuses to remove the primary folder", async () => {
    // It owns the workspace file and the annotations; that is "close project".
    await removeWorkspaceFolder("/a")
    expect(useProject.getState().roots).toEqual(["/a"])
  })
})

describe("acrossRoots", () => {
  it("concatenates every folder's answer", async () => {
    await expect(acrossRoots(["/a", "/b"], async (r) => [`${r}/x`])).resolves.toEqual([
      "/a/x",
      "/b/x",
    ])
  })

  it("lets a folder that fails contribute nothing, rather than failing it all", async () => {
    // An unmounted or unreadable folder must not cost you the other one's
    // results: half a file list beats none.
    const call = async (r: string) => {
      if (r === "/b") throw new Error("gone")
      return [r]
    }
    await expect(acrossRoots(["/a", "/b"], call)).resolves.toEqual(["/a"])
  })
})

describe("workspaceRoots", () => {
  it("is just the one folder before a workspace has been loaded", () => {
    useProject.setState({ root: "/a", roots: [] })
    expect(workspaceRoots()).toEqual(["/a"])
  })

  it("is empty with no project open", () => {
    useProject.setState({ root: "", roots: [] })
    expect(workspaceRoots()).toEqual([])
  })
})

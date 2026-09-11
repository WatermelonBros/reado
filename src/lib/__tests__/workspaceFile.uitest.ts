// The portable workspace file: the path maths that make it survive being
// committed and cloned somewhere else, and the round trip through disk.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { readSettingsFile, writeSettingsFile, listDir } = vi.hoisted(() => ({
  readSettingsFile: vi.fn(async (_path: string) => "{}"),
  writeSettingsFile: vi.fn(async (_path: string, _json: string) => {}),
  listDir: vi.fn(async (_root: string) => [] as unknown[]),
}))
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  readSettingsFile: (p: string) => readSettingsFile(p),
  writeSettingsFile: (p: string, j: string) => writeSettingsFile(p, j),
  listDir: (root: string) => listDir(root),
}))
const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock("@/lib/notice", () => ({ notify, notifyError: vi.fn() }))

import { useProject } from "@/lib/store"
import {
  dirOf,
  foldersOfWorkspaceFile,
  parseWorkspaceFile,
  relativePath,
  resolvePath,
  serializeWorkspaceFile,
  updateWorkspaceFile,
} from "@/lib/workspaceFile"

beforeEach(() => {
  vi.clearAllMocks()
  listDir.mockResolvedValue([])
  useProject.setState({ root: "/work/app", roots: ["/work/app"], workspaceFile: null })
})

describe("paths", () => {
  it("resolves a relative folder against the file's own directory", () => {
    expect(dirOf("/work/team.reado-workspace")).toBe("/work")
    expect(resolvePath("/work", "./app")).toBe("/work/app")
    expect(resolvePath("/work/app", "../api")).toBe("/work/api")
    // An absolute entry is left alone — a workspace may span volumes.
    expect(resolvePath("/work", "/elsewhere/lib")).toBe("/elsewhere/lib")
  })

  it("writes folders relative to the file where it can", () => {
    expect(relativePath("/work", "/work/app")).toBe("app")
    expect(relativePath("/work/tools", "/work/app")).toBe("../app")
    expect(relativePath("/work", "/work")).toBe(".")
  })
})

describe("the file", () => {
  const file = "/work/team.reado-workspace"

  it("round-trips a workspace through its own format", () => {
    const json = serializeWorkspaceFile(file, ["/work/app", "/work/api"])
    expect(JSON.parse(json)).toEqual({ folders: [{ path: "app" }, { path: "api" }] })
    // Read back from the same place, the folders are absolute again…
    expect(parseWorkspaceFile(file, json)).toEqual(["/work/app", "/work/api"])
    // …and from a clone somewhere else, they follow the file.
    expect(parseWorkspaceFile("/elsewhere/team.reado-workspace", json)).toEqual([
      "/elsewhere/app",
      "/elsewhere/api",
    ])
  })

  it("ignores entries it cannot use instead of failing the whole file", () => {
    expect(parseWorkspaceFile(file, "not json")).toEqual([])
    expect(parseWorkspaceFile(file, JSON.stringify({ folders: [{ path: "app" }, 7, {}] }))).toEqual(
      ["/work/app"],
    )
  })

  it("opens the folders that are still there, and reports the one that isn't", async () => {
    readSettingsFile.mockResolvedValue(
      JSON.stringify({ folders: [{ path: "app" }, { path: "gone" }] }),
    )
    listDir.mockImplementation(async (root: string) => {
      if (root === "/work/gone") throw new Error("no such directory")
      return []
    })
    await expect(foldersOfWorkspaceFile(file)).resolves.toEqual(["/work/app"])
    expect(notify).toHaveBeenCalledWith("error", expect.stringContaining("gone"))
  })

  it("writes the folder list back to the file the window was opened from", async () => {
    useProject.setState({
      root: "/work/app",
      roots: ["/work/app", "/work/api"],
      workspaceFile: file,
    })
    await expect(updateWorkspaceFile()).resolves.toBe(true)
    expect(writeSettingsFile).toHaveBeenCalledWith(file, expect.stringContaining('"path": "api"'))
  })

  it("leaves a plain folder alone — nothing to write back to", async () => {
    await expect(updateWorkspaceFile()).resolves.toBe(false)
    expect(writeSettingsFile).not.toHaveBeenCalled()
  })
})

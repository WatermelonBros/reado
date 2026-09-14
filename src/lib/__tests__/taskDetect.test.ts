// Tasks a project already describes in its manifests, with no tasks.json.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DirEntry } from "@/lib/api"

const listDir = vi.fn<(...a: unknown[]) => Promise<DirEntry[]>>(async () => [])
const readFile = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
  kind: "text",
  text: "{}",
}))
vi.mock("@/lib/api", () => ({
  listDir: (...a: unknown[]) => listDir(...a),
  readFile: (...a: unknown[]) => readFile(...a),
}))

import { detectTasks, packageManagerFor } from "@/lib/taskDetect"

const ROOT = "/repo"
/** The root listing, as the backend reports it. */
const root = (...names: string[]) =>
  listDir.mockResolvedValue(
    names.map((name) => ({ name, path: `${ROOT}/${name}`, isDir: false })) as DirEntry[],
  )
const pkg = (scripts: Record<string, string>) =>
  readFile.mockResolvedValue({ kind: "text", text: JSON.stringify({ scripts }) })

beforeEach(() => {
  listDir.mockReset().mockResolvedValue([])
  readFile.mockReset().mockResolvedValue({ kind: "text", text: "{}" })
})

describe("the package manager a project implies", () => {
  it("comes from the lockfile, because the wrong one resolves the wrong binaries", () => {
    expect(packageManagerFor(["pnpm-lock.yaml"])).toBe("pnpm")
    expect(packageManagerFor(["yarn.lock"])).toBe("yarn")
    expect(packageManagerFor(["bun.lockb"])).toBe("bun")
    expect(packageManagerFor(["package-lock.json"])).toBe("npm")
    // Nothing to go on: npm, which every install has.
    expect(packageManagerFor(["package.json"])).toBe("npm")
  })
})

describe("detecting tasks", () => {
  it("offers one task per package.json script, run with the project's manager", async () => {
    root("package.json", "pnpm-lock.yaml")
    pkg({ build: "vite build", test: "vitest", "test:ui": "vitest --ui" })
    const { tasks, pm } = await detectTasks(ROOT)
    expect(pm).toBe("pnpm")
    expect(tasks.map((t) => t.label)).toEqual(["pnpm: build", "pnpm: test", "pnpm: test:ui"])
    expect(tasks[0]).toMatchObject({ command: "pnpm", args: ["run", "build"], detected: "pnpm" })
    // The two whose names say what they are get their group, so ⇧⌘B and the
    // test group have something to find. `test:ui` does not — a shortcut with
    // five candidates runs nothing.
    expect(tasks.map((t) => t.group)).toEqual(["build", "test", undefined])
  })

  it("offers cargo's and go's, each with the matcher that reads their output", async () => {
    root("Cargo.toml", "go.mod")
    const { tasks } = await detectTasks(ROOT)
    expect(tasks.filter((t) => t.detected === "cargo").map((t) => t.label)).toEqual([
      "cargo: build",
      "cargo: test",
      "cargo: check",
      "cargo: clippy",
      "cargo: run",
    ])
    expect(tasks.find((t) => t.label === "cargo: build")?.matchers).toEqual(["$rustc"])
    expect(tasks.find((t) => t.label === "go: test")).toMatchObject({
      command: "go",
      args: ["test", "./..."],
      matchers: ["$go"],
    })
  })

  it("offers tsc build and watch when there is a tsconfig", async () => {
    root("tsconfig.json")
    const { tasks } = await detectTasks(ROOT)
    expect(tasks.map((t) => t.label)).toEqual([
      "tsc: build - tsconfig.json",
      "tsc: watch - tsconfig.json",
    ])
    expect(tasks[0].matchers).toEqual(["$tsc"])
  })

  it("finds nothing in a project that describes nothing, without failing", async () => {
    root("README.md")
    await expect(detectTasks(ROOT)).resolves.toEqual({ tasks: [], pm: "npm" })
    // A project with no manifests costs one listing and no reads at all.
    expect(readFile).not.toHaveBeenCalled()
  })

  it("survives a package.json that does not parse", async () => {
    root("package.json")
    readFile.mockResolvedValue({ kind: "text", text: "{ not json" })
    await expect(detectTasks(ROOT)).resolves.toMatchObject({ tasks: [] })
  })

  it("survives a root it cannot list", async () => {
    listDir.mockRejectedValue(new Error("nope"))
    await expect(detectTasks(ROOT)).resolves.toEqual({ tasks: [], pm: "npm" })
  })
})

// Loading a project's tasks: what is written down, plus what was detected, in
// one list — and which of the two wins when they collide.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DirEntry } from "@/lib/api"

const listDir = vi.fn<(...a: unknown[]) => Promise<DirEntry[]>>(async () => [])
const readFile = vi.fn<(root: string, path: string) => Promise<unknown>>(async () => {
  throw new Error("missing")
})
vi.mock("@/lib/api", () => ({
  listDir: (...a: unknown[]) => listDir(...a),
  readFile: (root: string, path: string) => readFile(root, path),
  createFile: vi.fn(),
  writeFile: vi.fn(),
  ptyWrite: vi.fn(),
}))
vi.mock("@/lib/notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))

import { notify } from "@/lib/notice"
import { loadTasks, useTasks } from "@/lib/tasks"

const ROOT = "/repo"
/** The project's root listing and the contents of the files in it. */
const project = (files: Record<string, string>) => {
  listDir.mockResolvedValue(
    Object.keys(files)
      .filter((name) => !name.includes("/"))
      .map((name) => ({ name, path: `${ROOT}/${name}`, isDir: false })) as DirEntry[],
  )
  readFile.mockImplementation(async (_root, path) => {
    const rel = path.slice(ROOT.length + 1)
    if (!(rel in files)) throw new Error(`no ${rel}`)
    return { kind: "text", text: files[rel] }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useTasks.setState({ tasks: [], source: null })
})

describe("loading a project's tasks", () => {
  it("detects them with no tasks file at all — VS Code runs those too", async () => {
    project({ "package.json": '{"scripts":{"build":"vite build"}}' })
    const tasks = await loadTasks(ROOT)
    expect(tasks.map((t) => t.label)).toEqual(["npm: build"])
    // No file backs them, and the panel has to be able to say so.
    expect(useTasks.getState().source).toBeNull()
  })

  it("puts the written tasks first and the detected ones after", async () => {
    project({
      "package.json": '{"scripts":{"build":"vite build"}}',
      ".reado/tasks.json": '{"tasks":[{"label":"deploy","command":"./deploy.sh"}]}',
    })
    expect((await loadTasks(ROOT)).map((t) => t.label)).toEqual(["deploy", "npm: build"])
    expect(useTasks.getState().source).toBe(".reado/tasks.json")
  })

  it("lets a written task override the detected one it shares a label with", async () => {
    project({
      "package.json": '{"scripts":{"build":"vite build"}}',
      ".reado/tasks.json":
        '{"tasks":[{"label":"npm: build","command":"pnpm","args":["run","build"],"problemMatcher":["$tsc"]}]}',
    })
    const tasks = await loadTasks(ROOT)
    // One row, not two: the project is customising that task, not adding one.
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ command: "pnpm", matchers: ["$tsc"] })
    expect(tasks[0].detected).toBeUndefined()
  })

  it("resolves a typed npm task with the manager the lockfile names", async () => {
    project({
      "package.json": '{"scripts":{"build":"vite build"}}',
      "pnpm-lock.yaml": "",
      ".vscode/tasks.json": '{"tasks":[{"type":"npm","script":"build","problemMatcher":[]}]}',
    })
    const tasks = await loadTasks(ROOT)
    expect(tasks[0]).toMatchObject({ label: "npm: build", command: "pnpm", args: ["run", "build"] })
    expect(useTasks.getState().source).toBe(".vscode/tasks.json")
  })

  it("keeps the detected tasks when the file it finds does not parse", async () => {
    project({ "package.json": '{"scripts":{"build":"vite build"}}', ".reado/tasks.json": "{ nope" })
    expect((await loadTasks(ROOT)).map((t) => t.label)).toEqual(["npm: build"])
    // …and says so, rather than leaving a silently empty list.
    expect(notify).toHaveBeenCalledWith("error", expect.anything())
  })
})

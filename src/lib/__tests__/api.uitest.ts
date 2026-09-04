// The Tauri command boundary. Every wrapper in `lib/api` is a name, a command id
// and an argument mapping — and a typo in any of the three fails at runtime, in
// the webview, with no compiler to catch it. So this sweeps all of them: each
// wrapper must reach `invoke` exactly once, with the command its name implies
// and every argument it was handed. The wrappers that do more than forward get
// their own assertions below.
import { beforeEach, describe, expect, it, vi } from "vitest"

const invoke = vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(
  async () => null,
)
vi.mock("../logger", () => ({
  tracedInvoke: (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd as never, args as never),
}))

import * as api from "@/lib/api"
import { useSettings } from "@/lib/store"

/** camelCase → snake_case, the convention every command id follows. */
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

/** Wrappers whose command id isn't the snake_case of their name. Each one is a
 *  deliberate deviation, listed here so a *new* one can't slip in unnoticed. */
const RENAMED: Record<string, string> = { setReadState: "set_read" }

/** Wrappers that aren't a single `invoke` — they're covered separately. */
const NOT_A_WRAPPER = new Set(["submitToTerminal"])

/** Parameters that don't forward under their own name. Like `RENAMED`, each is
 *  a deliberate deviation listed so a new one can't slip in unnoticed. */
const KEY_ALIAS: Record<string, Record<string, string>> = {
  previewPersistState: { consoleJson: "console", networkJson: "network" },
}

type Wrapper = (...args: unknown[]) => unknown
const wrappers = Object.entries(api).filter(
  ([name, v]) => typeof v === "function" && !NOT_A_WRAPPER.has(name),
) as Array<[string, Wrapper]>

/** Distinct sample values, so a swapped pair of arguments is still a mismatch. */
const sample = (i: number) => `arg-${i}`

/** The wrapper's parameter names, read off its source. Every wrapper forwards
 *  its parameters as same-named keys, so this is what lets the sweep check the
 *  *mapping* rather than just that the values arrived somehow. */
const paramNames = (fn: Wrapper): string[] => {
  const src = fn.toString()
  const head = src.slice(src.indexOf("(") + 1, src.indexOf(")"))
  return head
    .split(",")
    .map((p) => p.split(/[=:]/)[0].trim())
    .filter(Boolean)
}

const lastArgs = () => (invoke.mock.lastCall?.[1] ?? {}) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  useSettings.setState({ excludeGlobs: ["**/node_modules/**"] })
})

describe("the command boundary", () => {
  it("still sees every wrapper — bump this when you add one", () => {
    // A tripwire on the sweep itself. Exact, not `>=`: a loosened filter or a
    // broken mock would otherwise shrink the sweep silently.
    expect(wrappers).toHaveLength(148)
  })

  for (const [name, fn] of wrappers) {
    it(`${name} invokes ${RENAMED[name] ?? snake(name)} once, forwarding its arguments`, async () => {
      const args = Array.from({ length: fn.length }, (_, i) => sample(i))
      await fn(...args)
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke.mock.lastCall?.[0]).toBe(RENAMED[name] ?? snake(name))
      // Check the *mapping*, not just that the values arrived: `{ root: file,
      // file: root }` passes a containment check and fails this one.
      // `fn.length` stops at the first defaulted parameter, so only the
      // required ones are sampled; those are the ones the sweep can drive.
      const names = paramNames(fn).slice(0, args.length)
      expect(names).toHaveLength(args.length)
      expect(names.map((n) => lastArgs()[KEY_ALIAS[name]?.[n] ?? n])).toEqual(args)
    })
  }
})

describe("the wrappers that do more than forward", () => {
  it("listDir and listFiles carry the user's exclude globs", async () => {
    await api.listDir("/root", "/root/src", true)
    expect(lastArgs()).toEqual({
      root: "/root",
      dir: "/root/src",
      showHidden: true,
      exclude: ["**/node_modules/**"],
    })
    await api.listFiles("/root")
    expect(lastArgs().exclude).toEqual(["**/node_modules/**"])
  })

  it("search and replace carry them too — the tree and the search must agree", async () => {
    await api.searchText("/root", "needle")
    expect(lastArgs()).toEqual({
      root: "/root",
      query: "needle",
      exclude: ["**/node_modules/**"],
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })
    await api.replaceText("/root", "a", "b")
    expect(lastArgs().exclude).toEqual(["**/node_modules/**"])
  })

  it("searchText flattens its options into flat arguments", async () => {
    await api.searchText("/root", "needle", { caseSensitive: true, wholeWord: false, regex: true })
    expect(lastArgs()).toMatchObject({ caseSensitive: true, wholeWord: false, regex: true })
  })

  it("readFile passes the guard through, and omits what wasn't asked for", async () => {
    await api.readFile("/root", "/root/a.ts")
    expect(lastArgs()).toEqual({
      root: "/root",
      path: "/root/a.ts",
      asText: undefined,
      guardBytes: undefined,
    })
    await api.readFile("/root", "/root/a.svg", true, 0)
    expect(lastArgs()).toMatchObject({ asText: true, guardBytes: 0 })
  })

  it("setReadState sends null — not undefined — when there's no snapshot", async () => {
    await api.setReadState("/root", "a.ts", true)
    expect(lastArgs()).toEqual({ root: "/root", path: "a.ts", read: true, content: null })
    await api.setReadState("/root", "a.ts", true, "the bytes")
    expect(lastArgs().content).toBe("the bytes")
  })

  it("resolvePath defaults to an exact match, not a suffix search", async () => {
    await api.resolvePath("/root", "Terminal.tsx")
    expect(lastArgs()).toEqual({ root: "/root", spec: "Terminal.tsx", search: false })
    await api.resolvePath("/root", "Terminal.tsx", true)
    expect(lastArgs().search).toBe(true)
  })

  it("the two ref readers ask different questions of the same ref", async () => {
    await api.gitShowRef("/root", "a.ts", "HEAD")
    expect(invoke.mock.lastCall?.[0]).toBe("git_show_ref")
    await api.gitDiffBase("/root", "a.ts", "HEAD")
    expect(invoke.mock.lastCall?.[0]).toBe("git_diff_base")
    expect(lastArgs()).toEqual({ root: "/root", file: "a.ts", base: "HEAD" })
  })

  it("gitDiffLines keeps base and head in that order — reversing it inverts the diff", async () => {
    await api.gitDiffLines("/root", "a.ts", "main", "feature")
    expect(lastArgs()).toEqual({ root: "/root", file: "a.ts", base: "main", head: "feature" })
  })

  it("the destructive git commands say whether untracked files go too", async () => {
    await api.gitDiscard("/root", "a.ts", true)
    expect(lastArgs()).toEqual({ root: "/root", path: "a.ts", untracked: true })
    await api.gitDiscardAll("/root", false)
    expect(lastArgs()).toEqual({ root: "/root", untracked: false })
  })

  it("previewOpen passes the pane rect in x/y/w/h order", async () => {
    await api.previewOpen("http://localhost:5173", 10, 20, 800, 600)
    expect(lastArgs()).toMatchObject({ x: 10, y: 20, w: 800, h: 600 })
  })

  it("ptySpawn carries the terminal's size, not just its id", async () => {
    await api.ptySpawn("t1", "/root", 40, 120)
    expect(lastArgs()).toEqual({ id: "t1", cwd: "/root", rows: 40, cols: 120 })
  })
})

describe("submitToTerminal", () => {
  it("sends the text and the Enter as two writes, so a TUI agent submits", async () => {
    vi.useFakeTimers()
    api.submitToTerminal("t1", "ls -la")
    await vi.advanceTimersByTimeAsync(0)
    expect(invoke).toHaveBeenCalledWith("pty_write", { id: "t1", data: "ls -la" })
    expect(invoke).toHaveBeenCalledTimes(1) // the Enter is still pending
    await vi.advanceTimersByTimeAsync(200)
    expect(invoke).toHaveBeenLastCalledWith("pty_write", { id: "t1", data: "\r" })
    vi.useRealTimers()
  })

  it("waits out the delay a freshly spawned PTY needs", async () => {
    vi.useFakeTimers()
    api.submitToTerminal("t1", "claude", 400)
    await vi.advanceTimersByTimeAsync(100)
    expect(invoke).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(invoke).toHaveBeenCalledWith("pty_write", { id: "t1", data: "claude" })
    vi.useRealTimers()
  })
})

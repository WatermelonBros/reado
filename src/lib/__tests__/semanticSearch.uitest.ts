// Semantic search answers twice: the local index as you type, the agent on
// request. These cover which one answers when, that a late local answer can't
// overwrite the agent's, and that an agent answer is cached and badged. Timers
// are faked to drive the typing debounce and the agent's poll loop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({ readFile: vi.fn(), semanticQuery: vi.fn() }))
vi.mock("../agents", () => ({
  dispatchToAgent: vi.fn(async () => true),
  sanitizePromptText: (s: string) => s,
}))
vi.mock("../store", () => ({ useProject: { getState: () => ({ root: "/root" }) } }))

import { dispatchToAgent } from "@/lib/agents"
import { readFile, semanticQuery } from "@/lib/api"
import { useSemanticSearch } from "@/lib/semanticSearch"

const text = (t: string) => ({ kind: "text" as const, text: t })
const hit = (file: string, over: Record<string, unknown> = {}) => ({
  file,
  line: 1,
  snippet: "…",
  ...over,
})

/** Let the typing debounce elapse and the local query settle. */
const settleLocal = () => vi.advanceTimersByTimeAsync(200)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.mocked(semanticQuery).mockResolvedValue([])
  vi.mocked(dispatchToAgent).mockResolvedValue(true)
  useSemanticSearch.setState({
    open: false,
    query: "",
    status: "loading",
    results: [],
    askingAgent: false,
  })
})
afterEach(() => {
  useSemanticSearch.getState().close()
  vi.useRealTimers()
})

describe("the local index", () => {
  it("answers as you type, without touching the agent", async () => {
    vi.mocked(semanticQuery).mockResolvedValue([hit("src/auth.ts", { symbol: "signIn" })])
    useSemanticSearch.getState().run("where do we auth")
    expect(useSemanticSearch.getState().open).toBe(true)
    await settleLocal()

    const s = useSemanticSearch.getState()
    expect(s.status).toBe("ready")
    expect(s.results[0].file).toBe("src/auth.ts")
    expect(s.results[0].symbol).toBe("signIn")
    expect(dispatchToAgent).not.toHaveBeenCalled()
  })

  it("debounces: only the last keystroke's query runs", async () => {
    useSemanticSearch.getState().run("wh")
    useSemanticSearch.getState().run("whe")
    useSemanticSearch.getState().run("where do we auth")
    await settleLocal()
    expect(semanticQuery).toHaveBeenCalledOnce()
    expect(vi.mocked(semanticQuery).mock.calls[0][1]).toBe("where do we auth")
  })

  it("reports no matches as an answer, not a failure", async () => {
    vi.mocked(semanticQuery).mockResolvedValue([])
    useSemanticSearch.getState().run("quantum entanglement")
    await settleLocal()
    const s = useSemanticSearch.getState()
    expect(s.status).toBe("ready")
    expect(s.results).toEqual([])
  })

  it("survives an index that isn't there yet", async () => {
    vi.mocked(semanticQuery).mockRejectedValue(new Error("no index"))
    useSemanticSearch.getState().run("anything")
    await settleLocal()
    // Empty, ready, and the agent is still one click away.
    expect(useSemanticSearch.getState().status).toBe("ready")
    expect(useSemanticSearch.getState().results).toEqual([])
  })
})

describe("asking the agent", () => {
  it("dispatches only when asked, and badges what comes back", async () => {
    useSemanticSearch.getState().run("where do we auth")
    await settleLocal()
    expect(dispatchToAgent).not.toHaveBeenCalled()

    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "src/session.ts", line: 12, snippet: "signIn()" }])) as never,
    )
    useSemanticSearch.getState().askAgent()
    expect(useSemanticSearch.getState().askingAgent).toBe(true)
    expect(dispatchToAgent).toHaveBeenCalledOnce()
    expect(vi.mocked(dispatchToAgent).mock.calls[0][0]).toContain("where do we auth")

    await vi.advanceTimersByTimeAsync(1600)
    const s = useSemanticSearch.getState()
    expect(s.status).toBe("ready")
    expect(s.results[0].file).toBe("src/session.ts")
    expect(s.results[0].fromAgent).toBe(true)
    expect(s.askingAgent).toBe(false)
  })

  it("caches the answer, so the same question doesn't pay twice", async () => {
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "src/session.ts", line: 12, snippet: "x" }])) as never,
    )
    useSemanticSearch.getState().run("where do we auth")
    await settleLocal()
    useSemanticSearch.getState().askAgent()
    await vi.advanceTimersByTimeAsync(1600)

    // Ask the same thing again: the cached agent answer stands, and the local
    // index isn't allowed to replace it with a worse one.
    vi.mocked(semanticQuery).mockClear()
    useSemanticSearch.getState().run("Where do we auth")
    await settleLocal()
    expect(semanticQuery).not.toHaveBeenCalled()
    expect(useSemanticSearch.getState().results[0].fromAgent).toBe(true)
  })

  it("a local answer in flight can't land on top of the agent's", async () => {
    let release: (v: unknown) => void = () => {}
    vi.mocked(semanticQuery).mockReturnValue(
      new Promise((r) => {
        release = r
      }) as never,
    )
    useSemanticSearch.getState().run("where do we auth")

    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "src/agent.ts", line: 3, snippet: "y" }])) as never,
    )
    useSemanticSearch.getState().askAgent()
    await vi.advanceTimersByTimeAsync(1600)
    // The slow local query finally resolves — after the agent already answered.
    release([hit("src/stale.ts")])
    await vi.advanceTimersByTimeAsync(10)

    expect(useSemanticSearch.getState().results[0].file).toBe("src/agent.ts")
  })

  it("defaults a hit with no line to the top of the file", async () => {
    useSemanticSearch.getState().run("where do we auth")
    await settleLocal()
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "src/session.ts", snippet: "signIn()" }])) as never,
    )
    useSemanticSearch.getState().askAgent()
    await vi.advanceTimersByTimeAsync(1600)
    // Without the default, clicking the hit jumps to line `undefined`.
    expect(useSemanticSearch.getState().results[0].line).toBe(1)
  })

  it("a slow query for an earlier keystroke can't land on a newer one", async () => {
    // The debounce guard runs *before* the request; this is the one after it.
    let releaseOld: (v: unknown) => void = () => {}
    vi.mocked(semanticQuery).mockReturnValueOnce(
      new Promise((r) => {
        releaseOld = r
      }) as never,
    )
    useSemanticSearch.getState().run("aut")
    await vi.advanceTimersByTimeAsync(200)

    vi.mocked(semanticQuery).mockResolvedValue([hit("src/new.ts")] as never)
    useSemanticSearch.getState().run("auth")
    await vi.advanceTimersByTimeAsync(200)
    expect(useSemanticSearch.getState().results[0].file).toBe("src/new.ts")

    releaseOld([hit("src/old.ts")])
    await vi.advanceTimersByTimeAsync(10)
    expect(useSemanticSearch.getState().results[0].file).toBe("src/new.ts")
  })

  it("does nothing without a question", () => {
    useSemanticSearch.setState({ query: "   " })
    useSemanticSearch.getState().askAgent()
    expect(dispatchToAgent).not.toHaveBeenCalled()
  })

  it("surfaces a failed agent run as an error", async () => {
    vi.mocked(readFile).mockResolvedValue(text("{ not json") as never)
    useSemanticSearch.getState().run("where do we auth")
    await settleLocal()
    useSemanticSearch.getState().askAgent()
    await vi.advanceTimersByTimeAsync(1600)
    expect(useSemanticSearch.getState().status).toBe("error")
    expect(useSemanticSearch.getState().askingAgent).toBe(false)
  })
})

describe("close", () => {
  it("closes the panel and drops an in-flight query", async () => {
    vi.mocked(semanticQuery).mockResolvedValue([hit("src/late.ts")])
    // A question no earlier test asked the agent: the agent cache lives for the
    // session by design, and a cached answer would short-circuit the local query
    // this test is about.
    useSemanticSearch.getState().run("where do we parse yaml")
    useSemanticSearch.getState().close()
    expect(useSemanticSearch.getState().open).toBe(false)
    await settleLocal()
    // The superseded query must not resurrect the panel's results.
    expect(useSemanticSearch.getState().results).toEqual([])
  })
})

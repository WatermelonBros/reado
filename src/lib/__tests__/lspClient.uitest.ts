// The language-server client end to end: a real CodeMirror LSP client over a
// scripted transport, so the wiring Reado adds around it — the diagnostics tap,
// the "create task" action on a diagnostic, document sync, inlay hints and the
// hover card with its explain chip — is exercised against real protocol traffic
// rather than a stubbed plugin.
import { forEachDiagnostic } from "@codemirror/lint"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const lspStart = vi.fn(async () => {})
const lspSend = vi.fn((_id: string, _msg: string) => Promise.resolve())
const lspStop = vi.fn(async () => {})
const resolvePath = vi.fn(async () => null as string | null)
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  lspStart: (...a: unknown[]) => lspStart(...(a as [])),
  lspSend: (id: string, msg: string) => lspSend(id, msg),
  lspStop: (...a: unknown[]) => lspStop(...(a as [])),
  resolvePath: (...a: unknown[]) => resolvePath(...(a as [])),
}))

type Listener = (e: { payload: string }) => void
const listeners = new Map<string, Listener>()
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    listeners.set(event, cb)
    return () => listeners.delete(event)
  }),
}))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))
vi.mock("../notice", () => ({ notify: vi.fn() }))

import { useDiagnostics } from "@/lib/diagnostics"
import { useExtensions } from "@/lib/extensions"
import { decodeSemanticTokens, lspHover, lspSupport } from "@/lib/lsp"
import { showLensLocations } from "@/lib/lspActions"
import { notify } from "@/lib/notice"
import { useProject, useSettings } from "@/lib/store"

/** Every JSON-RPC message the client has sent. */
const sent = () => vi.mocked(lspSend).mock.calls.map(([, m]) => JSON.parse(m))

/** The messages sent to one server — several are live across these tests, and a
 *  broadcast (a setting the servers all need to hear) reaches every one. */
const sentTo = (key: string) =>
  vi
    .mocked(lspSend)
    .mock.calls.filter(([k]) => k === key)
    .map(([, m]) => JSON.parse(m))

/** Push a server → client message into the transport. */
function emit(key: string, msg: unknown) {
  listeners.get(`lsp-${key}`)?.({ payload: JSON.stringify(msg) })
}

/** Answer the client's pending request for `method` with `result`. */
function reply(key: string, method: string, result: unknown) {
  const req = sent().find((m) => m.method === method && m.id !== undefined)
  if (!req) return false
  emit(key, { jsonrpc: "2.0", id: req.id, result })
  return true
}

const CAPS = {
  capabilities: {
    textDocumentSync: 1,
    hoverProvider: true,
    inlayHintProvider: true,
    diagnosticProvider: undefined,
  },
}

let view: EditorView | undefined

/** Start a server for `root`, mount a document on it, and settle the handshake.
 *  `caps` swaps what the server advertises; `extras` adds editor extensions the
 *  test wants to observe through (an update listener, say). */
async function connect(
  root: string,
  doc = "const alpha = 1\n",
  caps: unknown = CAPS,
  extras: Extension[] = [],
) {
  const ext = await lspSupport(root, `${root}/a.ts`)
  expect(ext).not.toBeNull()
  // Read the id back rather than rebuilding it: it has to double as a Tauri
  // event name, so how it is derived from the root is the client's business.
  await vi.waitFor(() => expect(lspStart).toHaveBeenCalled())
  const started = lspStart.mock.calls as unknown as string[][]
  const key = started[started.length - 1][0]
  // The client opens with `initialize`; answer it, then acknowledge `initialized`.
  await vi.waitFor(() => expect(reply(key, "initialize", caps)).toBe(true))
  view = new EditorView({ doc, extensions: [ext!, ...extras], parent: document.body })
  await vi.waitFor(() => expect(sent().some((m) => m.method === "textDocument/didOpen")).toBe(true))
  return { key, view: view! }
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  useDiagnostics.setState({ byFile: {}, errors: {} })
  useExtensions.setState({ disabled: [] })
})
afterEach(() => {
  view?.destroy()
  view = undefined
})

describe("the handshake", () => {
  it("gives a project path with a dot an id a Tauri event can carry", async () => {
    // The bug this guards: the id was `typescript:<root>` verbatim, and Tauri
    // accepts only [A-Za-z0-9-/:_] in an event name. Under `~/code/pi.frontend-app`
    // the `listen` call threw *after* the server had spawned — a live language
    // server nobody was subscribed to, respawned every few seconds, no
    // diagnostics, and an unhandled rejection each time.
    const { key } = await connect("/Users/x/pi.frontend-app")
    expect(key).toMatch(/^[A-Za-z0-9\-/:_]+$/)
  })

  it("spawns the server, then opens the document on it", async () => {
    const { key } = await connect("/handshake")
    expect(lspStart).toHaveBeenCalledWith(key, "typescript", "/handshake")
    const open = sent().find((m) => m.method === "textDocument/didOpen")
    expect(open.params.textDocument).toMatchObject({
      uri: "file:///handshake/a.ts",
      languageId: "typescript",
      text: "const alpha = 1\n",
    })
  })
})

describe("diagnostics", () => {
  it("renders the server's diagnostics in the editor and counts them for the tree", async () => {
    const { key, view: v } = await connect("/diagnostics")
    emit(key, {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///diagnostics/a.ts",
        diagnostics: [
          {
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
            severity: 1,
            message: "alpha is never used",
          },
        ],
      },
    })
    await vi.waitFor(() => {
      const found: string[] = []
      forEachDiagnostic(v.state, (d) => found.push(d.message))
      expect(found).toEqual(["alpha is never used"])
    })
    // …and mirrored into the store the file tree reads its red counts from.
    expect(useDiagnostics.getState().byFile["/diagnostics/a.ts"]).toEqual([
      { line: 1, character: 6, severity: 1, message: "alpha is never used" },
    ])
  })

  it("maps every severity, and offers 'create task' on each", async () => {
    const { key, view: v } = await connect("/severities", "a\nb\nc\nd\n")
    emit(key, {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///severities/a.ts",
        diagnostics: [1, 2, 3, 4].map((severity, i) => ({
          range: { start: { line: i, character: 0 }, end: { line: i, character: 1 } },
          severity,
          message: `level ${severity}`,
        })),
      },
    })
    await vi.waitFor(() => {
      const sev: string[] = []
      forEachDiagnostic(v.state, (d) => sev.push(d.severity))
      expect(sev).toEqual(["error", "warning", "info", "hint"])
    })
    const actions: string[] = []
    forEachDiagnostic(v.state, (d) => actions.push(d.actions?.[0]?.name ?? ""))
    expect(actions.every((a) => a === "lsp.createTask")).toBe(true)
  })

  it("still counts a file the editor never opened — the tree's counts are per file", async () => {
    const { key } = await connect("/other")
    emit(key, {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///other/elsewhere.ts",
        diagnostics: [
          {
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } },
            severity: 1,
            message: "unused import",
          },
        ],
      },
    })
    expect(useDiagnostics.getState().byFile["/other/elsewhere.ts"]).toEqual([
      { line: 3, character: 0, severity: 1, message: "unused import" },
    ])
  })
})

describe("document sync", () => {
  it("tells the server about an edit, once the typing settles", async () => {
    vi.useFakeTimers()
    const { view: v } = await connect("/sync")
    lspSend.mockClear()
    v.dispatch({ changes: { from: 0, insert: "// note\n" } })
    expect(sent().some((m) => m.method === "textDocument/didChange")).toBe(false)
    await vi.advanceTimersByTimeAsync(700)
    expect(sent().some((m) => m.method === "textDocument/didChange")).toBe(true)
    vi.useRealTimers()
  })
})

describe("hover", () => {
  it("flattens the server's markdown into plain docs", async () => {
    const { key, view: v } = await connect("/hover")
    const docs = lspHover(v, 8)
    await vi.waitFor(() =>
      expect(
        reply(key, "textDocument/hover", {
          contents: { kind: "markdown", value: "```ts\nconst alpha: number\n```\nThe first one." },
        }),
      ).toBe(true),
    )
    await expect(docs).resolves.toContain("const alpha: number")
  })
})

describe("inlay hints", () => {
  it("asks for the viewport's hints and draws each one where it belongs", async () => {
    vi.useFakeTimers()
    const { key, view: v } = await connect("/inlay")
    await vi.advanceTimersByTimeAsync(500)
    const req = sent().find((m) => m.method === "textDocument/inlayHint")
    expect(req).toBeTruthy()
    expect(req.params.textDocument.uri).toBe("file:///inlay/a.ts")
    reply(key, "textDocument/inlayHint", [
      { position: { line: 0, character: 11 }, label: ": number", paddingLeft: true },
    ])
    await vi.waitFor(() => {
      const hint = v.dom.querySelector<HTMLElement>(".cm-inlay-hint")
      expect(hint?.textContent).toBe(": number")
      // paddingLeft is the server's way of asking for a gap before the label.
      expect(hint?.style.marginLeft).toBe("0.4ch")
    })
    vi.useRealTimers()
  })

  it("joins a label given as parts", async () => {
    vi.useFakeTimers()
    const { key, view: v } = await connect("/inlay-parts")
    await vi.advanceTimersByTimeAsync(500)
    reply(key, "textDocument/inlayHint", [
      { position: { line: 0, character: 11 }, label: [{ value: ": " }, { value: "number" }] },
    ])
    await vi.waitFor(() =>
      expect(v.dom.querySelector(".cm-inlay-hint")?.textContent).toBe(": number"),
    )
    vi.useRealTimers()
  })

  it("draws nothing when the server has no hints for the viewport", async () => {
    vi.useFakeTimers()
    const { key, view: v } = await connect("/inlay-none")
    await vi.advanceTimersByTimeAsync(500)
    // `reply` returns false when it found no matching request — without this
    // the test passes even if the client never asked for hints at all.
    expect(reply(key, "textDocument/inlayHint", null)).toBe(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(v.dom.querySelector(".cm-inlay-hint")).toBeNull()
    vi.useRealTimers()
  })
})

describe("code lenses", () => {
  /** A server that offers lenses and needs each one resolved before it has a title. */
  const LENS_CAPS = {
    capabilities: { textDocumentSync: 1, codeLensProvider: { resolveProvider: true } },
  }
  /** Settle the fetch debounce, answer `textDocument/codeLens`, then resolve each
   *  lens the client asks about — the two-step every real server puts us through. */
  async function serveLenses(key: string, lenses: unknown[], titles: unknown[]) {
    await vi.advanceTimersByTimeAsync(500)
    expect(reply(key, "textDocument/codeLens", lenses)).toBe(true)
    const resolves = () => sent().filter((m) => m.method === "codeLens/resolve")
    await vi.waitFor(() => expect(resolves()).toHaveLength(titles.length))
    // Answer each pending resolve once — `reply` always finds the first, which
    // would answer request #1 as many times as there are lenses.
    resolves().forEach((req, i) => {
      emit(key, { jsonrpc: "2.0", id: req.id, result: { range: at(0), ...(titles[i] as object) } })
    })
  }
  const REFS = (locations: unknown[]) => ({
    command: {
      title: `${locations.length} references`,
      command: "editor.action.showReferences",
      arguments: ["file:///lens/a.ts", { line: 0, character: 6 }, locations],
    },
  })
  const at = (line: number, character = 0) => ({
    start: { line, character },
    end: { line, character: character + 3 },
  })

  beforeEach(() => {
    vi.useFakeTimers()
    useSettings.setState({ codeLens: true })
  })
  afterEach(() => vi.useRealTimers())

  it("tells the server to compute them, and again when the setting flips", async () => {
    // Declaring the capability only makes typescript-language-server *build* its
    // lens providers; they then refuse to answer, because the workspace
    // configuration it starts with has them off and it never asks us about that
    // section. Measured against the real server: no push → providers in place,
    // `impl=0 refs=0` forever. This is the push.
    const { key } = await connect("/lens-config", "function a() {}\n", LENS_CAPS)
    const pushes = () => sentTo(key).filter((m) => m.method === "workspace/didChangeConfiguration")
    await vi.waitFor(() => expect(pushes()).toHaveLength(1))
    expect(pushes()[0].params.settings.typescript).toEqual({
      implementationsCodeLens: { enabled: true },
      referencesCodeLens: { enabled: true, showOnAllFunctions: true },
    })
    // Turning it on after the server is up has to reach it, or the requests we
    // start making come back empty from providers that were told no.
    useSettings.setState({ codeLens: false })
    await vi.waitFor(() => expect(pushes()).toHaveLength(2))
    expect(pushes()[1].params.settings.typescript.referencesCodeLens.enabled).toBe(false)
  })

  it("asks again when the server says its answer changed", async () => {
    // A server sends this within its first 50ms, while it is still loading the
    // project and its answer is empty. The first file opened on a large project
    // kept that empty answer, because only a document change schedules another
    // fetch — and nobody types in a file they just opened to read.
    const { key, view: v } = await connect("/lens-refresh", "function a() {}\n", LENS_CAPS)
    await serveLenses(key, [], [])
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens")).toBeNull())
    const asks = () => sentTo(key).filter((m) => m.method === "textDocument/codeLens").length
    const before = asks()
    emit(key, { jsonrpc: "2.0", id: 9001, method: "workspace/codeLens/refresh" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(asks()).toBeGreaterThan(before)
    // And the client answered it, rather than leaving the server waiting.
    expect(sentTo(key).some((m) => m.id === 9001 && "result" in m)).toBe(true)
  })

  it("asks the server to offer lenses at all", async () => {
    await connect("/lens-caps", "function a() {}\n", LENS_CAPS)
    const init = sent().find((m) => m.method === "initialize")
    // typescript-language-server builds its lens providers only for a client
    // that declares this. Undeclared, it still advertises `codeLensProvider`
    // and answers every request with [] — a silent, indistinguishable nothing.
    expect(init.params.capabilities.textDocument.codeLens).toBeTruthy()
  })

  it("asks once the handshake lands, not only if the user types", async () => {
    // The real race: the document is on screen while `initialize` is still in
    // flight, so the one scheduled fetch runs with no capabilities to check
    // against. The app opened a file, never asked for lenses, and showed none
    // for as long as nobody typed in it.
    const ext = await lspSupport("/lens-late", "/lens-late/a.ts")
    await vi.waitFor(() => expect(lspStart).toHaveBeenCalled())
    const started = lspStart.mock.calls as unknown as string[][]
    const key = started[started.length - 1][0]
    view = new EditorView({ doc: "function a() {}\n", extensions: [ext!], parent: document.body })
    // Let the scheduled fetch come and go *before* the server has answered.
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent().some((m) => m.method === "textDocument/codeLens")).toBe(false)
    // Now the handshake lands.
    expect(reply(key, "initialize", LENS_CAPS)).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent().some((m) => m.method === "textDocument/codeLens")).toBe(true)
  })

  it("resolves each lens before drawing it, and groups a line's lenses into one row", async () => {
    const { key, view: v } = await connect("/lens", "function a() {}\n", LENS_CAPS)
    await serveLenses(
      key,
      [
        { range: at(0), data: 1 },
        { range: at(0), data: 2 },
      ],
      [
        REFS([{ uri: "file:///lens/b.ts", range: at(3) }]),
        { command: { title: "1 implementation", command: "noop" } },
      ],
    )
    await vi.waitFor(() => {
      const rows = v.dom.querySelectorAll(".cm-codelens")
      expect(rows).toHaveLength(1)
      expect([...rows[0].querySelectorAll(".cm-codelens-item")].map((b) => b.textContent)).toEqual([
        "1 references",
        "1 implementation",
      ])
    })
  })

  it("draws a row for every line that has one", async () => {
    const doc = "function a() {}\nfunction b() {}\nfunction c() {}\nfunction d() {}\n"
    const { key, view: v } = await connect("/lens-many-lines", doc, LENS_CAPS)
    // Out of order and mid-line, the way a real server sends them: one provider
    // walks the file for implementations, another for references, and the two
    // lists are concatenated rather than merged.
    const lines = [2, 0, 3, 1]
    await vi.advanceTimersByTimeAsync(500)
    expect(
      reply(
        key,
        "textDocument/codeLens",
        lines.map((l) => ({ range: at(l, 9), data: l })),
      ),
    ).toBe(true)
    const resolves = () => sentTo(key).filter((m) => m.method === "codeLens/resolve")
    await vi.waitFor(() => expect(resolves()).toHaveLength(lines.length))
    resolves().forEach((req, i) => {
      emit(key, {
        jsonrpc: "2.0",
        id: req.id,
        result: { range: at(lines[i], 9), command: { title: `${i + 1} references`, command: "" } },
      })
    })
    await vi.waitFor(() =>
      // Four rows, in document order whatever order the server listed them in.
      expect([...v.dom.querySelectorAll(".cm-codelens")].map((e) => e.textContent)).toEqual([
        "2 references",
        "4 references",
        "1 references",
        "3 references",
      ]),
    )
  })

  it("drops the lenses the edit invalidated", async () => {
    const { key, view: v } = await connect("/lens-edit", "function a() {}\n", LENS_CAPS)
    await serveLenses(key, [{ range: at(0), data: 1 }], [REFS([])])
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens")).toBeTruthy())
    v.dispatch({ changes: { from: 0, insert: "x" } })
    expect(v.dom.querySelector(".cm-codelens")).toBeNull()
  })

  it("never asks when the setting is off", async () => {
    useSettings.setState({ codeLens: false })
    const { key } = await connect("/lens-off", "function a() {}\n", LENS_CAPS)
    await vi.advanceTimersByTimeAsync(500)
    expect(reply(key, "textDocument/codeLens", [])).toBe(false)
  })

  it("opens the one place a lens points at", async () => {
    const open = vi.fn()
    useProject.setState({ open })
    const { key, view: v } = await connect("/lens-one", "function a() {}\n", LENS_CAPS)
    await serveLenses(
      key,
      [{ range: at(0), data: 1 }],
      [REFS([{ uri: "file:///x/b.ts", range: at(41) }])],
    )
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens-item")).toBeTruthy())
    v.dom.querySelector<HTMLElement>(".cm-codelens-item")?.click()
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/x/b.ts", 42))
  })

  it("offers the several places a lens points at", async () => {
    const open = vi.fn()
    useProject.setState({ open })
    const seen: Array<{ path: string; line: number }> = []
    const watch = EditorView.updateListener.of((u) => {
      for (const tr of u.transactions)
        for (const e of tr.effects) if (e.is(showLensLocations)) seen.push(...e.value.locations)
    })
    const { key, view: v } = await connect("/lens-many", "function a() {}\n", LENS_CAPS, [watch])
    await serveLenses(
      key,
      [{ range: at(0), data: 1 }],
      [
        REFS([
          { uri: "file:///x/b.ts", range: at(0) },
          { uri: "file:///x/c.ts", range: at(9) },
        ]),
      ],
    )
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens-item")).toBeTruthy())
    v.dom.querySelector<HTMLElement>(".cm-codelens-item")?.click()
    await vi.waitFor(() =>
      expect(seen).toEqual([
        { path: "/x/b.ts", line: 1 },
        { path: "/x/c.ts", line: 10 },
      ]),
    )
    expect(open).not.toHaveBeenCalled()
  })

  it("hands a command the server owns back to the server", async () => {
    const caps = {
      capabilities: {
        textDocumentSync: 1,
        codeLensProvider: { resolveProvider: true },
        executeCommandProvider: { commands: ["rust-analyzer.runSingle"] },
      },
    }
    const { key, view: v } = await connect("/lens-cmd", "function a() {}\n", caps)
    await serveLenses(
      key,
      [{ range: at(0), data: 1 }],
      [
        {
          command: {
            title: "▶ Run",
            command: "rust-analyzer.runSingle",
            arguments: [{ kind: "cargo" }],
          },
        },
      ],
    )
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens-item")).toBeTruthy())
    v.dom.querySelector<HTMLElement>(".cm-codelens-item")?.click()
    await vi.waitFor(() => {
      const req = sent().find((m) => m.method === "workspace/executeCommand")
      expect(req?.params).toEqual({
        command: "rust-analyzer.runSingle",
        arguments: [{ kind: "cargo" }],
      })
    })
  })

  it("says so rather than swallowing a command nobody can run", async () => {
    const { key, view: v } = await connect("/lens-unknown", "function a() {}\n", LENS_CAPS)
    await serveLenses(
      key,
      [{ range: at(0), data: 1 }],
      [{ command: { title: "▶ Run", command: "someExtension.run" } }],
    )
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-codelens-item")).toBeTruthy())
    v.dom.querySelector<HTMLElement>(".cm-codelens-item")?.click()
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("info", "lsp.lensUnsupported"))
  })
})

describe("semantic tokens", () => {
  const LEGEND = {
    tokenTypes: ["type", "parameter", "variable"],
    tokenModifiers: ["declaration", "deprecated"],
  }
  const SEM_CAPS = {
    capabilities: {
      textDocumentSync: 1,
      semanticTokensProvider: { legend: LEGEND, full: true },
    },
  }
  beforeEach(() => {
    vi.useFakeTimers()
    useSettings.setState({ semanticTokens: true })
  })
  afterEach(() => vi.useRealTimers())

  it("decodes the packed encoding, deltas and all", () => {
    // Five per token; the character delta restarts on a new line and continues
    // along one. Getting this wrong colours the right words in the wrong places.
    const tokens = decodeSemanticTokens([
      0,
      6,
      3,
      0,
      0, // line 0, char 6, len 3, type "type"
      0,
      5,
      4,
      1,
      0, // same line, char 11 (6+5), len 4, type "parameter"
      2,
      2,
      5,
      2,
      2, // two lines down, char 2 — not 13 — type "variable", deprecated
    ])
    expect(tokens).toEqual([
      { line: 0, start: 6, length: 3, type: 0, modifiers: 0 },
      { line: 0, start: 11, length: 4, type: 1, modifiers: 0 },
      { line: 2, start: 2, length: 5, type: 2, modifiers: 2 },
    ])
  })

  it("ignores a trailing group too short to be a token", () => {
    expect(decodeSemanticTokens([0, 0, 3, 0, 0, 1, 1])).toHaveLength(1)
  })

  it("colours what the server names and leaves the rest to the grammar", async () => {
    const doc = "class Alpha {}\nfunction f(beta: Alpha) {}\n"
    const { key, view: v } = await connect("/sem", doc, SEM_CAPS)
    await vi.advanceTimersByTimeAsync(500)
    expect(
      reply(key, "textDocument/semanticTokens/full", {
        resultId: "1",
        data: [0, 6, 5, 0, 0, 1, 11, 4, 1, 0],
      }),
    ).toBe(true)
    await vi.waitFor(() => {
      expect(v.dom.querySelector(".cm-sem-type")?.textContent).toBe("Alpha")
      expect(v.dom.querySelector(".cm-sem-parameter")?.textContent).toBe("beta")
    })
  })

  it("draws a deprecated symbol struck through", async () => {
    const { key, view: v } = await connect("/sem-dep", "const gone = 1\n", SEM_CAPS)
    await vi.advanceTimersByTimeAsync(500)
    expect(reply(key, "textDocument/semanticTokens/full", { data: [0, 6, 4, 0, 2] })).toBe(true)
    await vi.waitFor(() =>
      expect(v.dom.querySelector(".cm-sem-deprecated")?.textContent).toBe("gone"),
    )
  })

  it("never asks when the setting is off", async () => {
    useSettings.setState({ semanticTokens: false })
    const { key } = await connect("/sem-off", "const a = 1\n", SEM_CAPS)
    await vi.advanceTimersByTimeAsync(500)
    expect(reply(key, "textDocument/semanticTokens/full", { data: [] })).toBe(false)
  })

  it("never asks a server that does not offer them", async () => {
    const { key } = await connect("/sem-none", "const a = 1\n", CAPS)
    await vi.advanceTimersByTimeAsync(500)
    expect(reply(key, "textDocument/semanticTokens/full", { data: [] })).toBe(false)
  })

  it("drops an answer for text that has already changed", async () => {
    const { key, view: v } = await connect("/sem-stale", "const alpha = 1\n", SEM_CAPS)
    await vi.advanceTimersByTimeAsync(500)
    v.dispatch({ changes: { from: 0, insert: "x" } })
    expect(reply(key, "textDocument/semanticTokens/full", { data: [0, 6, 5, 0, 0] })).toBe(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(v.dom.querySelector(".cm-sem-type")).toBeNull()
  })

  it("asks for a delta once it has an answer to build on", async () => {
    const caps = {
      capabilities: {
        textDocumentSync: 1,
        semanticTokensProvider: { legend: LEGEND, full: { delta: true } },
      },
    }
    const { key, view: v } = await connect("/sem-delta", "class Alpha {}\n", caps)
    await vi.advanceTimersByTimeAsync(500)
    expect(
      reply(key, "textDocument/semanticTokens/full", { resultId: "7", data: [0, 6, 5, 0, 0] }),
    ).toBe(true)
    await vi.waitFor(() => expect(v.dom.querySelector(".cm-sem-type")).toBeTruthy())
    v.dispatch({ changes: { from: 14, insert: "\n" } })
    await vi.advanceTimersByTimeAsync(500)
    const req = sentTo(key).find((m) => m.method === "textDocument/semanticTokens/full/delta")
    expect(req?.params.previousResultId).toBe("7")
  })
})

describe("the server's lifecycle", () => {
  it("stops the servers it started when the page goes away", async () => {
    const { key } = await connect("/pagehide")
    window.dispatchEvent(new Event("pagehide"))
    expect(lspStop).toHaveBeenCalledWith(key)
  })
})

// The language-server client end to end: a real CodeMirror LSP client over a
// scripted transport, so the wiring Reado adds around it — the diagnostics tap,
// the "create task" action on a diagnostic, document sync, inlay hints and the
// hover card with its explain chip — is exercised against real protocol traffic
// rather than a stubbed plugin.
import { forEachDiagnostic } from "@codemirror/lint"
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
import { lspHover, lspSupport } from "@/lib/lsp"

/** Every JSON-RPC message the client has sent. */
const sent = () => vi.mocked(lspSend).mock.calls.map(([, m]) => JSON.parse(m))

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

/** Start a server for `root`, mount a document on it, and settle the handshake. */
async function connect(root: string, doc = "const alpha = 1\n") {
  const ext = await lspSupport(root, `${root}/a.ts`)
  expect(ext).not.toBeNull()
  // Read the id back rather than rebuilding it: it has to double as a Tauri
  // event name, so how it is derived from the root is the client's business.
  await vi.waitFor(() => expect(lspStart).toHaveBeenCalled())
  const started = lspStart.mock.calls as unknown as string[][]
  const key = started[started.length - 1][0]
  // The client opens with `initialize`; answer it, then acknowledge `initialized`.
  await vi.waitFor(() => expect(reply(key, "initialize", CAPS)).toBe(true))
  view = new EditorView({ doc, extensions: [ext!], parent: document.body })
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

describe("the server's lifecycle", () => {
  it("stops the servers it started when the page goes away", async () => {
    const { key } = await connect("/pagehide")
    window.dispatchEvent(new Event("pagehide"))
    expect(lspStop).toHaveBeenCalledWith(key)
  })
})

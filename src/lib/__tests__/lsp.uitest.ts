// Language-server integration: which server handles which file, the request
// wrappers that fall back when no server is attached, and the connection
// lifecycle (spawn, diagnostics tap, crash notice). The CodeMirror LSP client
// and the Rust backend are both mocked.
import type { EditorView } from "@codemirror/view"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  /** The plugin `LSPPlugin.get(view)` resolves to, or null for "no server". */
  plugin: null as null | {
    uri: string
    client: { sync: () => void; request: ReturnType<typeof vi.fn> }
    toPosition: (pos: number) => { line: number; character: number }
  },
  create: vi.fn(() => "lsp-extension"),
  connect: vi.fn(function (this: unknown) {
    return this
  }),
}))

vi.mock("@codemirror/lsp-client", () => ({
  LSPPlugin: { get: () => h.plugin, create: h.create },
  LSPClient: class {
    connect = h.connect
  },
  formatKeymap: [],
  renameKeymap: [],
  serverCompletion: () => [],
  signatureHelp: () => [],
}))

const lspStart = vi.fn(async () => {})
const lspSend = vi.fn(async () => {})
const lspStop = vi.fn(async () => {})
const resolvePath = vi.fn(async () => null as string | null)
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  lspStart: (...a: unknown[]) => lspStart(...(a as [])),
  lspSend: (...a: unknown[]) => lspSend(...(a as [])),
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

const notify = vi.fn()
vi.mock("../notice", () => ({ notify: (k: string, m: string) => notify(k, m) }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import { useDiagnostics } from "@/lib/diagnostics"
import { useExtensions } from "@/lib/extensions"
import {
  hasServer,
  lspCalls,
  lspDefinition,
  lspDocumentSymbols,
  lspHover,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspSupport,
  lspTypes,
} from "@/lib/lsp"

/** A stand-in view; every function reaches the server through LSPPlugin.get. */
const view = {} as EditorView

/** Attach a fake server whose next request resolves to `res`. */
function attach(res: unknown = null) {
  const request = vi.fn(async () => res)
  h.plugin = {
    uri: "file:///repo/src/a.ts",
    client: { sync: vi.fn(), request },
    toPosition: (pos: number) => ({ line: pos, character: 0 }),
  }
  return request
}

/** The id the client just used. It doubles as a Tauri event name, so how it is
 *  derived from the root is the client's business — read it back, don't rebuild it. */
const lastKey = () => {
  const calls = lspStart.mock.calls as unknown as string[][]
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  h.plugin = null
  lspStart.mockResolvedValue(undefined)
  resolvePath.mockResolvedValue(null)
  useExtensions.setState({ disabled: [] })
  useDiagnostics.setState({ byFile: {}, errors: {} })
})

describe("hasServer", () => {
  it("knows the languages Reado ships a server for", () => {
    for (const p of ["a.ts", "a.tsx", "a.rs", "a.py", "a.go", "a.json", "a.yaml", "a.sol"]) {
      expect(hasServer(p)).toBe(true)
    }
  })

  it("is false for a file no server covers", () => {
    expect(hasServer("README.md")).toBe(false)
    expect(hasServer("LICENSE")).toBe(false)
  })

  it("respects an extension the user disabled in the marketplace", () => {
    useExtensions.setState({ disabled: ["rust"] })
    expect(hasServer("main.rs")).toBe(false)
    expect(hasServer("a.ts")).toBe(true)
  })
})

describe("with no server attached", () => {
  it("every wrapper reports 'not mine' instead of throwing", async () => {
    expect(lspLocate(view, 0, "definition", vi.fn())).toBe(false)
    expect(lspDefinition(view, 0)).toBeNull()
    expect(lspDocumentSymbols(view)).toBeNull()
    expect(lspPrepareCallHierarchy(view, 0)).toBeNull()
    expect(lspPrepareTypeHierarchy(view, 0)).toBeNull()
    expect(lspCalls(view, { name: "f", uri: "file:///a" }, "incoming")).toBeNull()
    expect(lspTypes(view, { name: "T", uri: "file:///a" }, "super")).toBeNull()
    await expect(lspHover(view, 0)).resolves.toBeNull()
  })
})

describe("lspHover", () => {
  it("flattens the server's markdown contents", async () => {
    attach({ contents: { value: "function f(): void" } })
    await expect(lspHover(view, 3)).resolves.toContain("function f(): void")
  })

  it("joins an array of contents", async () => {
    attach({ contents: ["first", { value: "second" }] })
    const out = await lspHover(view, 3)
    expect(out).toContain("first")
    expect(out).toContain("second")
  })

  it("returns null when the server has nothing to say", async () => {
    attach(null)
    await expect(lspHover(view, 3)).resolves.toBeNull()
  })

  it("swallows a failed request", async () => {
    const request = attach()
    request.mockRejectedValue(new Error("server busy"))
    await expect(lspHover(view, 3)).resolves.toBeNull()
  })
})

describe("lspLocate", () => {
  it("opens the located file at a 1-based line", async () => {
    attach({ uri: "file:///repo/src/b.ts", range: { start: { line: 41, character: 0 } } })
    const open = vi.fn()
    expect(lspLocate(view, 3, "definition", open)).toBe(true)
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/repo/src/b.ts", 42))
  })

  it("takes the first of several locations", async () => {
    attach([
      { uri: "file:///repo/a.ts", range: { start: { line: 0, character: 0 } } },
      { uri: "file:///repo/b.ts", range: { start: { line: 9, character: 0 } } },
    ])
    const open = vi.fn()
    lspLocate(view, 3, "implementation", open)
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("/repo/a.ts", 1))
  })

  it("decodes a URI, including a Windows drive path", async () => {
    attach({ uri: "file:///C:/repo/my%20file.ts", range: { start: { line: 0, character: 0 } } })
    const open = vi.fn()
    lspLocate(view, 3, "typeDefinition", open)
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("C:/repo/my file.ts", 1))
  })

  it("opens nothing when the server found nothing", async () => {
    const request = attach(null)
    const open = vi.fn()
    expect(lspLocate(view, 3, "definition", open)).toBe(true)
    // Wait for the request chain to actually settle — one microtask leaves it
    // in flight and the absence below would hold for a working `open`.
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
    expect(open).not.toHaveBeenCalled()
  })
})

describe("lspDefinition", () => {
  it("resolves the location for a caller that renders it itself", async () => {
    attach({ uri: "file:///repo/b.ts", range: { start: { line: 4, character: 0 } } })
    await expect(lspDefinition(view, 3)).resolves.toEqual({ path: "/repo/b.ts", line: 5 })
  })

  it("resolves null on a failure rather than rejecting", async () => {
    const request = attach()
    request.mockRejectedValue(new Error("nope"))
    await expect(lspDefinition(view, 3)).resolves.toBeNull()
  })
})

describe("lspDocumentSymbols", () => {
  it("flattens nested symbols, maps their kinds and sorts by line", async () => {
    attach([
      {
        name: "Klass",
        kind: 5,
        range: { start: { line: 9 } },
        children: [{ name: "method", kind: 6, selectionRange: { start: { line: 11 } } }],
      },
      { name: "helper", kind: 12, selectionRange: { start: { line: 1 } } },
    ])
    await expect(lspDocumentSymbols(view)).resolves.toEqual([
      { name: "helper", kind: "function", line: 2 },
      { name: "Klass", kind: "class", line: 10 },
      { name: "method", kind: "method", line: 12 },
    ])
  })

  it("falls back to 'variable' for a kind it doesn't map", async () => {
    attach([{ name: "odd", kind: 99, range: { start: { line: 0 } } }])
    const out = await lspDocumentSymbols(view)
    expect(out?.[0].kind).toBe("variable")
  })

  it("returns null for an empty answer, so the caller uses its own extractor", async () => {
    attach([])
    await expect(lspDocumentSymbols(view)).resolves.toBeNull()
  })
})

describe("the hierarchies", () => {
  it("prepares a call hierarchy into navigable nodes", async () => {
    attach([
      {
        name: "outer",
        detail: "() => void",
        uri: "file:///repo/a.ts",
        selectionRange: { start: { line: 2 } },
      },
    ])
    const nodes = await lspPrepareCallHierarchy(view, 3)
    expect(nodes).toEqual([expect.objectContaining({ name: "outer", path: "/repo/a.ts", line: 3 })])
  })

  it("returns null when the server lacks the capability", async () => {
    attach([])
    await expect(lspPrepareTypeHierarchy(view, 3)).resolves.toBeNull()
  })

  it("reads callers from `from` and callees from `to`", async () => {
    const item = { name: "f", uri: "file:///repo/a.ts" }
    const request = attach([{ from: { name: "caller", uri: "file:///repo/b.ts" } }])
    await expect(lspCalls(view, item, "incoming")).resolves.toEqual([
      expect.objectContaining({ name: "caller" }),
    ])
    expect(request).toHaveBeenCalledWith("callHierarchy/incomingCalls", { item })

    request.mockResolvedValue([{ to: { name: "callee", uri: "file:///repo/c.ts" } }])
    await expect(lspCalls(view, item, "outgoing")).resolves.toEqual([
      expect.objectContaining({ name: "callee" }),
    ])
  })

  it("asks for supertypes or subtypes as requested", async () => {
    const item = { name: "T", uri: "file:///repo/a.ts" }
    const request = attach([{ name: "Base", uri: "file:///repo/base.ts" }])
    await lspTypes(view, item, "super")
    expect(request).toHaveBeenCalledWith("typeHierarchy/supertypes", { item })
    await lspTypes(view, item, "sub")
    expect(request).toHaveBeenLastCalledWith("typeHierarchy/subtypes", { item })
  })
})

// Connections are cached per (server, root) for the life of the module, so each
// test that cares about a fresh connection uses its own root.
describe("lspSupport", () => {
  it("spawns the server for the file's language and hands back the extension", async () => {
    await expect(lspSupport("/rust-root", "/rust-root/src/a.rs")).resolves.toBe("lsp-extension")
    expect(lspStart).toHaveBeenCalledWith(expect.stringMatching(/^rust:/), "rust", "/rust-root")
    // The document is announced with its own language id.
    expect(h.create).toHaveBeenCalledWith(expect.anything(), "file:///rust-root/src/a.rs", "rust")
  })

  it("tells the server a .tsx file is a react dialect, not plain typescript", async () => {
    await lspSupport("/tsx-root", "/tsx-root/src/a.tsx")
    expect(h.create).toHaveBeenCalledWith(expect.anything(), expect.any(String), "typescriptreact")
  })

  it("encodes a path with spaces into the URI", async () => {
    await lspSupport("/spaces", "/spaces/my dir/a.ts")
    expect(h.create).toHaveBeenCalledWith(
      expect.anything(),
      "file:///spaces/my%20dir/a.ts",
      "typescript",
    )
  })

  it("returns null when no server covers the file", async () => {
    await expect(lspSupport("/none", "/none/README.md")).resolves.toBeNull()
    expect(lspStart).not.toHaveBeenCalled()
  })

  it("returns null — quietly — when the server isn't installed", async () => {
    lspStart.mockRejectedValue(new Error("no such binary"))
    await expect(lspSupport("/missing", "/missing/a.go")).resolves.toBeNull()
    // Null because the spawn failed — not because the file was never routed.
    expect(lspStart).toHaveBeenCalledWith(expect.stringMatching(/^go:/), "go", "/missing")
    expect(notify).not.toHaveBeenCalled()
  })

  it("routes .ts to the Angular server in an Angular project", async () => {
    resolvePath.mockResolvedValue("/ng/angular.json")
    await lspSupport("/ng", "/ng/src/app.ts")
    expect(lspStart).toHaveBeenCalledWith(expect.stringMatching(/^angular:/), "angular", "/ng")
  })

  it("leaves .ts alone when the Angular extension is disabled", async () => {
    resolvePath.mockResolvedValue("/ng-off/angular.json")
    useExtensions.setState({ disabled: ["angular"] })
    await lspSupport("/ng-off", "/ng-off/src/app.ts")
    expect(lspStart).toHaveBeenCalledWith(
      expect.stringMatching(/^typescript:/),
      "typescript",
      "/ng-off",
    )
  })

  it("reuses one connection per server and root", async () => {
    await lspSupport("/reuse", "/reuse/a.py")
    await lspSupport("/reuse", "/reuse/b.py")
    expect(lspStart).toHaveBeenCalledTimes(1)
  })
})

describe("the connection's side channels", () => {
  it("mirrors published diagnostics into the store for the file tree", async () => {
    await lspSupport("/diag", "/diag/a.py")
    listeners.get(`lsp-${lastKey()}`)?.({
      payload: JSON.stringify({
        method: "textDocument/publishDiagnostics",
        params: {
          uri: "file:///diag/a.py",
          diagnostics: [
            { severity: 1, message: "undefined name", range: { start: { line: 3, character: 2 } } },
          ],
        },
      }),
    })
    expect(useDiagnostics.getState().byFile["/diag/a.py"]).toEqual([
      { line: 4, character: 2, severity: 1, message: "undefined name" },
    ])
  })

  it("ignores traffic that isn't a diagnostics notification", async () => {
    await lspSupport("/quiet", "/quiet/a.go")
    const send = listeners.get(`lsp-${lastKey()}`)
    const diagnostics = [
      { severity: 1, message: "real", range: { start: { line: 0, character: 0 } } },
    ]
    // Positive control: the listener is wired and does publish.
    send?.({
      payload: JSON.stringify({
        method: "textDocument/publishDiagnostics",
        params: { uri: "file:///quiet/a.go", diagnostics },
      }),
    })
    const published = useDiagnostics.getState().byFile["/quiet/a.go"]
    expect(published).toHaveLength(1)

    // The same shape under another method must not overwrite it — carrying
    // `params` too, so it is the *method* check being tested and not `!params`.
    send?.({
      payload: JSON.stringify({
        method: "window/logMessage",
        params: { uri: "file:///quiet/a.go", diagnostics: [] },
      }),
    })
    send?.({ payload: "not json at all" })
    expect(useDiagnostics.getState().byFile["/quiet/a.go"]).toEqual(published)
  })

  it("tells the user once when a server crashes, and reconnects on the next use", async () => {
    await lspSupport("/crash", "/crash/a.rb")
    listeners.get(`lsp-exit-${lastKey()}`)?.({ payload: "" })
    expect(notify).toHaveBeenCalledWith("error", "lsp.serverStopped")
    // The dead connection is dropped, so the next request spawns a fresh server.
    lspStart.mockClear()
    await lspSupport("/crash", "/crash/a.rb")
    expect(lspStart).toHaveBeenCalledTimes(1)
  })
})

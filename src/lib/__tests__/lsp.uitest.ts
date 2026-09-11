// Language-server integration: which server handles which file, the request
// wrappers that fall back when no server is attached, and the connection
// lifecycle (spawn, diagnostics tap, crash notice). The CodeMirror LSP client
// and the Rust backend are both mocked.
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  /** The plugin `LSPPlugin.get(view)` resolves to, or null for "no server". */
  plugin: null as null | {
    uri: string
    client: {
      sync: () => void
      request: ReturnType<typeof vi.fn>
      serverCapabilities?: Record<string, unknown>
    }
    toPosition: (pos: number) => { line: number; character: number }
    // Only the rename/code-action path (which edits the open document through
    // its own view) reaches these.
    view?: unknown
    fromPosition?: (p: { character: number }) => number
  },
  create: vi.fn(() => "lsp-extension"),
  /** The initialize round trip; overridden per test to make it fail. */
  initializing: () => Promise.resolve(null),
  connect: vi.fn(function (this: unknown) {
    return this
  }),
}))

vi.mock("@codemirror/lsp-client", () => ({
  LSPPlugin: { get: () => h.plugin, create: h.create },
  LSPClient: class {
    connect = h.connect
    // The real client exposes the `initialize` round trip; lsp.ts listens to it
    // so a server that starts and then refuses to initialize is reported instead
    // of surfacing as an unhandled rejection.
    initializing = h.initializing()
    // Requests that don't go through a view (workspace/symbol) reach the client
    // held in the connection map. It answers as the attached fake server does,
    // so a test sets up one server and both doors work.
    request = (...args: unknown[]) =>
      (h.plugin?.client.request as ((...a: unknown[]) => Promise<unknown>) | undefined)?.(...args)
    get serverCapabilities() {
      return h.plugin?.client.serverCapabilities
    }
  },
  formatKeymap: [],
  renameKeymap: [],
  serverCompletion: () => [],
  signatureHelp: () => [],
}))

const readFile = vi.fn(async () => ({ kind: "text", text: "old old\n", encoding: "utf-8" }))
const writeBacked = vi.fn(async () => ({ changed: 1, backups: [] }))
const lspStart = vi.fn(async () => {})
const lspInitOptions = vi.fn(async () => null as Record<string, unknown> | null)
const angularRoot = vi.fn(async () => null as string | null)
const lspSend = vi.fn(async () => {})
const lspStop = vi.fn(async () => {})
const resolvePath = vi.fn(async () => null as string | null)
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  lspStart: (...a: unknown[]) => lspStart(...(a as [])),
  lspInitOptions: (...a: unknown[]) => lspInitOptions(...(a as [])),
  angularRoot: (...a: unknown[]) => angularRoot(...(a as [])),
  lspSend: (...a: unknown[]) => lspSend(...(a as [])),
  lspStop: (...a: unknown[]) => lspStop(...(a as [])),
  resolvePath: (...a: unknown[]) => resolvePath(...(a as [])),
  readFile: (...a: unknown[]) => readFile(...(a as [])),
  writeBacked: (...a: unknown[]) => writeBacked(...(a as [])),
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
const prompt = vi.fn(async (_opts: unknown) => null as string | null)
vi.mock("../prompt", () => ({ prompt: (o: unknown) => prompt(o as never) }))
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
  lspWorkspaceSymbols,
  onTypeFormatting,
  renameSymbolAt,
} from "@/lib/lsp"
import { useProject, useSettings } from "@/lib/store"

/** A stand-in view; every function reaches the server through LSPPlugin.get. */
const view = {} as EditorView

/** Attach a fake server whose next request resolves to `res`. */
function attach(res: unknown = null) {
  const request = vi.fn(async () => res)
  h.plugin = {
    uri: "file:///repo/src/a.ts",
    // A server that answered `initialize`. Callers that check whether one is
    // ready (rather than merely present) rely on this being set.
    client: { sync: vi.fn(), request, serverCapabilities: {} },
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
  lspInitOptions.mockResolvedValue(null)
  angularRoot.mockResolvedValue(null)
  resolvePath.mockResolvedValue(null)
  useExtensions.setState({ disabled: [] })
  useDiagnostics.setState({ byFile: {}, errors: {} })
  readFile.mockResolvedValue({ kind: "text", text: "old old\n", encoding: "utf-8" })
  writeBacked.mockResolvedValue({ changed: 1, backups: [] })
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
    // `lspLocate` answers through its callbacks now, not a return value, so
    // "not mine" here means it reaches the miss handler rather than throwing.
    const miss = vi.fn()
    lspLocate(view, 0, "definition", vi.fn(), miss)
    await vi.waitFor(() => expect(miss).toHaveBeenCalled())
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
    lspLocate(view, 3, "definition", open)
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
    const miss = vi.fn()
    lspLocate(view, 3, "definition", open, miss)
    // Wait for the request chain to actually settle — one microtask leaves it
    // in flight and the absence below would hold for a working `open`.
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
    await vi.waitFor(() => expect(miss).toHaveBeenCalled())
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
    angularRoot.mockResolvedValue("/ng")
    await lspSupport("/ng", "/ng/src/app.ts")
    expect(lspStart).toHaveBeenCalledWith(expect.stringMatching(/^angular:/), "angular", "/ng")
  })

  it("roots the Angular server at the app, not at the monorepo opened above it", async () => {
    // Rooted at the folder the user opened, the server finds no angular.json,
    // no tsconfig and no node_modules — it has to run in the app's own directory.
    angularRoot.mockResolvedValue("/repo/apps/admin")
    await lspSupport("/repo", "/repo/apps/admin/src/app.ts")
    expect(angularRoot).toHaveBeenCalledWith("/repo", "/repo/apps/admin/src/app.ts")
    expect(lspStart).toHaveBeenCalledWith(
      expect.stringMatching(/^angular:/),
      "angular",
      "/repo/apps/admin",
    )
  })

  it("leaves a .ts outside any Angular app on the TypeScript server", async () => {
    angularRoot.mockResolvedValue(null)
    await lspSupport("/repo2", "/repo2/packages/util/index.ts")
    expect(lspStart).toHaveBeenCalledWith(
      expect.stringMatching(/^typescript:/),
      "typescript",
      "/repo2",
    )
  })

  it("leaves .ts alone when the Angular extension is disabled", async () => {
    angularRoot.mockResolvedValue("/ng-off")
    useExtensions.setState({ disabled: ["angular"] })
    await lspSupport("/ng-off", "/ng-off/src/app.ts")
    expect(lspStart).toHaveBeenCalledWith(
      expect.stringMatching(/^typescript:/),
      "typescript",
      "/ng-off",
    )
  })

  it("puts the backend's initializationOptions in the initialize request", async () => {
    // typescript-language-server only finds a TypeScript in the workspace root;
    // in a monorepo the backend resolves a package's one and it must reach the
    // server, which happens nowhere else — the client sends no options of its own.
    const options = { tsserver: { path: "/mono/apps/web/node_modules/typescript/lib/tsserver.js" } }
    lspInitOptions.mockResolvedValue(options)
    await lspSupport("/mono", "/mono/apps/web/src/a.ts")
    expect(lspInitOptions).toHaveBeenCalledWith("typescript", "/mono")

    const lastSent = () => {
      const calls = lspSend.mock.calls as unknown as string[][]
      return calls[calls.length - 1][1]
    }
    const connects = h.connect.mock.calls as unknown as Array<[{ send: (m: string) => void }]>
    const transport = connects[connects.length - 1][0]
    transport.send(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }))
    expect(JSON.parse(lastSent())).toMatchObject({
      method: "initialize",
      params: { initializationOptions: options },
    })

    // Every other message — one per keystroke — passes through untouched.
    const edit = JSON.stringify({ jsonrpc: "2.0", method: "textDocument/didChange" })
    transport.send(edit)
    expect(lastSent()).toBe(edit)
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

describe("lspLocate", () => {
  it("declines when the server has not finished initializing", async () => {
    // The bug behind "⌘-click does nothing": a server that started and never
    // initialized still leaves a plugin behind. Claiming it here told the caller
    // a request was on its way that could never arrive, and the caller — having
    // been told the server had it — never tried the symbol index.
    const request = attach(null)
    const plugin = h.plugin as NonNullable<typeof h.plugin>
    plugin.client.serverCapabilities = undefined
    const miss = vi.fn()
    lspLocate(view, 0, "definition", () => {}, miss)
    await vi.waitFor(() => expect(miss).toHaveBeenCalled())
    expect(request).not.toHaveBeenCalled()
  })

  it("falls back when the server answers with no location", async () => {
    // The other half: a server that knows the file but not this symbol replied
    // with nothing, the result was dropped, and the click did nothing at all —
    // no jump, no message, and the index never consulted.
    attach(null)
    const plugin = h.plugin as NonNullable<typeof h.plugin>
    plugin.client.serverCapabilities = { definitionProvider: true }
    const open = vi.fn()
    const miss = vi.fn()
    lspLocate(view, 0, "definition", open, miss)
    await vi.waitFor(() => expect(miss).toHaveBeenCalled())
    expect(open).not.toHaveBeenCalled()
  })
})

describe("a server that refuses to initialize", () => {
  it("tells the user instead of surfacing as an unhandled rejection", async () => {
    // The bug: `typescript-language-server` in a project with no TypeScript
    // starts, says so, and exits. Nobody listened to the rejected `initialize`,
    // so the console got an unhandled promise, the user got nothing, and the
    // editor went on believing it had code intelligence.
    h.initializing = () =>
      Promise.reject(new Error("Could not find a valid TypeScript installation"))
    useExtensions.setState({ disabled: [] })

    await lspSupport("/ts-root", "/ts-root/a.ts")
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("error", "lsp.serverFailed"))
    // And the dead connection is dropped, so the next open starts a fresh server
    // rather than talking to a process that has exited.
    expect(lspStop).toHaveBeenCalled()

    h.initializing = () => Promise.resolve(null)
  })
})

describe("lspWorkspaceSymbols", () => {
  /** A started server whose `workspace/symbol` answers `res`. */
  async function withServer(caps: Record<string, unknown>, res: unknown) {
    const request = attach(res)
    const plugin = h.plugin as NonNullable<typeof h.plugin>
    plugin.client.serverCapabilities = caps
    // `lspSupport` is what puts a client in the connection map; the mocked
    // LSPClient's `connect` returns itself, so this request spy is the server's.
    await lspSupport("/repo", "/repo/src/a.ts")
    return request
  }

  it("maps both response shapes and reports where each symbol is", async () => {
    const request = await withServer({ workspaceSymbolProvider: true }, [
      // `SymbolInformation`: a full location.
      {
        name: "generatedThing",
        kind: 12,
        location: { uri: "file:///repo/src/gen.ts", range: { start: { line: 41 } } },
      },
      // `WorkspaceSymbol`: a uri and nothing else.
      {
        name: "fromDependency",
        kind: 5,
        location: { uri: "file:///repo/node_modules/x/index.d.ts" },
      },
    ])
    const found = await lspWorkspaceSymbols("thing")
    expect(request).toHaveBeenCalledWith("workspace/symbol", { query: "thing" })
    expect(found).toEqual([
      { name: "generatedThing", kind: "function", path: "/repo/src/gen.ts", line: 42 },
      {
        name: "fromDependency",
        kind: "class",
        path: "/repo/node_modules/x/index.d.ts",
        line: 1,
      },
    ])
  })

  it("contributes nothing when the server can't answer, rather than failing", async () => {
    await withServer({}, [{ name: "x", location: { uri: "file:///repo/a.ts" } }])
    // No `workspaceSymbolProvider` → not asked at all.
    await expect(lspWorkspaceSymbols("x")).resolves.toEqual([])

    const request = await withServer({ workspaceSymbolProvider: true }, null)
    request.mockRejectedValue(new Error("server busy"))
    await expect(lspWorkspaceSymbols("x")).resolves.toEqual([])
  })
})

describe("formatting as you type", () => {
  /** A real editor carrying the on-type extension, over a fake server. */
  function typing(caps: unknown) {
    const request = attach([
      { range: { start: { character: 0 }, end: { character: 2 } }, newText: "" },
    ])
    const plugin = h.plugin as NonNullable<typeof h.plugin>
    plugin.client.serverCapabilities = { documentOnTypeFormattingProvider: caps }
    plugin.fromPosition = (p: { character: number }) => p.character
    const view = new EditorView({
      state: EditorState.create({ doc: "  }", extensions: [onTypeFormatting()] }),
      parent: document.body,
    })
    return { request, view }
  }

  const typeChar = (view: EditorView, ch: string) =>
    view.dispatch({ changes: { from: 3, insert: ch }, userEvent: "input.type" })

  afterEach(() => useSettings.setState({ formatOnType: false }))

  it("asks the server after a character it named, and applies the answer", async () => {
    useSettings.setState({ formatOnType: true })
    const { request, view } = typing({ firstTriggerCharacter: "}", moreTriggerCharacter: [";"] })
    typeChar(view, "}")
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "textDocument/onTypeFormatting",
        expect.objectContaining({ ch: "}" }),
      ),
    )
    // The server asked for the leading whitespace to go; it went.
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe("}}"))
    view.destroy()
  })

  it("says nothing about a character the server did not name", async () => {
    useSettings.setState({ formatOnType: true })
    const { request, view } = typing({ firstTriggerCharacter: "}" })
    typeChar(view, "x")
    await new Promise((r) => setTimeout(r, 0))
    expect(request).not.toHaveBeenCalled()
    view.destroy()
  })

  it("is silent while the setting is off, and when the server does not offer it", async () => {
    const off = typing({ firstTriggerCharacter: "}" })
    typeChar(off.view, "}")
    await new Promise((r) => setTimeout(r, 0))
    expect(off.request).not.toHaveBeenCalled()
    off.view.destroy()

    useSettings.setState({ formatOnType: true })
    const unsupported = typing(undefined)
    typeChar(unsupported.view, "}")
    await new Promise((r) => setTimeout(r, 0))
    expect(unsupported.request).not.toHaveBeenCalled()
    unsupported.view.destroy()
  })
})

describe("renameSymbolAt", () => {
  /** A view holding `word` at the cursor, plus a server that can rename. */
  function renamable(changes: unknown) {
    const request = attach({ changes })
    const plugin = h.plugin as NonNullable<typeof h.plugin>
    plugin.client.serverCapabilities = { renameProvider: true }
    // The open document is edited through its own view — the half of the rename
    // that always worked. It is here so the other half can be asserted.
    const dispatch = vi.fn()
    plugin.view = { state: { doc: "old old\n" }, dispatch }
    plugin.fromPosition = (p: { character: number }) => p.character
    useProject.setState({ root: "/repo", roots: ["/repo"] })
    return {
      request,
      dispatch,
      plugin,
      view: {
        state: {
          selection: { main: { head: 4 } },
          wordAt: () => ({ from: 0, to: 3 }),
          sliceDoc: vi.fn(() => "old"),
        },
      } as unknown as EditorView,
    }
  }

  it("renames the call sites in files that are not open", async () => {
    // The bug: the library's rename applies edits through `workspace.getFile`,
    // which only knows files with an editor attached — so every other call site
    // silently kept the old name. Two files come back; both must be written.
    const edit = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } }
    const { request, view, dispatch } = renamable({
      "file:///repo/src/a.ts": [{ ...edit, newText: "next" }],
      "file:///repo/src/elsewhere.ts": [{ ...edit, newText: "next" }],
    })
    prompt.mockResolvedValue("next")

    expect(renameSymbolAt(view)).toBe(true)
    await vi.waitFor(() => expect(writeBacked).toHaveBeenCalled())

    expect(request).toHaveBeenCalledWith(
      "textDocument/rename",
      expect.objectContaining({ newName: "next" }),
    )
    // The open file goes through its own view; the closed one through the disk.
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(writeBacked).toHaveBeenCalledTimes(1)
    expect(writeBacked.mock.calls[0]).toEqual(["/repo", "src/elsewhere.ts", "next old\n", "utf-8"])
    // And the count is reported, so a partial rename is visible instead of silent.
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("success", "lsp.renamed"))
  })

  it("asks before renaming, and does nothing when the name is unchanged", async () => {
    const { request, view } = renamable({})
    prompt.mockResolvedValue("old")
    expect(renameSymbolAt(view)).toBe(true)
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled())
    expect(request).not.toHaveBeenCalled()
  })

  it("declines when the server says it cannot rename", () => {
    const { view, plugin } = renamable({})
    plugin.client.serverCapabilities = { renameProvider: false }
    expect(renameSymbolAt(view)).toBe(false)
  })

  it("renames the range the server prepares, not the word under the cursor", async () => {
    // `wordAt` on `@decorator` hands back `decorator`; the server hands back the
    // range including the `@`, and that is the one that must be renamed.
    const { view, plugin } = renamable({})
    plugin.client.serverCapabilities = { renameProvider: { prepareProvider: true } }
    const request = vi.fn(async (method: string) =>
      method === "textDocument/prepareRename"
        ? { range: { start: { character: 0 }, end: { character: 10 } } }
        : { changes: {} },
    )
    plugin.client.request = request as unknown as typeof plugin.client.request
    prompt.mockResolvedValue("next")

    expect(renameSymbolAt(view)).toBe(true)
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith("textDocument/rename", expect.any(Object)),
    )
    // The prompt was seeded from the prepared range...
    expect(view.state.sliceDoc).toHaveBeenCalledWith(0, 10)
    // ...and the rename was asked for at its start.
    expect(request).toHaveBeenCalledWith(
      "textDocument/rename",
      expect.objectContaining({ position: { line: 0, character: 0 } }),
    )
  })

  it("refuses before prompting when the server says the symbol cannot be renamed", async () => {
    const { view, plugin } = renamable({})
    plugin.client.serverCapabilities = { renameProvider: { prepareProvider: true } }
    plugin.client.request = vi.fn(async () => null)
    renameSymbolAt(view)
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("info", "lsp.renameRefused"))
    // The point of asking first: the user is never made to type a name that is
    // thrown away.
    expect(prompt).not.toHaveBeenCalled()
  })

  it("still renames when prepare is unsupported or fails", async () => {
    const { view, plugin } = renamable({})
    // No `prepareProvider` → the request is never sent.
    const request = vi.fn(async () => ({ changes: {} }))
    plugin.client.request = request as unknown as typeof plugin.client.request
    prompt.mockResolvedValue("next")
    renameSymbolAt(view)
    await vi.waitFor(() => expect(request).toHaveBeenCalled())
    expect(request).not.toHaveBeenCalledWith("textDocument/prepareRename", expect.anything())

    // And a server that offers it but throws falls back to the word range.
    plugin.client.serverCapabilities = { renameProvider: { prepareProvider: true } }
    const throwing = vi.fn(async (method: string) => {
      if (method === "textDocument/prepareRename") throw new Error("nope")
      return { changes: {} }
    })
    plugin.client.request = throwing as unknown as typeof plugin.client.request
    renameSymbolAt(view)
    await vi.waitFor(() =>
      expect(throwing).toHaveBeenCalledWith("textDocument/rename", expect.any(Object)),
    )
  })

  it("says so when the server refuses this particular symbol", async () => {
    const { view, plugin } = renamable({})
    plugin.client.request = vi.fn(async () => null)
    prompt.mockResolvedValue("next")
    renameSymbolAt(view)
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("info", "lsp.renameRefused"))
    expect(writeBacked).not.toHaveBeenCalled()
  })
})

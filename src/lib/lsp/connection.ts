import type { Transport } from "@codemirror/lsp-client"
import { LSPClient, LSPPlugin, signatureHelp } from "@codemirror/lsp-client"
import type { Extension } from "@codemirror/state"
import { create } from "zustand"
import { t } from "@/i18n"
import {
  angularRoot,
  lspInitOptions,
  lspInstalled,
  lspSend,
  lspStart,
  lspStop,
  onLspExit,
  onLspMessage,
} from "@/lib/api"
import { useDiagnostics } from "@/lib/diagnostics"
import { LANG_SERVERS, useExtensions } from "@/lib/extensions"
import { notify } from "@/lib/notice"
import { codeLenses, pushLensConfig, watchLensSetting } from "./codeLens"
import { completionWithImports } from "./completion"
import { serverDiagnostics, tapDiagnostics } from "./diagnostics"
import { documentLinks, lspFolding } from "./documentFeature"
import { onTypeFormatting } from "./edits"
import { lspHoverTooltip } from "./hover"
import { inlayHints } from "./inlayHints"
import { linkedEditing } from "./linkedEditing"
import { semanticTokens } from "./semanticTokens"
import {
  type Conn,
  conns,
  diagRefreshers,
  lensRefreshers,
  log,
  type ServerMessage,
  toUri,
} from "./shared"

interface ServerDef {
  /** Server name — resolved to an actual binary on the Rust side (allowlist). */
  id: string
  exts: string[]
}

// LSP language identifiers per extension. Crucially `.tsx`/`.jsx` are *react*
// dialects — telling the server a `.tsx` file is plain "typescript" makes it
// parse every JSX tag as a syntax error.
const LANG_IDS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  rs: "rust",
  py: "python",
  pyi: "python",
  go: "go",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  sh: "shellscript",
  bash: "shellscript",
  cs: "csharp",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sbt: "scala",
  sc: "scala",
  rb: "ruby",
  php: "php",
  lua: "lua",
  swift: "swift",
  zig: "zig",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  vue: "vue",
  svelte: "svelte",
  sol: "solidity",
  tf: "terraform",
  tfvars: "terraform",
  toml: "toml",
}

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? ""
// Which server handles which extension: the curated list in `extensions.ts`, so
// adding a language is one entry there. The binary for each `id` lives in the
// Rust allowlist (`server_command`), not here, so the webview can't choose it.
// Angular lists no extensions and so is never picked here; `lspSupport` routes
// to it by project instead.
//
// A server applies only if its extension matches *and* the user hasn't disabled
// it in the marketplace.
const serverFor = (path: string): ServerDef | null =>
  LANG_SERVERS.find(
    (s) => s.exts.includes(extOf(path)) && useExtensions.getState().isEnabled(s.id),
  ) ?? null
/** The LSP/editor language id for a file — also what snippet and grammar
 *  contributions key on, so they resolve languages the same way servers do. */
export const langIdFor = (path: string) => LANG_IDS[extOf(path)] ?? extOf(path)

/**
 * Answer the requests a server makes *of us*.
 *
 * `@codemirror/lsp-client` replies `-32601 Method not implemented` to every
 * server-initiated request, whatever it is. Servers noticed: every session
 * opened with `failed to register configuration change watcher` in the console,
 * and a server that cannot register a watcher never learns that a file changed
 * outside the editor — after a `git checkout` or an `npm install` its answers
 * are about a tree that no longer exists.
 *
 * We own the transport, so these are answered here and never reach the library.
 * Returns true when the message was handled and must not be forwarded.
 */
/**
 * What a server gets for the section it asked about, when the user has
 * configured nothing.
 *
 * `{}` is the right answer almost everywhere — it means "no preferences",
 * which is what VS Code sends for an unconfigured section. The JSON server is
 * the exception: it reads `json.validate.enable` and treats a missing value as
 * *off*, so with a bare `{}` it attaches, says nothing, and a file with a
 * syntax error as plain as `{ "a": }` reports no problems at all. Measured: the
 * CSS server went from zero diagnostics to two on the same broken file once it
 * stopped receiving `null`; JSON needed the switch named as well.
 */
const SECTION_DEFAULTS: Record<string, unknown> = {
  json: { validate: { enable: true } },
}

function answerServerRequest(key: string, msg: ServerMessage): boolean {
  // A request has both an id and a method; a response has an id and no method.
  if (msg.id == null || !msg.method) return false
  const reply = (result: unknown) =>
    void lspSend(key, JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }))
  switch (msg.method) {
    case "client/registerCapability":
    case "client/unregisterCapability":
      // Accepted: `didChangeWatchedFiles` below is us holding up our end.
      reply(null)
      return true
    case "workspace/configuration": {
      // "No per-server configuration" — an *empty object* per requested item.
      //
      // The spec allows `null` and this used to send it, which is fine for the
      // TypeScript server (it ignores the answer) and fatal for the
      // `vscode-langservers-extracted` family: css/scss/less store the null and
      // then dereference it (`Cannot read properties of null (reading
      // 'validProperties')`) on every validation, and json goes equally quiet.
      // The visible effect was a whole family of languages with no diagnostics
      // at all, while the language everyone uses most was immune — which is
      // exactly why it went unnoticed. `{}` is what VS Code itself answers for
      // an unconfigured section, and what these servers are tested against.
      const items = (msg.params as { items?: { section?: string }[] } | undefined)?.items ?? []
      reply(items.map((it) => SECTION_DEFAULTS[it?.section ?? ""] ?? {}))
      return true
    }
    case "window/workDoneProgress/create":
      reply(null)
      return true
    case "workspace/diagnostic/refresh":
      // The diagnostics twin of the code-lens refresh below, and it was missing.
      // A pull-mode server (the JSON one, for instance) answers the first
      // request before it has validated anything, then sends this to say the
      // answer is ready — and Reado replied `-32601 Method not implemented` and
      // never asked again. The file looked clean; the server had the errors all
      // along.
      reply(null)
      for (const again of diagRefreshers) again()
      return true
    case "workspace/codeLens/refresh":
      // "My answer changed — ask me again." Without this, a file opened while
      // the server was still starting keeps the empty answer it got: the fetch
      // is scheduled once, and only a document change ever schedules another.
      // On a large project that is every file you open first.
      reply(null)
      for (const again of lensRefreshers) again()
      return true
    default:
      // Everything we don't answer falls through to the library's blanket
      // `-32601 Method not implemented`, and the server prints that on its own
      // stderr — which is how a whole family of "Unhandled exception" lines got
      // into the log with nothing naming the request that caused them. Say which.
      log.warn("unanswered server request", { server: key, method: msg.method })
      return false
  }
}

/** The per-client LSP feature set: completion, hover, signature help, our
 * diagnostics and inlay hints. Rename lives with the other LSP keys in
 * `buildCodeExtensions` — a bare keymap here is not reliably installed into the
 * editor, which is why F2 did nothing while the context menu worked.
 * Definition/references
 * navigation is handled by the editor's own gestures (which fall back to the
 * index), so the library's F12/Shift-F12 keymaps are intentionally left out —
 * and so is its ⇧⌥F, because Reado binds Format Document globally to its own
 * pipeline (which tries the server first, then a configured formatter). Two
 * bindings on one key meant the document was formatted twice. */
/**
 * The capabilities behind `answerServerRequest`.
 *
 * Answering a request we never advertised is worse than not answering it: a
 * server that follows the spec does not *ask*. Without
 * `didChangeWatchedFiles.dynamicRegistration` a well-behaved server never
 * registers a watcher, so the file-change notifications we send it are dropped —
 * the feature works only with servers that register unconditionally. Declared
 * here, next to the code that honours them, so the two cannot drift.
 */
const answeredRequests = () => ({
  clientCapabilities: {
    workspace: {
      configuration: true,
      didChangeWatchedFiles: { dynamicRegistration: true },
      // A server only offers to tell us its lenses changed if we say we can act
      // on it — and it does tell us, within the first 50ms, before it has
      // finished loading the project and while its answer is still empty.
      codeLens: { refreshSupport: true },
    },
    window: { workDoneProgress: true },
    // Declaring this is what *creates* the lens providers in
    // typescript-language-server (`registerHandlers` builds them only for a
    // client that asks). Without it the server still advertises
    // `codeLensProvider` and then answers every request with an empty list —
    // which reads exactly like "this file has no lenses", and is why the
    // feature looked implemented and showed nothing.
    textDocument: { codeLens: { dynamicRegistration: false } },
  },
})

const clientExtensions = () => [
  completionWithImports(),
  lspHoverTooltip(),
  signatureHelp(),
  serverDiagnostics(),
  inlayHints(),
  onTypeFormatting(),
  lspFolding(),
  documentLinks(),
  codeLenses(),
  semanticTokens(),
  linkedEditing(),
  answeredRequests(),
]

/**
 * Push the settings a server only ever learns by being told.
 *
 * Same shape as `pushLensConfig` above and the same reason, for a different
 * server: `vscode-json-languageserver` keeps validation behind
 * `json.validate.enable` and treats "never mentioned" as off. Answering its
 * `workspace/configuration` request is not enough — measured, a file as plainly
 * broken as `{ "a": }` came back with a `full` report of zero items while the
 * CSS server, over the identical plumbing, reported two on a broken stylesheet.
 * The settings have to be pushed, once, after the handshake.
 *
 * Reads the same `SECTION_DEFAULTS` the pull answer uses, so the two can never
 * drift into telling one server two different things.
 */
function pushSectionConfig(key: string, serverId: string): void {
  const settings = SECTION_DEFAULTS[serverId]
  if (!settings) return
  void lspSend(
    key,
    JSON.stringify({
      jsonrpc: "2.0",
      method: "workspace/didChangeConfiguration",
      params: { settings: { [serverId]: settings } },
    }),
  )
}

/**
 * Tell every server that a file changed underneath it.
 *
 * The other half of accepting `client/registerCapability`: a server that
 * registered for `didChangeWatchedFiles` is entitled to hear about a `git
 * checkout`, an `npm install`, or an agent's edit. Without this its view of the
 * project quietly ages — a rename it can't see, an import it thinks is missing.
 *
 * Called from the one place that already knows about external changes, so there
 * is no second watcher.
 */
/** Watcher events waiting to be sent, per project root, and the timer that
 *  flushes them. */
const watchedChanges = new Map<string, Array<{ uri: string; type: number }>>()
let watchedFlush: number | undefined

export function notifyWatchedFileChanged(root: string, relPath: string): void {
  // Coalesced, because the bursts this exists for are bursts: a `git checkout`
  // or an agent rewriting a tree fires thousands of watcher events, and one
  // notification each means the server re-reads and re-validates thousands of
  // times. The `changes` array is there for exactly this.
  const pending = watchedChanges.get(root) ?? []
  // 2 = Changed. Created/deleted arrive as a change of the tree too, and a
  // server that re-reads the file finds out which it was.
  pending.push({ uri: toUri(`${root.replace(/\/+$/, "")}/${relPath}`), type: 2 })
  watchedChanges.set(root, pending)
  if (watchedFlush !== undefined) return
  watchedFlush = window.setTimeout(() => {
    watchedFlush = undefined
    const batches = [...watchedChanges]
    watchedChanges.clear()
    for (const [batchRoot, changes] of batches) {
      for (const p of conns.values()) {
        void p
          .then((c) => {
            if (c.root !== batchRoot) return
            c.client.notification("workspace/didChangeWatchedFiles", { changes })
          })
          .catch(() => {})
      }
    }
  }, 50)
}

// Connections we've already told the user crashed, so a flapping server notifies
// at most once until it successfully reconnects (the flag is cleared on connect).
const crashNotified = new Set<string>()

/** When a connection last failed, so a dead server isn't respawned per keystroke. */
const failedAt = new Map<string, number>()
const RETRY_COOLDOWN_MS = 30_000

/** Drop a connection and unsubscribe both its listeners (idempotent). */
function dropConn(key: string): void {
  const p = conns.get(key)
  conns.delete(key)
  if (!p) return
  void p
    .then((c) => {
      void c.unlisten.then((u) => u()).catch(() => {})
      void c.exitUnlisten.then((u) => u()).catch(() => {})
    })
    .catch(() => {})
}

// Language servers run in the Rust backend and outlive a webview reload, but
// this client's open-document state does not. After a reload the fresh CM
// LSP client re-sends `didOpen` for files the surviving server still considers
// open, which it rejects ("Can't open already open document"). Tie the server
// lifecycle to this webview session: stop the servers we started when the page
// goes away, so the next load spawns each server fresh.
if (typeof window !== "undefined") {
  const stopAll = () => {
    // Clear the map first so the resulting exit events read as intentional.
    for (const key of [...conns.keys()]) {
      dropConn(key)
      void lspStop(key)
    }
  }
  // `pagehide` is the reliable one on WebKit; `beforeunload` catches the paths
  // that skip it. Both are best-effort — `lspStop` is a round trip to Rust and
  // the page may not live that long — which is why the session is in the key
  // above rather than resting on this running in time.
  window.addEventListener("pagehide", stopAll)
  window.addEventListener("beforeunload", stopAll)
}

/**
 * Identify a server + project root, in a string that can also name a Tauri event.
 *
 * Tauri accepts only `[A-Za-z0-9-/:_]` in an event name, and this id names two of
 * them (`lsp-…`, `lsp-exit-…`). A project path holding a dot or a space —
 * `~/code/pi.frontend-app` — made `listen` throw *after* the server had already
 * spawned: a running language server nobody was subscribed to, no code
 * intelligence, and a fresh attempt (and a fresh process) every few seconds.
 * The digest keeps two paths that sanitise alike from sharing one session.
 */
function connKey(serverId: string, root: string): string {
  let h = 7
  for (const c of root) h = (h * 31 + c.charCodeAt(0)) | 0
  return `${serverId}:${root.replace(/[^A-Za-z0-9\-/:_]/g, "_")}:${(h >>> 0).toString(36)}:${SESSION}`
}

/**
 * This webview session, part of every connection key.
 *
 * LSP allows exactly one `initialize` per connection, and `lsp_start` reuses a
 * running server for the same id — so a key that was only `server:root` handed
 * the *same process* to two clients that each had to shake hands. Measured, the
 * second one was told no, each server in its own words: clangd `server already
 * initialized`, gopls `initialize called while server in initialized state`,
 * rust-analyzer `unknown request`. That client then had no code intelligence for
 * the rest of the session, and nothing on screen said so.
 *
 * Two clients reach one server in two ordinary ways: a webview reload (the
 * servers outlive it, and the `pagehide` stop below is best-effort — it is async,
 * and the page can go first), and a second window on the same project. Both are
 * fixed by the same thing: a key nobody else can produce, so every client owns
 * the process it initializes.
 *
 * The trade: when the stop below does miss, the previous session's server is
 * orphaned until the app exits (`kill_all`) instead of being adopted. That is
 * the cheaper failure — an idle process nobody talks to, versus a language with
 * no intelligence and nothing on screen to say why. Reaping it automatically
 * would mean a new session killing servers it cannot prove are dead, which is
 * exactly what breaks a second window on the same project.
 */
const SESSION = Math.random().toString(36).slice(2, 8)

/** Splice `options` into an outgoing `initialize` request; anything else passes
 * through untouched (and unparsed — every keystroke goes through here). */
function withInitOptions(message: string, options: Record<string, unknown> | null): string {
  if (!options || !message.includes('"method":"initialize"')) return message
  try {
    const msg = JSON.parse(message) as { method?: string; params?: Record<string, unknown> }
    if (msg.method !== "initialize" || !msg.params) return message
    msg.params.initializationOptions = options
    return JSON.stringify(msg)
  } catch {
    return message
  }
}

/** Get (or create) a connected client for a server + project root. */
function connect(server: ServerDef, root: string): Promise<Conn> {
  const key = connKey(server.id, root)
  const existing = conns.get(key)
  if (existing) return existing
  // A server that just failed fails again the same way, and every keystroke,
  // hover and file open asks for one: without this, a missing or non-starting
  // server spawned a fresh process and raised a fresh error toast every few
  // seconds for as long as the file stayed open.
  const failed = failedAt.get(key)
  if (failed !== undefined && Date.now() - failed < RETRY_COOLDOWN_MS) {
    return Promise.reject(new Error(`${server.id} failed to start recently`))
  }

  const p = (async () => {
    // Spawn the server first; this throws if it isn't installed/allowed.
    await lspStart(key, server.id, root)
    log.info("client connected", { server: server.id })
    crashNotified.delete(key) // fresh connection — a future crash may notify again
    const handlers = new Set<(v: string) => void>()
    const unlisten = onLspMessage(key, (payload) => {
      // Parsed once here, not once per consumer: a completion or semantic-token
      // response is routinely megabytes, and it arrives while you type.
      let msg: ServerMessage | null = null
      try {
        msg = JSON.parse(payload) as ServerMessage
      } catch {
        /* not JSON we understand; the library gets it verbatim below */
      }
      // Server-initiated requests are ours to answer; the library would refuse
      // them all with -32601.
      if (msg && answerServerRequest(key, msg)) return
      if (msg) tapDiagnostics(msg)
      for (const h of handlers) h(payload)
    })
    // The backend signals a dead server here. If we didn't tear it down on
    // purpose, drop the stale connection (so the next interaction reconnects a
    // fresh server) and tell the user once — a crashed server otherwise breaks
    // code intelligence silently.
    const exitUnlisten = onLspExit(key, () => {
      if (!conns.has(key)) return // intentional stop already removed it
      log.warn("language server exited unexpectedly", { server: server.id })
      dropConn(key)
      if (!crashNotified.has(key)) {
        crashNotified.add(key)
        notify("error", t("lsp.serverStopped", { name: server.id }))
      }
    })
    await unlisten // subscription live before we send `initialize`
    // Options only the backend can work out — which `tsserver.js` this project's
    // TypeScript is, for one. `@codemirror/lsp-client` sends no
    // `initializationOptions` and exposes no hook for them, so they go in as the
    // `initialize` request passes through here.
    const initOptions = await lspInitOptions(server.id, root).catch(() => null)
    const transport: Transport = {
      send: (m) => void lspSend(key, withInitOptions(m, initOptions)),
      subscribe: (h) => handlers.add(h),
      unsubscribe: (h) => handlers.delete(h),
    }
    // Diagnostics (`serverDiagnostics`) and document sync (`autoSync`) live in
    // these client-level extensions — `LSPPlugin.create` injects them into each
    // view. Without them the server never hears about edits and never publishes
    // diagnostics, so hover would work but errors would never surface.
    const client = new LSPClient({
      rootUri: toUri(root),
      extensions: clientExtensions(),
    }).connect(transport)
    // A server can start and then refuse to initialize — `typescript-language-server`
    // in a project with no TypeScript installed says so and exits. Nobody was
    // listening to that rejection: it surfaced as an unhandled promise in the
    // console, the user was told nothing, and `lspAttached` went on reporting a
    // live server for a process that had already gone. Take the connection down
    // so the next interaction can start a fresh one, and say so once.
    client.initializing.then(
      () => {
        failedAt.delete(key)
        pushLensConfig(key)
        pushSectionConfig(key, server.id)
        watchLensSetting()
      },
      () => failedAt.set(key, Date.now()),
    )
    client.initializing.catch((e: unknown) => {
      log.error("server failed to initialize", { server: server.id, error: String(e) })
      dropConn(key)
      void lspStop(key)
      if (!crashNotified.has(key)) {
        crashNotified.add(key)
        notify("error", t("lsp.serverFailed", { name: server.id }))
      }
    })
    return { client, root, unlisten, exitUnlisten }
  })()

  conns.set(key, p)
  // If startup failed (server missing), drop the cache entry so we don't retry
  // a dead promise and stay quiet.
  p.catch((e) => {
    log.error("client connect failed", { server: server.id, error: String(e) })
    conns.delete(key)
    failedAt.set(key, Date.now())
  })
  return p
}

// Angular has no extension of its own — it shares .ts/.html with TypeScript and
// HTML. The project that owns a file is the nearest `angular.json` at or above
// it, which is also the root that server gets: a monorepo keeps its apps a level
// down, and may hold more than one. Cached per directory, since the answer is
// the same for every file in it and this is asked on every file open.
const angularCache = new Map<string, Promise<string | null>>()
function angularProject(root: string, path: string): Promise<string | null> {
  const dir = path.slice(0, path.lastIndexOf("/")) || root
  let p = angularCache.get(dir)
  if (!p) {
    p = angularRoot(root, path).catch(() => null)
    angularCache.set(dir, p)
  }
  return p
}

// Whether each server's binary is on PATH, probed once per session, and which
// absences we've already reported.
const installProbe = new Map<string, Promise<boolean>>()
const missingNotified = new Set<string>()

/**
 * Bumped whenever the set of installed servers may have changed — an install
 * finishing, mainly.
 *
 * Open editors watch it and try to attach again. Installing a language server
 * used to change nothing at all until the window was rebuilt: the file you were
 * looking at, the one whose missing diagnostics sent you to install it, stayed
 * exactly as dead as before.
 */
export const useLspServers = create<{ nonce: number; refresh: () => void }>((set) => ({
  nonce: 0,
  refresh: () => {
    installProbe.clear()
    missingNotified.clear()
    set((s) => ({ nonce: s.nonce + 1 }))
  },
}))

/** Re-probe for servers and let open editors attach to a new one. */
export const refreshLspServers = () => useLspServers.getState().refresh()

/**
 * Is this server's binary actually installed?
 *
 * A missing server is the difference between an editor that knows the code and
 * one that guesses at it: no diagnostics, no import completions, and
 * go-to-definition down to whatever the symbol index happens to have seen. That
 * used to fail completely silently — `lsp_start` threw, we returned null, and
 * the editor just looked broken. Now it says so once per server, with the name
 * to install.
 *
 * A probe that itself fails answers "installed" so a broken check never blocks
 * a server that would have started.
 */
function checkInstalled(id: string, root: string): Promise<boolean> {
  const key = `${id}:${root}`
  let p = installProbe.get(key)
  if (!p) {
    p = lspInstalled(id, root).catch(() => true)
    installProbe.set(key, p)
  }
  return p.then((ok) => {
    if (!ok && !missingNotified.has(id)) {
      missingNotified.add(id)
      const ext = LANG_SERVERS.find((e) => e.id === id)
      notify("info", t("lsp.serverMissing", { name: ext?.name ?? id }))
    }
    return ok
  })
}

/**
 * The LSP editor extension for `path` in `root`, or null when no server is
 * configured/installed for the file's language.
 */
export async function lspSupport(root: string, path: string): Promise<Extension | null> {
  const ext = extOf(path)
  let server = serverFor(path)
  // In an Angular project, .ts/.html go to the Angular language server — rooted
  // at that project, not at the folder that happens to be open above it.
  if (
    (ext === "ts" || ext === "html" || ext === "htm") &&
    useExtensions.getState().isEnabled("angular")
  ) {
    const ngRoot = await angularProject(root, path)
    if (ngRoot) {
      server = { id: "angular", exts: server?.exts ?? [ext] }
      root = ngRoot
    }
  }
  if (!server) return null
  if (!(await checkInstalled(server.id, root))) return null
  try {
    const { client } = await connect(server, root)
    return LSPPlugin.create(client, toUri(path), langIdFor(path))
  } catch {
    return null // server not installed / failed to start
  }
}

/** Whether a server is configured for this file (cheap check, no spawn). */
export const hasServer = (path: string) => serverFor(path) !== null

// On HMR, tear the servers down so the replaced module reconnects cleanly —
// otherwise the old processes linger and get a second `initialize` (protocol
// violation), which can wedge the editor in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const key of [...conns.keys()]) {
      log.debug("client disconnected", { key })
      dropConn(key) // unlistens both subscriptions and removes from the map
      void lspStop(key).catch(() => {})
    }
    crashNotified.clear()
    failedAt.clear()
    useDiagnostics.getState().reset()
  })
}

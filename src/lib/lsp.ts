/**
 * Language Server integration (CodeMirror side).
 *
 * The Rust backend hosts the server processes; here we connect a CodeMirror
 * `LSPClient` to one per (server, project root) through a Tauri-backed transport,
 * and hand the editor a `languageServerSupport` extension for the open file.
 * Servers must be installed on the user's machine; when absent, `lsp_start`
 * fails and we silently fall back to the index-based features.
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  LSPClient,
  LSPPlugin,
  serverCompletion,
  hoverTooltips,
  signatureHelp,
  formatKeymap,
  renameKeymap,
  jumpToDefinitionKeymap,
  findReferencesKeymap,
} from "@codemirror/lsp-client";
import type { Transport } from "@codemirror/lsp-client";
import { keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { lspStart, lspSend, lspStop } from "./api";
import { useDiagnostics } from "./diagnostics";
import { taskFromDiagnostic } from "./lspActions";
import { t } from "../i18n";

interface ServerDef {
  /** Server name — resolved to an actual binary on the Rust side (allowlist). */
  id: string;
  exts: string[];
}

// Which server handles which extension. The binary for each `id` lives in the
// Rust allowlist (`server_command`), not here, so the webview can't choose it.
const SERVERS: ServerDef[] = [
  { id: "typescript", exts: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"] },
  { id: "rust", exts: ["rs"] },
];

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
};

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
const serverFor = (path: string) => SERVERS.find((s) => s.exts.includes(extOf(path))) ?? null;
const langIdFor = (path: string) => LANG_IDS[extOf(path)] ?? extOf(path);

/** A file:// URI for an absolute path (spaces and the like encoded). */
const toUri = (absPath: string) =>
  "file://" + absPath.split("/").map(encodeURIComponent).join("/");

/** The absolute path back out of a file:// URI. */
const fromUri = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

/** Tap `publishDiagnostics` to surface per-file error counts outside the editor
 * (red filenames in the tree). The CodeMirror client still renders them; this
 * just mirrors the error count into a store. */
function tapDiagnostics(payload: string) {
  let msg: { method?: string; params?: { uri: string; diagnostics: { severity?: number }[] } };
  try {
    msg = JSON.parse(payload);
  } catch {
    return;
  }
  if (msg.method !== "textDocument/publishDiagnostics" || !msg.params) return;
  const errors = msg.params.diagnostics.filter((d) => (d.severity ?? 1) === 1).length;
  useDiagnostics.getState().setErrors(fromUri(msg.params.uri), errors);
}

// ---- Diagnostics + sync (replacing the library's bundled `serverDiagnostics`,
// which we can't extend with an action) ------------------------------------

interface LspPos {
  line: number;
  character: number;
}
interface LspDiag {
  range: { start: LspPos; end: LspPos };
  severity?: number;
  message: string;
}
interface PublishParams {
  uri: string;
  version?: number;
  diagnostics: LspDiag[];
}

const toSeverity = (sev: number): Diagnostic["severity"] =>
  sev === 1 ? "error" : sev === 2 ? "warning" : sev === 4 ? "hint" : "info";

// The library's `autoSync` (which pushes `didChange` after edits) isn't
// exported, so we reimplement it: debounce doc changes, then flush via the
// public `LSPClient.sync()`.
const autoSync = ViewPlugin.fromClass(
  class {
    pending = -1;
    update(u: ViewUpdate) {
      if (!u.docChanged) return;
      if (this.pending > -1) clearTimeout(this.pending);
      this.pending = window.setTimeout(() => {
        this.pending = -1;
        LSPPlugin.get(u.view)?.client.sync();
      }, 500);
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending);
    }
  },
);

/** Our `serverDiagnostics`: renders server diagnostics as lint markers (as the
 * library does) but adds a "Create task" action so the user can turn a problem
 * into an anchored task comment straight from the tooltip. */
function serverDiagnostics() {
  return {
    clientCapabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    notificationHandlers: {
      "textDocument/publishDiagnostics": (client: LSPClient, params: PublishParams) => {
        const file = client.workspace.getFile(params.uri);
        if (!file || (params.version != null && params.version !== file.version)) return false;
        const view = file.getView();
        const plugin = view && LSPPlugin.get(view);
        if (!view || !plugin) return false;
        view.dispatch(
          setDiagnostics(
            view.state,
            params.diagnostics.map((item): Diagnostic => {
              const from = plugin.unsyncedChanges.mapPos(
                plugin.fromPosition(item.range.start, plugin.syncedDoc),
              );
              const to = plugin.unsyncedChanges.mapPos(
                plugin.fromPosition(item.range.end, plugin.syncedDoc),
              );
              return {
                from,
                to,
                severity: toSeverity(item.severity ?? 1),
                message: item.message,
                actions: [
                  {
                    name: t("lsp.createTask"),
                    apply: (v, f, tt) =>
                      v.dispatch({
                        effects: taskFromDiagnostic.of({ from: f, to: tt, message: item.message }),
                      }),
                  },
                ],
              };
            }),
          ),
        );
        return true;
      },
    },
    editorExtension: autoSync,
  };
}

/** The per-client LSP feature set: completion, hover, signature help, the LSP
 * keymaps, and our diagnostics. Mirrors the library's `languageServerExtensions`
 * but swaps in our `serverDiagnostics`. */
const clientExtensions = () => [
  serverCompletion(),
  hoverTooltips(),
  keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap]),
  signatureHelp(),
  serverDiagnostics(),
];

interface Conn {
  client: LSPClient;
  unlisten: Promise<UnlistenFn>;
}
const conns = new Map<string, Promise<Conn>>();

/** Get (or create) a connected client for a server + project root. */
function connect(server: ServerDef, root: string): Promise<Conn> {
  const key = `${server.id}:${root}`;
  const existing = conns.get(key);
  if (existing) return existing;

  const p = (async () => {
    // Spawn the server first; this throws if it isn't installed/allowed.
    await lspStart(key, server.id, root);
    const handlers = new Set<(v: string) => void>();
    const unlisten = listen<string>(`lsp-${key}`, (e) => {
      tapDiagnostics(e.payload);
      handlers.forEach((h) => h(e.payload));
    });
    await unlisten; // subscription live before we send `initialize`
    const transport: Transport = {
      send: (m) => void lspSend(key, m),
      subscribe: (h) => handlers.add(h),
      unsubscribe: (h) => handlers.delete(h),
    };
    // Diagnostics (`serverDiagnostics`) and document sync (`autoSync`) live in
    // these client-level extensions — `LSPPlugin.create` injects them into each
    // view. Without them the server never hears about edits and never publishes
    // diagnostics, so hover would work but errors would never surface.
    const client = new LSPClient({
      rootUri: toUri(root),
      extensions: clientExtensions(),
    }).connect(transport);
    return { client, unlisten };
  })();

  conns.set(key, p);
  // If startup failed (server missing), drop the cache entry so we don't retry
  // a dead promise and stay quiet.
  p.catch(() => conns.delete(key));
  return p;
}

/**
 * The LSP editor extension for `path` in `root`, or null when no server is
 * configured/installed for the file's language.
 */
export async function lspSupport(root: string, path: string): Promise<Extension | null> {
  const server = serverFor(path);
  if (!server) return null;
  try {
    const { client } = await connect(server, root);
    return LSPPlugin.create(client, toUri(path), langIdFor(path));
  } catch {
    return null; // server not installed / failed to start
  }
}

/** Whether a server is configured for this file (cheap check, no spawn). */
export const hasServer = (path: string) => serverFor(path) !== null;

// On HMR, tear the servers down so the replaced module reconnects cleanly —
// otherwise the old processes linger and get a second `initialize` (protocol
// violation), which can wedge the editor in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const [key, p] of conns) {
      void p.then((c) => c.unlisten.then((u) => u())).catch(() => {});
      void lspStop(key).catch(() => {});
    }
    conns.clear();
    useDiagnostics.getState().reset();
  });
}

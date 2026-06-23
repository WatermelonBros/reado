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
} from "@codemirror/lsp-client";
import type { Transport } from "@codemirror/lsp-client";
import {
  keymap,
  ViewPlugin,
  EditorView,
  Decoration,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state";
import { lspStart, lspSend, lspStop, resolvePath } from "./api";
import type { OutlineSymbol } from "./outline";
import { useExtensions } from "./extensions";
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
  { id: "python", exts: ["py", "pyi"] },
  { id: "go", exts: ["go"] },
  { id: "cpp", exts: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh"] },
  { id: "bash", exts: ["sh", "bash"] },
  { id: "csharp", exts: ["cs"] },
  { id: "java", exts: ["java"] },
  { id: "kotlin", exts: ["kt", "kts"] },
  { id: "scala", exts: ["scala", "sbt", "sc"] },
  { id: "ruby", exts: ["rb"] },
  { id: "php", exts: ["php"] },
  { id: "lua", exts: ["lua"] },
  { id: "swift", exts: ["swift"] },
  { id: "zig", exts: ["zig"] },
  { id: "html", exts: ["html", "htm"] },
  { id: "css", exts: ["css", "scss", "less"] },
  { id: "json", exts: ["json", "jsonc"] },
  { id: "yaml", exts: ["yaml", "yml"] },
  { id: "vue", exts: ["vue"] },
  { id: "svelte", exts: ["svelte"] },
  { id: "solidity", exts: ["sol"] },
  { id: "terraform", exts: ["tf", "tfvars"] },
  { id: "toml", exts: ["toml"] },
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
};

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
// A server applies only if its extension matches *and* the user hasn't disabled
// it in the marketplace.
const serverFor = (path: string) =>
  SERVERS.find(
    (s) => s.exts.includes(extOf(path)) && useExtensions.getState().isEnabled(s.id),
  ) ?? null;
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

interface HoverResult {
  contents: string | { value: string } | (string | { value: string })[];
}

/** Fetch the language server's hover documentation for the symbol at `pos`
 * (signature + docs), flattened to plain markdown text. Null when no server is
 * attached or there's nothing to show. Used to give the AI real context about a
 * symbol — especially from external libraries whose source isn't in the repo. */
export function lspHover(view: EditorView, pos: number): Promise<string | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return Promise.resolve(null);
  plugin.client.sync();
  return plugin.client
    .request<unknown, HoverResult | null>("textDocument/hover", {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const c = res?.contents;
      if (!c) return null;
      const text = typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c.map((x) => (typeof x === "string" ? x : x.value)).join("\n\n")
          : c.value;
      return text.trim() || null;
    })
    .catch(() => null);
}

// ---- Inlay hints (inferred types + parameter names, inline) ---------------

interface InlayHint {
  position: { line: number; character: number };
  label: string | { value: string }[];
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

class InlayWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly padL: boolean,
    readonly padR: boolean,
  ) {
    super();
  }
  eq(o: InlayWidget) {
    return o.label === this.label && o.padL === this.padL && o.padR === this.padR;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-inlay-hint";
    if (this.padL) s.style.marginLeft = "0.4ch";
    if (this.padR) s.style.marginRight = "0.4ch";
    s.textContent = this.label;
    return s;
  }
}

const setInlays = StateEffect.define<DecorationSet>();
const inlayField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) if (e.is(setInlays)) value = e.value;
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Fetches inlay hints for the viewport (debounced) and pushes them into the
// field. A no-op when the server has no inlayHintProvider (request rejects).
const inlayFetcher = ViewPlugin.fromClass(
  class {
    pending = -1;
    constructor(view: EditorView) {
      this.schedule(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.schedule(u.view);
    }
    schedule(view: EditorView) {
      if (this.pending > -1) clearTimeout(this.pending);
      this.pending = window.setTimeout(() => {
        this.pending = -1;
        this.fetch(view);
      }, 400);
    }
    fetch(view: EditorView) {
      const plugin = LSPPlugin.get(view);
      if (!plugin) return;
      const { from, to } = view.viewport;
      plugin.client
        .request<unknown, InlayHint[] | null>("textDocument/inlayHint", {
          textDocument: { uri: plugin.uri },
          range: { start: plugin.toPosition(from), end: plugin.toPosition(to) },
        })
        .then((hints) => {
          if (!hints) return;
          const items = hints
            .map((h) => ({ pos: plugin.fromPosition(h.position), h }))
            .sort((a, b) => a.pos - b.pos);
          const b = new RangeSetBuilder<Decoration>();
          for (const { pos, h } of items) {
            const label =
              typeof h.label === "string" ? h.label : h.label.map((p) => p.value).join("");
            b.add(
              pos,
              pos,
              Decoration.widget({
                widget: new InlayWidget(label, !!h.paddingLeft, !!h.paddingRight),
                side: 1,
              }),
            );
          }
          view.dispatch({ effects: setInlays.of(b.finish()) });
        })
        .catch(() => {});
    }
    destroy() {
      if (this.pending > -1) clearTimeout(this.pending);
    }
  },
);

const inlayHints = (): Extension => [inlayField, inlayFetcher];

/** The per-client LSP feature set: completion, hover, signature help, our
 * diagnostics, inlay hints, and the rename/format keymaps. Definition/references
 * navigation is handled by the editor's own gestures (which fall back to the
 * index), so the library's F12/Shift-F12 keymaps are intentionally left out. */
const clientExtensions = () => [
  serverCompletion(),
  hoverTooltips(),
  keymap.of([...formatKeymap, ...renameKeymap]),
  signatureHelp(),
  serverDiagnostics(),
  inlayHints(),
];

interface LspLocation {
  uri: string;
  range: { start: { line: number; character: number } };
}

/** Ask the server to locate a symbol (definition/typeDefinition/implementation)
 * at `pos` and open the result through the app's own navigation. Returns true
 * when a server is attached (so the caller falls back to the index only when no
 * server is present). */
export function lspLocate(
  view: EditorView,
  pos: number,
  method: "definition" | "typeDefinition" | "implementation",
  open: (path: string, line: number) => void,
): boolean {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return false;
  plugin.client.sync();
  plugin.client
    .request<unknown, LspLocation | LspLocation[] | null>(`textDocument/${method}`, {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const loc = Array.isArray(res) ? res[0] : res;
      if (loc) open(fromUri(loc.uri), loc.range.start.line + 1);
    })
    .catch(() => {});
  return true;
}

/** Resolve the definition location of the symbol at `pos` via the server, for
 *  callers (like Peek) that render the result themselves instead of navigating.
 *  Returns null synchronously when no server is attached, so the caller can fall
 *  back to the symbol index; otherwise a promise of the location (or null). */
export function lspDefinition(
  view: EditorView,
  pos: number,
): Promise<{ path: string; line: number } | null> | null {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return null;
  plugin.client.sync();
  return plugin.client
    .request<unknown, LspLocation | LspLocation[] | null>("textDocument/definition", {
      textDocument: { uri: plugin.uri },
      position: plugin.toPosition(pos),
    })
    .then((res) => {
      const loc = Array.isArray(res) ? res[0] : res;
      return loc ? { path: fromUri(loc.uri), line: loc.range.start.line + 1 } : null;
    })
    .catch(() => null);
}

// LSP SymbolKind (a subset) → the outline's coarser kinds. Unmapped kinds fall
// through to "variable" so nothing is silently dropped.
const SYMBOL_KIND: Record<number, OutlineSymbol["kind"]> = {
  5: "class", // Class
  23: "class", // Struct
  6: "method", // Method
  9: "method", // Constructor
  12: "function", // Function
  11: "type", // Interface
  10: "type", // Enum
  26: "type", // TypeParameter
  13: "variable", // Variable
  14: "variable", // Constant
  8: "variable", // Field
  7: "variable", // Property
};

interface DocSymbol {
  name: string;
  kind: number;
  range?: { start: { line: number } };
  selectionRange?: { start: { line: number } };
  location?: { range: { start: { line: number } } };
  children?: DocSymbol[];
}

/** Ask the server for the active file's document symbols, mapped to the outline
 *  shape. Returns null synchronously when no server is attached (caller falls
 *  back to the heuristic extractor); otherwise a promise of symbols (or null). */
export function lspDocumentSymbols(
  view: EditorView,
): Promise<OutlineSymbol[] | null> | null {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return null;
  plugin.client.sync();
  return plugin.client
    .request<unknown, DocSymbol[] | null>("textDocument/documentSymbol", {
      textDocument: { uri: plugin.uri },
    })
    .then((res) => {
      if (!res || !res.length) return null;
      const out: OutlineSymbol[] = [];
      const walk = (syms: DocSymbol[]) => {
        for (const s of syms) {
          const line =
            (s.selectionRange ?? s.range ?? s.location?.range)?.start.line ?? 0;
          out.push({ name: s.name, kind: SYMBOL_KIND[s.kind] ?? "variable", line: line + 1 });
          if (s.children?.length) walk(s.children);
        }
      };
      walk(res);
      out.sort((a, b) => a.line - b.line);
      return out;
    })
    .catch(() => null);
}

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

// Angular has no extension of its own — it shares .ts/.html with TypeScript and
// HTML. Detect an Angular project (angular.json present) once per root so we can
// route those files to the Angular server instead.
const angularCache = new Map<string, Promise<boolean>>();
function isAngularProject(root: string): Promise<boolean> {
  let p = angularCache.get(root);
  if (!p) {
    p = resolvePath(root, "angular.json")
      .then((r) => r !== null)
      .catch(() => false);
    angularCache.set(root, p);
  }
  return p;
}

/**
 * The LSP editor extension for `path` in `root`, or null when no server is
 * configured/installed for the file's language.
 */
export async function lspSupport(root: string, path: string): Promise<Extension | null> {
  const ext = extOf(path);
  let server = serverFor(path);
  // In an Angular project, .ts/.html go to the Angular language server.
  if (
    (ext === "ts" || ext === "html" || ext === "htm") &&
    useExtensions.getState().isEnabled("angular") &&
    (await isAngularProject(root))
  ) {
    server = { id: "angular", exts: server?.exts ?? [ext] };
  }
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

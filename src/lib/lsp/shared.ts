/**
 * What every LSP module reads: the live connections, the refresh hooks a server
 * can trigger, URI conversion and the wire types. Kept in one leaf module so the
 * mutable state has a single owner and the feature modules never import each
 * other through `connection`.
 */
import { type LSPClient, LSPPlugin } from "@codemirror/lsp-client"
import type { EditorView } from "@codemirror/view"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { createLogger } from "@/lib/logger"

export const log = createLogger("lsp")

/** A file:// URI for an absolute path (spaces and the like encoded). Handles
 *  Windows paths (`C:\…`): backslashes are normalized and the drive gets a
 *  leading slash (`file:///C:/…`), with the drive-letter colon left intact. */
export const toUri = (absPath: string) => {
  const p = absPath.replace(/\\/g, "/")
  const withSlash = p.startsWith("/") ? p : `/${p}`
  const enc = withSlash
    .split("/")
    .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join("/")
  return `file://${enc}`
}

/** The absolute path back out of a file:// URI (undoes `toUri`). */
export const fromUri = (uri: string) => {
  const p = decodeURIComponent(uri.replace(/^file:\/\//, ""))
  // "/C:/…" → "C:/…" on Windows; leave a POSIX "/…" path untouched.
  return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p
}

/**
 * The plugin for this view, once its server has answered `initialize`.
 *
 * "Is the server ready?" is the invariant behind ⌘-click, diagnostics and
 * rename, so it is asked in one place. `initializing` is the library's own
 * answer to the question; deriving it from `serverCapabilities` at each call
 * site meant three copies of the rule and a busy-wait where the promise would
 * have done — one that gave up after ten seconds and never tried again.
 */
export async function readyPlugin(view: EditorView): Promise<LSPPlugin | null> {
  const plugin = LSPPlugin.get(view)
  if (!plugin) return null
  // `initializing` is the library's own handshake promise; a stand-in client
  // (or one built before it existed) may not have it, and a missing handshake
  // is simply "not ready".
  if (plugin.client.serverCapabilities == null) {
    await Promise.resolve(plugin.client.initializing).catch(() => null)
  }
  return plugin.client.serverCapabilities == null ? null : plugin
}

/** A message off the wire, parsed once by the transport and handed to whichever
 *  of the taps below wants it. */
export interface ServerMessage {
  id?: number | string
  method?: string
  params?: unknown
}

export interface LspPos {
  line: number
  character: number
}
export interface LspDiag {
  range: { start: LspPos; end: LspPos }
  severity?: number
  message: string
}

/**
 * Every open editor that pulls diagnostics, so a server saying "ask me again"
 * reaches all of them.
 *
 * Same shape as `lensRefreshers`, and for the same reason: a pull-mode server
 * answers the first request before it has finished validating, and the only
 * thing that would ask a second time is the user typing. `workspace/diagnostic/
 * refresh` *is* the second ask — ignoring it meant a JSON file opened and
 * stayed clean-looking no matter how broken it was, while the server sat on the
 * answer.
 */
export const diagRefreshers = new Set<() => void>()

/** The server capabilities these features read. */
export interface ServerCaps {
  foldingRangeProvider?: boolean | object
  documentLinkProvider?: { resolveProvider?: boolean }
  linkedEditingRangeProvider?: boolean | object
  codeLensProvider?: { resolveProvider?: boolean }
  executeCommandProvider?: { commands?: string[] }
  semanticTokensProvider?: {
    legend?: { tokenTypes?: string[]; tokenModifiers?: string[] }
    full?: boolean | { delta?: boolean }
    range?: boolean
  }
}

/** Live lens views, so a server's "ask me again" reaches the open documents. A
 *  set rather than a store: nothing outside this module needs it, and each view
 *  adds and removes itself. */
export const lensRefreshers = new Set<() => void>()

/** An LSP `Location`: where a symbol is, and what a "3 references" code lens
 *  carries in its command's arguments. Only `start` is ever read. */
export interface LspLocation {
  uri: string
  range: { start: LspPos }
}

/** An LSP `TextEdit` — a replacement over a line/character range. */
export interface LspTextEdit {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  newText: string
}

export interface Conn {
  client: LSPClient
  /** The project root this server was started for, so a file change can be
   *  matched to the servers that care about it. */
  root: string
  unlisten: Promise<UnlistenFn>
  exitUnlisten: Promise<UnlistenFn>
}
export const conns = new Map<string, Promise<Conn>>()

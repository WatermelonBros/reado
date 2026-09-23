/**
 * Reado's side of the in-page capture bridge (`window.__readoBridge`).
 *
 * The page talks back through one drain buffer, polled by the preview pane; each
 * key in a drained message is one thing the page asks of Reado, handled by the
 * table below. The calls the other way — Reado drawing in the page — are the
 * `callBridge` wrappers (scripts built by `bridgeScript`), so the eval strings
 * live in one place.
 */
import {
  type Comment,
  type CommentKind,
  type CommentPatch,
  type CommentType,
  previewEval,
  type WebTarget,
} from "./api"
import { type BridgeMethods, bridgeScript } from "./bridgeScript"
import { useComments } from "./comments"
import { type LogEntry, type NetEntry, usePreview } from "./preview"
import { useSettings } from "./store"
import type { VaultPick } from "./vault"

/** Call `method` on the page's bridge, in the preview pane. */
export const callBridge = <M extends keyof BridgeMethods>(
  method: M,
  ...args: BridgeMethods[M]
): Promise<string> => previewEval(bridgeScript(method, ...args))

/** One drained message from the page. */
export interface BridgeDrain {
  logs?: LogEntry[]
  net?: NetEntry[]
  inspect?: number[]
  commentAt?: {
    x: number
    y: number
    url: string
    text: string
    target: WebTarget | null
  } | null
  openComment?: string | null
  commentReply?: { id: string; text: string } | null
  commentResolve?: string | null
  commentType?: { id: string; type: CommentType } | null
  commentKind?: { id: string; kind: CommentKind } | null
  commentEdit?: { id: string; text: string } | null
  hasMarks?: boolean
  vaultPick?: VaultPick | null
  href?: string
}

/** What a handler reaches back into the pane for. */
export interface BridgeCtx {
  /** Take the page's own URL as the truth. */
  trackHref: (href: string) => void
}

/** Inject the rich comment card into the page over the live webview (author, type,
 *  messages, reply, resolve). Reado formats the labels; the in-page bridge renders
 *  them and reports reply/resolve back through its drain buffer. */
export function injectCommentBox(c: Comment): void {
  const box = {
    id: c.id,
    x: c.anchor.x ?? 0,
    y: c.anchor.y ?? 0,
    target: c.anchor.target ?? null,
    type: c.type,
    kind: c.kind,
    resolved: c.state === "done",
    messages: c.messages.map((m) => ({
      who: m.agent ?? m.author,
      when: new Date(m.createdAt).toLocaleString(),
      body: m.body,
    })),
  }
  void callBridge("showComment", box).catch(() => {})
}

type Handlers = {
  [K in keyof BridgeDrain]?: (value: NonNullable<BridgeDrain[K]>, ctx: BridgeCtx) => void
}

/** One handler per message key, run in this order for each truthy key. */
const HANDLERS: Handlers = {
  // Follow the page. A link, a redirect, or a router pushing a new route
  // all move the page without telling Reado — the address bar showed
  // whatever was last typed into it, which made Back, Reload and the
  // address itself lie about where you were.
  href: (href, ctx) => ctx.trackHref(href),
  // A pick in the in-page credential chip. The strip acts on it — it is
  // what holds the vault connection and knows how to fill.
  vaultPick: (pick) => usePreview.getState().setVaultPick(pick),
  // Right-click "inspect" from the page → open the inspector on that node.
  inspect: (path) => {
    const s2 = usePreview.getState()
    s2.setInspectRequest(path)
    if (!s2.inspector) s2.toggleInspector()
  },
  // The in-page "Comment here" composer was saved → create the design comment.
  // Route through the store so the list updates synchronously (dots draw,
  // an immediate open finds it) and firstComment can drive the gitignore prompt.
  commentAt: (c) => {
    if (!c.text) return
    void useComments
      .getState()
      .create({
        file: "",
        scope: "web",
        startLine: 0,
        endLine: 0,
        type: "note",
        kind: "note",
        body: c.text,
        context: { snippet: "", before: "", after: "" },
        url: c.url,
        x: c.x,
        y: c.y,
        target: c.target ?? undefined,
      })
      .then(({ firstComment }) => {
        if (firstComment && !useSettings.getState().gitignoreDontAsk)
          useComments.getState().setGitignorePrompt(true)
      })
      .catch(() => {})
  },
  // A page dot was clicked → show its comment card over the live page.
  openComment: (id) => {
    const c = useComments.getState().comments.find((x) => x.id === id)
    if (c) injectCommentBox(c)
  },
  // Reply typed in the in-page card → post it, then re-render the card.
  commentReply: ({ id, text }) => {
    void useComments
      .getState()
      .reply(id, text)
      .then(() => {
        const c = useComments.getState().comments.find((x) => x.id === id)
        if (c) injectCommentBox(c)
      })
      .catch(() => {})
  },
  // Resolve clicked in the card → mark done and dismiss the card.
  commentResolve: (id) => {
    void useComments
      .getState()
      .setState(id, "done")
      .catch(() => {})
    void callBridge("closeComment").catch(() => {})
  },
}

/** Act on one drained message: every handler whose key it carries, in order,
 *  then the card edits it carries, coalesced per comment. */
export function dispatchBridge(data: BridgeDrain, ctx: BridgeCtx): void {
  for (const key of Object.keys(HANDLERS) as (keyof Handlers)[]) {
    const value = data[key]
    // biome-ignore lint/suspicious/noExplicitAny: each handler takes its own key's value
    if (value) (HANDLERS[key] as (v: any, c: BridgeCtx) => void)(value, ctx)
  }
  // Type / kind / edit changed in the card → patch it, then re-render.
  // Coalesce fields destined for the same comment into a single patch:
  // separate read-modify-write calls (backend rewrites the whole comment)
  // would race and drop a field (last write wins).
  const patchAndReopen = (id: string, p: CommentPatch) =>
    void useComments
      .getState()
      .patch(id, p)
      .then(() => {
        const c = useComments.getState().comments.find((x) => x.id === id)
        if (c) injectCommentBox(c)
      })
      .catch(() => {})
  const patches = new Map<string, CommentPatch>()
  if (data.commentType)
    patches.set(data.commentType.id, {
      ...patches.get(data.commentType.id),
      type: data.commentType.type,
    })
  if (data.commentKind)
    patches.set(data.commentKind.id, {
      ...patches.get(data.commentKind.id),
      kind: data.commentKind.kind,
    })
  if (data.commentEdit)
    patches.set(data.commentEdit.id, {
      ...patches.get(data.commentEdit.id),
      body: data.commentEdit.text,
    })
  for (const [id, p] of patches) patchAndReopen(id, p)
}

/**
 * Reado's side of the in-page capture bridge (`window.__readoBridge`).
 *
 * The page talks back through one drain buffer, polled by the preview pane; each
 * key in a drained message is one thing the page asks of Reado, handled by the
 * table below. The calls the other way — Reado drawing in the page — are the
 * `callBridge` wrappers (scripts built by `bridgeScript`), so the eval strings
 * live in one place.
 */

import { COMMENT_TYPES, TYPE_COLOR, typeKey } from "@/components/atoms/commentMeta"
import { t } from "@/i18n"
import { type CommentKind, type CommentType, previewEval, type WebTarget } from "./api"
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
    type?: CommentType
    kind?: CommentKind
  } | null
  openComment?: string | null
  hasMarks?: boolean
  vaultPick?: VaultPick | null
  href?: string
}

/** What a handler reaches back into the pane for. */
export interface BridgeCtx {
  /** Take the page's own URL as the truth. */
  trackHref: (href: string) => void
}

/** Reado's look for the comment composer drawn in the page, which has none of its
 *  CSS: the theme's colours, resolved, and the labels in the user's language. */
export function pageUi() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    c: {
      canvas: v("--bg"),
      surface: v("--bg-elevated"),
      overlay: v("--bg-overlay"),
      line: v("--border"),
      strong: v("--border-strong"),
      ink: v("--text"),
      muted: v("--text-muted"),
      faint: v("--text-faint"),
      accent: v("--accent"),
      onAccent: v("--accent-contrast"),
      selection: v("--selection"),
      font: getComputedStyle(document.body).fontFamily,
      types: Object.fromEntries(COMMENT_TYPES.map((tp) => [tp, v(TYPE_COLOR[tp].slice(4, -1))])),
    },
    t: {
      placeholder: t("comment.bodyPlaceholder"),
      save: t("comment.save"),
      cancel: t("common.cancel"),
      task: t("comment.task"),
      types: Object.fromEntries(COMMENT_TYPES.map((tp) => [tp, t(typeKey(tp))])),
    },
  }
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
        type: c.type ?? "note",
        kind: c.kind ?? "note",
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
  // A page dot was clicked → open its thread beside the page, the editor's own
  // (the same one a code comment opens, with everything the thread header holds).
  openComment: (id) => useComments.getState().setActive(id),
}

/** Act on one drained message: every handler whose key it carries, in order. */
export function dispatchBridge(data: BridgeDrain, ctx: BridgeCtx): void {
  for (const key of Object.keys(HANDLERS) as (keyof Handlers)[]) {
    const value = data[key]
    // biome-ignore lint/suspicious/noExplicitAny: each handler takes its own key's value
    if (value) (HANDLERS[key] as (v: any, c: BridgeCtx) => void)(value, ctx)
  }
}

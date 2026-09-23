/**
 * The in-app browser preview pane.
 *
 * Reado's chrome (URL bar, reload, close) is normal DOM; the *page* is a native
 * preview webview (Tauri multiwebview) parked over the placeholder body below.
 * We measure the placeholder and keep the webview aligned to it — on open, and
 * on every resize — via the `preview_*` commands. Closing removes the webview.
 *
 * ponytail: the placeholder rect is reported in CSS px relative to the window
 * content area, which matches the webview's coordinate space. If a platform
 * offsets it (e.g. an overlay title bar), tune with a per-platform constant here
 * rather than reworking the model.
 */

import { openUrl } from "@tauri-apps/plugin-opener"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import {
  BrowserIcon,
  ChevronIcon,
  CloseIcon,
  CodeIcon,
  DetachIcon,
  DevicesIcon,
  FetchIcon,
  KeyIcon,
  MessageIcon,
  MinusIcon,
  PlusIcon,
  RobotIcon,
} from "@/components/atoms/icons"
import { AccessRequest, VaultBar } from "@/components/molecules/VaultBar"
import {
  hostResolves,
  previewDetach,
  previewEval,
  previewNavigate,
  previewSetVisible,
} from "@/lib/api"
import { DRAIN_JS } from "@/lib/bridgeScript"
import { useComments } from "@/lib/comments"
import { useLayout } from "@/lib/layout"
import { watchOverlays } from "@/lib/overlays"
import { trackPointer } from "@/lib/pointerDrag"
import { isLoopbackHost, usePreview } from "@/lib/preview"
import { type BridgeDrain, callBridge, dispatchBridge, injectCommentBox } from "@/lib/previewBridge"
import { usePalette, useProject, useSettings, useWorkspace } from "@/lib/store"
import { HAS_LOGIN_JS } from "@/lib/vault"
import { BrowserInspector } from "./BrowserInspector"
import { useDevServerProbe } from "./browser/useDevServerProbe"
import { usePreviewAgentCommands, usePreviewAgentMirror } from "./browser/usePreviewAgent"
import { usePreviewBounds } from "./browser/usePreviewBounds"

/** Two URLs point at the same document (ignoring query/hash) — for matching a
 *  page's design comments to the URL currently shown in the preview. */
function sameDoc(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.origin === ub.origin && ua.pathname === ub.pathname
  } catch {
    return a === b
  }
}

/** Where a non-URL address-bar entry goes. */
const SEARCH = "https://duckduckgo.com/?q="

/** Turn whatever was typed into a navigable URL: a bare host gets a scheme (http
 *  when it looks local — loopback, a dev TLD, or an explicit port — https otherwise,
 *  since plain http to a public host is blocked by the platform), and anything that
 *  isn't host-shaped is a web search, like every other browser's address bar. */
export function normalizeUrl(s: string, hostKnown = false): string {
  const v = s.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v
  const host = v.split(/[/?#]/)[0]
  const name = host.replace(/:\d+$/, "")
  if (
    !/^[a-z0-9.-]+(:\d+)?$/i.test(host) ||
    !(name.includes(".") || isLoopbackHost(name) || hostKnown)
  )
    return `${SEARCH}${encodeURIComponent(v)}`
  const local =
    isLoopbackHost(name) || hostKnown || /\.(local|test|localdomain)$/i.test(name) || host !== name
  return `${local ? "http" : "https"}://${v}`
}

/**
 * The bare name in what was typed, when that is all it is — `myapp`, or
 * `myapp/path`, but not `myapp.com`, `myapp:3000` or a search phrase.
 *
 * This is the one case the address bar cannot decide on its own: a single label
 * is both a plausible search term and exactly what an `/etc/hosts` alias looks
 * like, so it is the only case worth a round trip to the resolver.
 */
export function singleLabelHost(s: string): string | null {
  const v = s.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return null
  const host = v.split(/[/?#]/)[0]
  // The port comes off first: `myapp:3000` is the same question as `myapp` — and
  // asking is what keeps `time:30` a search instead of a navigation.
  const name = host.replace(/:\d+$/, "")
  if (!/^[a-z0-9-]+$/i.test(name) || isLoopbackHost(name)) return null
  return name
}

export function BrowserPanel({ docked = false }: { docked?: boolean } = {}) {
  const url = usePreview((s) => s.url)
  const setUrl = usePreview((s) => s.setUrl)
  const close = usePreview((s) => s.close)
  const inspector = usePreview((s) => s.inspector)
  const toggleInspector = usePreview((s) => s.toggleInspector)
  const agentAccess = usePreview((s) => s.agentAccess)
  const setAgentAccess = usePreview((s) => s.setAgentAccess)
  const inspectorPos = usePreview((s) => s.inspectorPos)
  const inspectorSize = usePreview((s) => s.inspectorSize)
  const setInspectorSize = usePreview((s) => s.setInspectorSize)
  const inspectorDetached = usePreview((s) => s.inspectorDetached)
  const appendLogs = usePreview((s) => s.appendLogs)
  const setNet = usePreview((s) => s.setNet)
  const device = usePreview((s) => s.device)
  const setDevice = usePreview((s) => s.setDevice)
  const paneWidth = usePreview((s) => s.paneWidth)
  const setPaneWidth = usePreview((s) => s.setPaneWidth)
  const browserZoom = usePreview((s) => s.browserZoom)
  const setBrowserZoom = usePreview((s) => s.setBrowserZoom)
  const root = useProject((s) => s.root)
  const pinRequest = usePreview((s) => s.pinRequest)
  const setPinRequest = usePreview((s) => s.setPinRequest)
  // Design-comment dots are injected from the drain tick (it reads the store
  // fresh), so no reactive selector is needed here — just the toggle state.
  const [showMarks, setShowMarks] = useState(true)
  // The credential strip. Opened from the toolbar, and by the page itself when it
  // puts up a login form — a password manager hidden behind an icon nobody found
  // is one nobody used.
  const [vaultOpen, setVaultOpen] = useState(false)
  // The page the user closed the strip on, so dismissing it sticks until they
  // navigate somewhere else.
  const vaultDismissed = useRef("")
  const accessRequest = usePreview((s) => s.accessRequest)
  // Reado's overlays (palette, settings, graph/docs) render in the DOM, which a
  // native child window would cover — hide the preview while any is open. A dock
  // drag counts too: hide the preview so the drop targets (DOM) stay visible.
  // Read each store into its own unconditional hook call, then OR the booleans —
  // ORing the hooks directly would short-circuit and skip later hook calls (a
  // Rules-of-Hooks violation) the moment an earlier overlay opens.
  const paletteOverlay = usePalette(
    (s) => s.mode !== null || s.settingsOpen || s.shortcutsOpen || s.anywhereOpen,
  )
  const workspaceOverlay = useWorkspace((s) => s.graphOpen || s.docsOpen)
  const layoutOverlay = useLayout((s) => s.dragging !== null || s.menuOpen)
  // And every *floating* layer — menu, popover, select, dialog, tooltip, the
  // right-click menu — without any of them having to say so: `watchOverlays`
  // reads it off the DOM (see `lib/overlays.ts`), so a new one cannot forget to
  // register and open behind the page.
  const [covered, setCovered] = useState(false)
  const overlayOpen = paletteOverlay || workspaceOverlay || layoutOverlay || covered
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const mirrorAgentState = usePreviewAgentMirror(root)
  const runAgentCommand = usePreviewAgentCommands(root, bodyRef)
  const lastNetSig = useRef("")
  // The last comment-marker set applied to the page, so the drain tick re-injects
  // only when it changes (or when the page reloaded and dropped the layer).
  const lastMarksSig = useRef("")
  const showMarksRef = useRef(true)
  // The user took control of the URL bar → stop auto-switching to detected servers.
  const manualUrl = useRef(false)
  // The URL input is focused (being edited) → don't auto-switch, or the key={url}
  // remount would discard the user's in-progress typing.
  const urlFocused = useRef(false)
  // Whether the current URL responded last check → reload on a dead→live transition.
  const wasLive = useRef(false)
  // The page answered the last drain, i.e. it is loaded and running. A loaded
  // page is the authority on where the pane is; the liveness check must not
  // second-guess it.
  const pageAlive = useRef(false)
  showMarksRef.current = showMarks

  // The single drain of the page's capture bridge: pull console/network, feed the
  // store (→ inspector + send-to-agent), and mirror to `.reado/` for the MCP.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      // No child window right now — the pane is hidden behind another dock tab,
      // its area is collapsed, or it never opened (a dead dev server still opens
      // one, so this is genuinely "not there"). Every eval would fail with
      // "no preview pane running", once per tick, forever. The ResizeObserver
      // below flips this back and reopens the window when the pane returns.
      if (!openedRef.current) return
      let raw: string | null = null
      try {
        raw = await previewEval(DRAIN_JS)
      } catch (e) {
        pageAlive.current = false
        // The webview vanished while the pane is open (a close/reopen race). The URL
        // is still valid, so recreate it rather than making the user hit Enter.
        if (String(e).includes("no preview")) openAt(usePreview.getState().url)
      }
      try {
        if (!alive) return
        const data = raw ? (JSON.parse(raw) as BridgeDrain | null) : null
        // The bridge answering *is* the page being loaded and running — an empty
        // reply is a page that hasn't got there yet.
        pageAlive.current = data != null
        if (data) {
          dispatchBridge(data, { trackHref })
          // Keep the comment dots on the page: re-inject when the set changes, or
          // when the page reloaded and dropped the layer (data.hasMarks == false).
          const webList = useComments
            .getState()
            .comments.filter(
              (c) =>
                c.anchor.scope === "web" &&
                c.state !== "done" &&
                c.anchor.url &&
                sameDoc(c.anchor.url, usePreview.getState().url),
            )
            .map((c) => ({
              id: c.id,
              x: c.anchor.x ?? 0,
              y: c.anchor.y ?? 0,
              target: c.anchor.target ?? null,
            }))
          const marksSig = `${showMarksRef.current}|${webList
            .map((m) => `${m.id}:${m.x}:${m.y}:${m.target?.path.join(".") ?? ""}`)
            .join(",")}`
          if (marksSig !== lastMarksSig.current || !data.hasMarks) {
            lastMarksSig.current = marksSig
            void callBridge("marks", webList, showMarksRef.current).catch(() => {})
          }
          const logs = data.logs ?? []
          const net = data.net ?? []
          if (logs.length) appendLogs(logs)
          // Only push network when it actually changed, so the detail panel isn't
          // re-rendered (and headers don't "refresh") every poll.
          const sig =
            net.length +
            "|" +
            net
              .map((n) => `${n.id}:${n.status ?? ""}:${n.resBody?.length ?? 0}:${n.frames ?? 0}`)
              .join(",")
          if (sig !== lastNetSig.current) {
            setNet(net)
            lastNetSig.current = sig
          }
        }
      } catch {
        /* page not ready — retry next tick */
      }
      // Mirror to `.reado/` for the MCP, then run the agent's pending command —
      // both only while agent access is on.
      mirrorAgentState()
      await runAgentCommand()
    }
    const id = window.setInterval(tick, 700)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [root, appendLogs, setNet])

  const { openAt, openedRef } = usePreviewBounds(bodyRef)

  // Offer the credential strip when the page shows a login form, the way a
  // browser extension does. The page is loading while this runs, so it looks a
  // few times rather than once and gives up.
  useEffect(() => {
    let alive = true
    let tries = 0
    let timer = 0
    const look = async () => {
      if (!alive || tries++ > 5) return
      try {
        // `openedRef` first: with no child window there is no page to sniff, and
        // the eval would just be another "no preview pane running" in the log.
        if (openedRef.current && (await previewEval(HAS_LOGIN_JS)) === "true") {
          if (alive && vaultDismissed.current !== url) setVaultOpen(true)
          return
        }
      } catch {
        /* page not ready — look again */
      }
      timer = window.setTimeout(look, 900)
    }
    timer = window.setTimeout(look, 700)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [url])

  // Drag the inspector's edge to resize it (height when docked bottom, width right).
  const startInspectorResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const pos = usePreview.getState().inspectorPos
    const start = pos === "right" ? e.clientX : e.clientY
    const startSize = usePreview.getState().inspectorSize
    const z = useSettings.getState().zoom || 1
    const onMove = (ev: PointerEvent) => {
      const cur = pos === "right" ? ev.clientX : ev.clientY
      setInspectorSize(startSize + (start - cur) / z)
    }
    trackPointer(onMove)
  }

  // Watch for anything Reado floats over the pane's own rectangle. Only over
  // *that* rectangle: a tooltip on a sidebar icon is already above the page, and
  // blanking the pane for it would be a flicker for nothing.
  useEffect(() => watchOverlays(() => bodyRef.current, setCovered), [])

  // Hide the preview only while a Reado DOM overlay is open (a native window can't
  // sit under the DOM). Design comments never hide it — dots, the composer, and
  // the comment card are all injected *into* the page over the live webview.
  useEffect(() => {
    void previewSetVisible(!overlayOpen)
  }, [overlayOpen])

  // A comment was clicked in the list → navigate there and open its card.
  useEffect(() => {
    if (!pinRequest) return
    const { url, id } = pinRequest
    let cancelled = false
    void (async () => {
      usePreview.getState().openPane(url)
      try {
        await previewNavigate(url)
        usePreview.getState().setUrl(url)
      } catch {
        /* navigation blocked/failed — still try to open the card on the current page */
      }
      // ponytail: fixed settle delay before the page (and its bridge) are ready.
      await new Promise((r) => setTimeout(r, 900))
      if (cancelled) return
      const c = useComments.getState().comments.find((x) => x.id === id)
      if (c) injectCommentBox(c)
      // Clear the request only after the injection finishes. Clearing it
      // synchronously here would re-run this effect (dep changed to null) and its
      // cleanup would set cancelled=true before the 900ms settle, so the card was
      // never injected. A fresh list click sets a new {url,id} object → re-fires.
      setPinRequest(null)
    })()
    return () => {
      cancelled = true
    }
  }, [pinRequest, setPinRequest])

  const fitZoom = () => {
    const el = bodyRef.current
    const dev = usePreview.getState().device
    if (!el || !dev) return
    const r = el.getBoundingClientRect()
    setBrowserZoom(Math.min(r.width / dev.w, r.height / dev.h))
  }

  // Drag the left edge to resize the pane. The pointer moves in on-screen px but
  // the width lives in the zoom layer's layout px, so divide the delta by zoom.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = usePreview.getState().paneWidth
    const z = useSettings.getState().zoom || 1
    const onMove = (ev: PointerEvent) => {
      const dw = (startX - ev.clientX) / z
      setPaneWidth(Math.min(startW + dw, window.innerWidth / z - 200))
    }
    trackPointer(onMove)
  }

  const setDim = (which: "w" | "h", val: number) => {
    const cur = usePreview.getState().device
    setDevice({
      w: which === "w" ? val : (cur?.w ?? 390),
      h: which === "h" ? val : (cur?.h ?? 844),
      label: t("preview.device.custom"),
    })
  }

  useDevServerProbe(root, { openAt, pageAlive, wasLive, manualUrl, urlFocused })

  /** Take the page's own URL as the truth, unless the user is mid-edit in the
   *  address bar — retyping under their cursor is worse than a stale address. */
  const trackHref = (href: string) => {
    if (urlFocused.current) return
    const s = usePreview.getState()
    if (s.url === href) return
    // A page that navigates on its own is as much "where the user is" as one
    // they typed: stop auto-switching to a detected dev server behind their back.
    manualUrl.current = true
    s.setUrl(href)
    try {
      s.addAllowedOrigin(new URL(href).origin)
    } catch {
      /* not a parseable origin — nothing to allow */
    }
  }

  const go = async (next: string) => {
    // A single label could be a hosts alias or a search. Ask the machine, which
    // is the only thing that can tell — bounded, so a search stays instant.
    const bare = singleLabelHost(next)
    const known = bare ? await hostResolves(bare).catch(() => false) : false
    const u = normalizeUrl(next, known)
    manualUrl.current = true // the user chose this URL — stop auto-switching
    wasLive.current = false // let a dead→live reload fire for the new URL
    setUrl(u)
    // Typing an address is the consent gesture: the agent may follow the user to
    // that origin (a `/etc/hosts` alias for a local server can't be sniffed).
    try {
      usePreview.getState().addAllowedOrigin(new URL(u).origin)
    } catch {
      /* not a parseable origin — nothing to allow */
    }
    openAt(u)
  }

  const DEVICES = [
    { label: t("preview.device.responsive"), w: 0, h: 0 },
    { label: t("preview.device.mobile"), w: 390, h: 844 },
    { label: t("preview.device.tablet"), w: 834, h: 1112 },
    { label: t("preview.device.laptop"), w: 1280, h: 800 },
  ]

  return (
    <div
      className={
        docked
          ? "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          : "relative flex min-w-0 flex-none flex-col overflow-hidden border-l border-l-line"
      }
      style={docked ? undefined : { width: paneWidth }}
    >
      {/* Drag handle straddling the left border (self-sized mode only; docked, the
          dock owns the splitters). */}
      {!docked && (
        <div
          onPointerDown={startResize}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
        />
      )}
      <header className="flex h-9 flex-none items-center gap-1.5 border-b border-line px-1.5">
        <IconButton
          size="sm"
          label={t("preview.back")}
          icon={<ChevronIcon className="h-3.5 w-3.5 rotate-180" />}
          onClick={() => void previewEval("history.back()").catch(() => {})}
        />
        <IconButton
          size="sm"
          label={t("preview.forward")}
          icon={<ChevronIcon className="h-3.5 w-3.5" />}
          onClick={() => void previewEval("history.forward()").catch(() => {})}
        />
        <IconButton
          size="sm"
          label={t("preview.reload")}
          icon={<FetchIcon className="h-3.5 w-3.5" />}
          onClick={() => void previewEval("location.reload()").catch(() => {})}
        />
        <input
          key={url}
          defaultValue={url}
          onFocus={() => {
            urlFocused.current = true
          }}
          onBlur={() => {
            urlFocused.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go((e.target as HTMLInputElement).value)
          }}
          spellCheck={false}
          aria-label={t("preview.url")}
          className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
        />
        <IconButton
          size="sm"
          label={t("vault.fill")}
          active={vaultOpen}
          icon={<KeyIcon className="h-3.5 w-3.5" />}
          onClick={() => setVaultOpen((v) => !v)}
        />
        <IconButton
          size="sm"
          label={t("preview.agentAccess")}
          active={agentAccess}
          icon={<RobotIcon className="h-3.5 w-3.5" />}
          onClick={() => setAgentAccess(!agentAccess)}
        />
        <IconButton
          size="sm"
          label={t(showMarks ? "browserComment.hideMarks" : "browserComment.showMarks")}
          active={showMarks}
          icon={<MessageIcon className="h-3.5 w-3.5" />}
          onClick={() => setShowMarks((v) => !v)}
        />
        <IconButton
          size="sm"
          label={t("inspector.toggle")}
          active={inspector}
          icon={<CodeIcon className="h-3.5 w-3.5" />}
          onClick={toggleInspector}
        />
        <IconButton
          size="sm"
          label={t("preview.external")}
          icon={<BrowserIcon className="h-3.5 w-3.5" />}
          onClick={() => void openUrl(url)}
        />
        <IconButton
          size="sm"
          label={t("preview.detach")}
          icon={<DetachIcon className="h-3.5 w-3.5" />}
          onClick={() => {
            void previewDetach(url)
            close()
          }}
        />
        <IconButton
          size="sm"
          label={t("preview.close")}
          icon={<CloseIcon className="h-3.5 w-3.5" />}
          onClick={close}
        />
      </header>
      {vaultOpen && (
        <VaultBar
          url={url}
          evalInPage={previewEval}
          onClose={() => {
            vaultDismissed.current = url
            setVaultOpen(false)
          }}
        />
      )}
      {accessRequest && <AccessRequest url={accessRequest} />}
      {/* Device-size bar: emulate a viewport, or fill the pane (Responsive). */}
      <div className="flex h-8 flex-none items-center gap-1 border-b border-line px-2 text-xs">
        <DevicesIcon className="h-3.5 w-3.5 flex-none text-faint" />
        {DEVICES.map((d) => {
          const active = d.w === 0 ? device === null : device?.label === d.label
          return (
            <button
              key={d.label}
              type="button"
              onClick={() => setDevice(d.w === 0 ? null : { w: d.w, h: d.h, label: d.label })}
              className={`rounded-md px-2 py-0.5 ${active ? "bg-surface text-ink" : "text-faint hover:text-ink"}`}
            >
              {d.label}
            </button>
          )
        })}
        <span className="mx-1 text-faint">·</span>
        <input
          type="number"
          value={device?.w ?? ""}
          placeholder="W"
          onChange={(e) => e.target.value && setDim("w", Number(e.target.value))}
          className="w-14 rounded border border-line bg-surface px-1 py-0.5 text-center tabular-nums text-ink outline-none focus:border-accent"
        />
        <span className="text-faint">×</span>
        <input
          type="number"
          value={device?.h ?? ""}
          placeholder="H"
          onChange={(e) => e.target.value && setDim("h", Number(e.target.value))}
          className="w-14 rounded border border-line bg-surface px-1 py-0.5 text-center tabular-nums text-ink outline-none focus:border-accent"
        />
        <span className="mx-1 text-faint">·</span>
        <IconButton
          size="xs"
          label={t("preview.zoomOut")}
          icon={<MinusIcon className="h-3 w-3" />}
          onClick={() => setBrowserZoom(browserZoom - 0.1)}
        />
        <input
          type="number"
          value={Math.round(browserZoom * 100)}
          onChange={(e) => e.target.value && setBrowserZoom(Number(e.target.value) / 100)}
          aria-label="Zoom %"
          className="w-12 rounded border border-line bg-surface px-1 py-0.5 text-center tabular-nums text-ink outline-none focus:border-accent"
        />
        <span className="text-faint">%</span>
        <IconButton
          size="xs"
          label={t("preview.zoomIn")}
          icon={<PlusIcon className="h-3 w-3" />}
          onClick={() => setBrowserZoom(browserZoom + 0.1)}
        />
        {device && (
          <Button size="sm" onClick={fitZoom}>
            {t("preview.fit")}
          </Button>
        )}
      </div>
      {/* The native preview webview is parked over the placeholder; the inspector
          docks below (or to the right), and the placeholder shrinks → the webview
          follows via the ResizeObserver above. */}
      <div className={`flex min-h-0 flex-1 ${inspectorPos === "right" ? "flex-row" : "flex-col"}`}>
        <div
          ref={bodyRef}
          className={`min-h-0 min-w-0 flex-1 ${device ? "bg-surface" : "bg-canvas"}`}
        />
        {inspector && !inspectorDetached && (
          <>
            <div
              onPointerDown={startInspectorResize}
              className={`flex-none border-line bg-surface hover:bg-accent ${inspectorPos === "right" ? "w-1 cursor-col-resize border-l" : "h-1 cursor-row-resize border-t"}`}
            />
            <div
              className="flex-none overflow-hidden"
              style={
                inspectorPos === "right" ? { width: inspectorSize } : { height: inspectorSize }
              }
            >
              <BrowserInspector />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * In-app browser preview — UI state.
 *
 * Holds only the pane's open/URL state; the actual native preview webview is
 * created/parked/closed by `BrowserPanel`, which measures its placeholder and
 * calls the `preview_*` commands. Kept tiny on purpose.
 */
import { useEffect } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { VaultPick } from "./vault"

/** A sensible default dev-server URL; the user edits it in the pane's URL bar. */
const DEFAULT_URL = "http://localhost:5173"
const MAX = 500

/** Hostnames that are the local machine by definition: loopback literals and the
 *  reserved `localhost` names (RFC 6761 — `*.localhost` always resolves to loopback).
 *  A custom `/etc/hosts` alias pointing at 127.0.0.1 isn't detectable from here — the
 *  user's own navigation allowlists it (see `go` in BrowserPanel). */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    h === "0.0.0.0" ||
    /^127(\.\d{1,3}){3}$/.test(h)
  )
}

/** Agent navigation is confined to this: loopback (any port) is always allowed,
 *  plus any origins the user added. Human navigation isn't restricted. */
export function isOriginAllowed(url: string, extra: string[]): boolean {
  try {
    const u = new URL(url)
    if (isLoopbackHost(u.hostname)) return true
    return extra.some((o) => {
      try {
        return new URL(o).origin === u.origin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "result"
export interface LogEntry {
  level: LogLevel
  args: unknown[]
  source?: string
  stack?: string
  t: number
}
export interface NetEntry {
  id: number
  method: string
  url: string
  status?: number
  ok?: boolean
  ms?: number
  error?: string
  frames?: number
  reqHeaders?: Record<string, string>
  reqBody?: string
  resHeaders?: Record<string, string>
  resBody?: string
  t: number
}

interface PreviewState {
  open: boolean
  url: string
  /** Console/Network inspector docked at the bottom of the pane. */
  inspector: boolean
  /** Where the inspector docks, and its size (height if bottom, width if right). */
  inspectorPos: "bottom" | "right"
  inspectorSize: number
  /** Detached: the inspector is a standalone dockable panel (in the layout) instead
   *  of nested inside the browser pane. */
  inspectorDetached: boolean
  /** A right-click "inspect" from the page: child-index path to reveal in Elements. */
  inspectRequest: number[] | null
  /** A design comment to reveal: navigate to `url`, then open its card at (x,y). */
  pinRequest: { url: string; x: number; y: number; id: string } | null
  /** Mirror captured console/network to `.reado/` and run the agent's commands, so
   *  the terminal agent can see and drive the preview. On by default; the toggle
   *  lets the user cut it off. */
  agentAccess: boolean
  /** Extra origins the agent may navigate to (localhost is always allowed). */
  allowlist: string[]
  /** Values Reado filled into the page from the vault, kept only to redact them
   *  from everything that crosses to the agent. Never persisted; dropped the
   *  moment the pane navigates or closes. */
  secrets: string[]
  /** The page URL the user granted the agent access to while a credential is in
   *  it. One page, this run only — never persisted. */
  grantedUrl: string | null
  /** A refused agent command waiting on the user: the page it asked about. The
   *  agent already got its refusal; this only drives Reado's own prompt. */
  accessRequest: string | null
  /** The last pick from the in-page credential chip, waiting to be acted on. The
   *  chip lives in the page (the pane is a native window), so a click there
   *  reaches Reado through the capture bridge and lands here. */
  vaultPick: VaultPick | null
  /** Chosen viewport size to emulate, or null for "fit the pane" (responsive). */
  device: { w: number; h: number; label: string } | null
  /** Docked pane width in px (layout space); the editor takes the rest. */
  paneWidth: number
  /** Preview page zoom — scale the rendered page (e.g. fit a 4K viewport). */
  browserZoom: number
  /** Captured console + network, drained from the page bridge by BrowserPanel and
   *  shared by every consumer (inspector, persisted MCP file, send-to-agent). */
  logs: LogEntry[]
  net: NetEntry[]
  /** Open the pane (optionally at a URL); reuses the last URL otherwise. */
  openPane: (url?: string) => void
  /** Record a navigation (the webview itself is driven by BrowserPanel). */
  setUrl: (url: string) => void
  toggleInspector: () => void
  setInspectorPos: (p: "bottom" | "right") => void
  setInspectorSize: (n: number) => void
  setInspectorDetached: (d: boolean) => void
  setInspectRequest: (p: number[] | null) => void
  setPinRequest: (p: { url: string; x: number; y: number; id: string } | null) => void
  setAgentAccess: (on: boolean) => void
  addAllowedOrigin: (origin: string) => void
  addSecret: (value: string) => void
  grantPage: (url: string | null) => void
  setVaultPick: (pick: VaultPick | null) => void
  setAccessRequest: (url: string | null) => void
  setDevice: (d: { w: number; h: number; label: string } | null) => void
  setPaneWidth: (w: number) => void
  setBrowserZoom: (z: number) => void
  pushLog: (e: LogEntry) => void
  appendLogs: (logs: LogEntry[]) => void
  setNet: (net: NetEntry[]) => void
  clearCaptured: () => void
  close: () => void
}

export const usePreview = create<PreviewState>()(
  persist(
    (set) => ({
      open: false,
      url: DEFAULT_URL,
      inspector: false,
      inspectorPos: "bottom",
      inspectorSize: 240,
      inspectorDetached: false,
      inspectRequest: null,
      pinRequest: null,
      agentAccess: true,
      allowlist: [],
      secrets: [],
      grantedUrl: null,
      accessRequest: null,
      vaultPick: null,
      device: null,
      paneWidth: 640,
      browserZoom: 1,
      logs: [],
      net: [],
      openPane: (url) => set((s) => ({ open: true, url: url ?? s.url })),
      // A new URL is a new page: the credentials Reado filled are gone from it, and
      // so is any access the user granted for it.
      setUrl: (url) =>
        set((s) =>
          s.url === url
            ? { url }
            : { url, secrets: [], grantedUrl: null, accessRequest: null, vaultPick: null },
        ),
      toggleInspector: () => set((s) => ({ inspector: !s.inspector })),
      setInspectorPos: (p) => set({ inspectorPos: p }),
      setInspectorSize: (n) => set({ inspectorSize: Math.max(120, n) }),
      setInspectorDetached: (inspectorDetached) => set({ inspectorDetached }),
      setInspectRequest: (p) => set({ inspectRequest: p }),
      setPinRequest: (p) => set({ pinRequest: p }),
      setAgentAccess: (on) => set({ agentAccess: on }),
      addAllowedOrigin: (origin) =>
        set((s) => (s.allowlist.includes(origin) ? s : { allowlist: [...s.allowlist, origin] })),
      addSecret: (value) =>
        set((s) => (s.secrets.includes(value) ? s : { secrets: [...s.secrets, value] })),
      grantPage: (grantedUrl) => set({ grantedUrl, accessRequest: null }),
      setVaultPick: (vaultPick) => set({ vaultPick }),
      setAccessRequest: (accessRequest) => set({ accessRequest }),
      setDevice: (device) => set({ device }),
      setPaneWidth: (w) => set({ paneWidth: Math.max(320, w) }),
      setBrowserZoom: (z) => set({ browserZoom: Math.min(3, Math.max(0.1, z)) }),
      pushLog: (e) => set((s) => ({ logs: [...s.logs, e].slice(-MAX) })),
      appendLogs: (logs) => set((s) => ({ logs: [...s.logs, ...logs].slice(-MAX) })),
      // Network is the latest snapshot; the poller only calls this when it actually
      // changed, so the detail panel doesn't churn every tick.
      setNet: (net) => set({ net: net.slice(-MAX) }),
      clearCaptured: () => set({ logs: [], net: [] }),
      close: () =>
        set({
          open: false,
          logs: [],
          net: [],
          secrets: [],
          grantedUrl: null,
          accessRequest: null,
          vaultPick: null,
        }),
    }),
    // Persist the URL and the agent opt-in across restarts.
    {
      name: "reado.preview",
      partialize: (s) => ({
        url: s.url,
        agentAccess: s.agentAccess,
        allowlist: s.allowlist,
        paneWidth: s.paneWidth,
        inspectorPos: s.inspectorPos,
        inspectorSize: s.inspectorSize,
        inspectorDetached: s.inspectorDetached,
      }),
    },
  ),
)

/** Open DOM dialog count (Modal/Drawer). The preview is a native child webview and
 *  paints above *all* DOM, so BrowserPanel hides it while any dialog is up. Counted
 *  here rather than allowlisted per-store, so a new dialog can't forget to hide it. */
export const useDialogs = create<{ count: number }>()(() => ({ count: 0 }))

/** Register an open dialog for as long as `open` is true. */
export function useDialogOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return
    useDialogs.setState((s) => ({ count: s.count + 1 }))
    return () => useDialogs.setState((s) => ({ count: Math.max(0, s.count - 1) }))
  }, [open])
}

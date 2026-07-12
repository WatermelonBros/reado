/**
 * In-app browser preview — UI state.
 *
 * Holds only the pane's open/URL state; the actual native preview webview is
 * created/parked/closed by `BrowserPanel`, which measures its placeholder and
 * calls the `preview_*` commands. Kept tiny on purpose.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A sensible default dev-server URL; the user edits it in the pane's URL bar. */
const DEFAULT_URL = "http://localhost:5173";
const MAX = 500;

/** Agent navigation is confined to this: localhost/127.0.0.1 (any port) is always
 *  allowed, plus any origins the user added. Human navigation isn't restricted. */
export function isOriginAllowed(url: string, extra: string[]): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return extra.some((o) => {
      try {
        return new URL(o).origin === u.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "result";
export interface LogEntry { level: LogLevel; args: unknown[]; source?: string; stack?: string; t: number }
export interface NetEntry {
  id: number;
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  ms?: number;
  error?: string;
  frames?: number;
  reqHeaders?: Record<string, string>;
  reqBody?: string;
  resHeaders?: Record<string, string>;
  resBody?: string;
  t: number;
}

interface PreviewState {
  open: boolean;
  url: string;
  /** Console/Network inspector docked at the bottom of the pane. */
  inspector: boolean;
  /** Where the inspector docks, and its size (height if bottom, width if right). */
  inspectorPos: "bottom" | "right";
  inspectorSize: number;
  /** A right-click "inspect" from the page: child-index path to reveal in Elements. */
  inspectRequest: number[] | null;
  /** Mirror captured console/network to `.reado/` and run the agent's commands, so
   *  the terminal agent can see and drive the preview. On by default; the toggle
   *  lets the user cut it off. */
  agentAccess: boolean;
  /** Extra origins the agent may navigate to (localhost is always allowed). */
  allowlist: string[];
  /** Chosen viewport size to emulate, or null for "fit the pane" (responsive). */
  device: { w: number; h: number; label: string } | null;
  /** Docked pane width in px (layout space); the editor takes the rest. */
  paneWidth: number;
  /** Preview page zoom — scale the rendered page (e.g. fit a 4K viewport). */
  browserZoom: number;
  /** Captured console + network, drained from the page bridge by BrowserPanel and
   *  shared by every consumer (inspector, persisted MCP file, send-to-agent). */
  logs: LogEntry[];
  net: NetEntry[];
  /** Open the pane (optionally at a URL); reuses the last URL otherwise. */
  openPane: (url?: string) => void;
  /** Record a navigation (the webview itself is driven by BrowserPanel). */
  setUrl: (url: string) => void;
  toggleInspector: () => void;
  setInspectorPos: (p: "bottom" | "right") => void;
  setInspectorSize: (n: number) => void;
  setInspectRequest: (p: number[] | null) => void;
  setAgentAccess: (on: boolean) => void;
  addAllowedOrigin: (origin: string) => void;
  setDevice: (d: { w: number; h: number; label: string } | null) => void;
  setPaneWidth: (w: number) => void;
  setBrowserZoom: (z: number) => void;
  pushLog: (e: LogEntry) => void;
  appendLogs: (logs: LogEntry[]) => void;
  setNet: (net: NetEntry[]) => void;
  clearCaptured: () => void;
  close: () => void;
}

export const usePreview = create<PreviewState>()(
  persist(
    (set) => ({
      open: false,
      url: DEFAULT_URL,
      inspector: false,
      inspectorPos: "bottom",
      inspectorSize: 240,
      inspectRequest: null,
      agentAccess: true,
      allowlist: [],
      device: null,
      paneWidth: 640,
      browserZoom: 1,
      logs: [],
      net: [],
      openPane: (url) => set((s) => ({ open: true, url: url ?? s.url })),
      setUrl: (url) => set({ url }),
      toggleInspector: () => set((s) => ({ inspector: !s.inspector })),
      setInspectorPos: (p) => set({ inspectorPos: p }),
      setInspectorSize: (n) => set({ inspectorSize: Math.max(120, n) }),
      setInspectRequest: (p) => set({ inspectRequest: p }),
      setAgentAccess: (on) => set({ agentAccess: on }),
      addAllowedOrigin: (origin) =>
        set((s) => (s.allowlist.includes(origin) ? s : { allowlist: [...s.allowlist, origin] })),
      setDevice: (device) => set({ device }),
      setPaneWidth: (w) => set({ paneWidth: Math.max(320, w) }),
      setBrowserZoom: (z) => set({ browserZoom: Math.min(3, Math.max(0.1, z)) }),
      pushLog: (e) => set((s) => ({ logs: [...s.logs, e].slice(-MAX) })),
      appendLogs: (logs) => set((s) => ({ logs: [...s.logs, ...logs].slice(-MAX) })),
      // Network is the latest snapshot; the poller only calls this when it actually
      // changed, so the detail panel doesn't churn every tick.
      setNet: (net) => set({ net: net.slice(-MAX) }),
      clearCaptured: () => set({ logs: [], net: [] }),
      close: () => set({ open: false, logs: [], net: [] }),
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
      }),
    },
  ),
);

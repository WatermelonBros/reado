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
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePreview, isOriginAllowed, type LogEntry, type NetEntry } from "../../lib/preview";
import { useProject, useSettings, usePalette, useWorkspace } from "../../lib/store";
import { useLayout } from "../../lib/layout";
import {
  previewOpen,
  previewSetBounds,
  previewNavigate,
  previewClose,
  previewBack,
  previewForward,
  previewReload,
  previewEval,
  previewSetZoom,
  previewSetVisible,
  previewDetectUrls,
  previewPersistState,
  previewClearState,
  previewTakeCmd,
  previewPutResult,
  previewDetach,
  previewCaptureFrame,
  createComment,
} from "../../lib/api";
import { useComments } from "../../lib/comments";
import { IconButton } from "../atoms/IconButton";
import { FetchIcon, CloseIcon, ChevronIcon, CodeIcon, DetachIcon, DevicesIcon, RobotIcon, MessageIcon } from "../atoms/icons";
import { BrowserInspector } from "./BrowserInspector";

/** Two URLs point at the same document (ignoring query/hash) — for matching a
 *  page's design comments to the URL currently shown in the preview. */
function sameDoc(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    return a === b;
  }
}

/** Add a scheme if the user typed a bare host, so `previewNavigate` gets a URL. */
function normalizeUrl(s: string): string {
  const v = s.trim();
  return /^[a-z]+:\/\//i.test(v) ? v : `http://${v}`;
}

export function BrowserPanel({ docked = false }: { docked?: boolean } = {}) {
  const url = usePreview((s) => s.url);
  const setUrl = usePreview((s) => s.setUrl);
  const close = usePreview((s) => s.close);
  const inspector = usePreview((s) => s.inspector);
  const toggleInspector = usePreview((s) => s.toggleInspector);
  const agentAccess = usePreview((s) => s.agentAccess);
  const setAgentAccess = usePreview((s) => s.setAgentAccess);
  const inspectorPos = usePreview((s) => s.inspectorPos);
  const inspectorSize = usePreview((s) => s.inspectorSize);
  const setInspectorSize = usePreview((s) => s.setInspectorSize);
  const inspectorDetached = usePreview((s) => s.inspectorDetached);
  const appendLogs = usePreview((s) => s.appendLogs);
  const setNet = usePreview((s) => s.setNet);
  const device = usePreview((s) => s.device);
  const setDevice = usePreview((s) => s.setDevice);
  const paneWidth = usePreview((s) => s.paneWidth);
  const setPaneWidth = usePreview((s) => s.setPaneWidth);
  const browserZoom = usePreview((s) => s.browserZoom);
  const setBrowserZoom = usePreview((s) => s.setBrowserZoom);
  const zoom = useSettings((s) => s.zoom) || 1;
  const root = useProject((s) => s.root);
  const pinRequest = usePreview((s) => s.pinRequest);
  const setPinRequest = usePreview((s) => s.setPinRequest);
  // Design comments live in the normal store; we draw a dot per comment on the
  // page it belongs to. `showMarks` toggles the whole layer.
  const comments = useComments((s) => s.comments);
  const [showMarks, setShowMarks] = useState(true);
  // Reado's overlays (palette, settings, dialogs, graph/docs) render in the DOM,
  // which a native child window would cover — hide the preview while any is open.
  // A dock drag or open dock menu counts too: hide the preview so drop targets and
  // the menu (both DOM) stay visible above the native window.
  const overlayOpen =
    usePalette((s) => s.mode !== null || s.settingsOpen || s.shortcutsOpen || s.anywhereOpen) ||
    useWorkspace((s) => s.graphOpen || s.docsOpen) ||
    useLayout((s) => s.dragging !== null || s.menuOpen);
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const lastCmdId = useRef("");
  const lastNetSig = useRef("");
  // Last console+network snapshot mirrored to `.reado/`, so we write only on change.
  const lastPersisted = useRef("");
  const lastBounds = useRef({ x: 0, y: 0, w: 0, h: 0, z: 1 });
  // The user took control of the URL bar → stop auto-switching to detected servers.
  const manualUrl = useRef(false);
  // Whether the current URL responded last check → reload on a dead→live transition.
  const wasLive = useRef(false);

  // The single drain of the page's capture bridge: pull console/network, feed the
  // store (→ inspector + send-to-agent), and mirror to `.reado/` for the MCP.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const raw = await previewEval("window.__readoBridge ? window.__readoBridge.drain() : null");
        if (!alive) return;
        const data = raw
          ? (JSON.parse(raw) as {
              logs?: LogEntry[];
              net?: NetEntry[];
              inspect?: number[];
              commentAt?: { x: number; y: number; url: string; text: string } | null;
              openComment?: string | null;
            } | null)
          : null;
        if (data) {
          // Right-click "inspect" from the page → open the inspector on that node.
          if (data.inspect) {
            const s2 = usePreview.getState();
            s2.setInspectRequest(data.inspect);
            if (!s2.inspector) s2.toggleInspector();
          }
          // The in-page "Comment here" composer was saved → create the design comment.
          if (data.commentAt?.text) {
            const c = data.commentAt;
            void createComment(root, {
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
            }).catch(() => {});
          }
          // A page dot was clicked → open its thread in the real Comments panel.
          if (data.openComment) {
            useWorkspace.getState().selectTool("comments");
            useComments.getState().setActive(data.openComment);
          }
          const logs = data.logs ?? [];
          const net = data.net ?? [];
          if (logs.length) appendLogs(logs);
          // Only push network when it actually changed, so the detail panel isn't
          // re-rendered (and headers don't "refresh") every poll.
          const sig =
            net.length +
            "|" +
            net.map((n) => `${n.id}:${n.status ?? ""}:${n.resBody?.length ?? 0}:${n.frames ?? 0}`).join(",");
          if (sig !== lastNetSig.current) {
            setNet(net);
            lastNetSig.current = sig;
          }
        }
      } catch {
        /* page not ready — retry next tick */
      }
      // Mirror to `.reado/` for the MCP whenever access is on. The files' presence
      // means "preview is live", so write the initial empty state too — but only
      // when the snapshot actually changed, not on every idle tick.
      const s = usePreview.getState();
      if (root && s.agentAccess) {
        const logsJson = JSON.stringify(s.logs);
        const netJson = JSON.stringify(s.net);
        const snap = `${logsJson}${netJson}`;
        if (snap !== lastPersisted.current) {
          lastPersisted.current = snap;
          void previewPersistState(root, logsJson, netJson);
        }
      }

      // Execute the agent's pending control command (opt-in only). eval covers
      // dom/animation/click/type (the CLI ships the JS); navigate is allowlisted.
      if (root && s.agentAccess) {
        try {
          const raw = await previewTakeCmd(root);
          const cmd = raw ? (JSON.parse(raw) as { id?: string; op?: string; arg?: string }) : null;
          if (cmd?.id && cmd.id !== lastCmdId.current) {
            lastCmdId.current = cmd.id;
            let ok = true;
            let result = "";
            try {
              if (cmd.op === "eval") {
                result = await previewEval(cmd.arg ?? "");
              } else if (cmd.op === "navigate") {
                // Resolve a relative path (e.g. "/roadmap") against the current URL.
                let url = cmd.arg ?? "";
                try {
                  url = new URL(url, usePreview.getState().url).href;
                } catch {
                  /* keep as-is; the allowlist check will reject a bad URL */
                }
                if (!isOriginAllowed(url, s.allowlist)) {
                  ok = false;
                  result = "origin not allowed";
                } else {
                  await previewNavigate(url);
                  s.setUrl(url);
                  result = url;
                }
              } else if (cmd.op === "frame") {
                const r = bodyRef.current?.getBoundingClientRect();
                if (r) result = await previewCaptureFrame(r.left, r.top, r.width, r.height);
                else {
                  ok = false;
                  result = "no preview region";
                }
              } else {
                ok = false;
                result = `unknown op: ${cmd.op}`;
              }
            } catch (e) {
              ok = false;
              result = String(e);
            }
            await previewPutResult(root, JSON.stringify({ id: cmd.id, ok, result }));
          }
        } catch {
          /* no pending command */
        }
      }
    };
    const id = window.setInterval(tick, 700);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [root, appendLogs, setNet]);

  // The pane rect for the child window: centred at the chosen device size (scaled
  // by the page zoom), or filling the pane in responsive mode.
  const computeBounds = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const dev = usePreview.getState().device;
    const bz = usePreview.getState().browserZoom;
    let x = r.left;
    let w = r.width;
    let h = r.height;
    if (dev) {
      w = Math.min(dev.w * bz, r.width);
      h = Math.min(dev.h * bz, r.height);
      x = r.left + (r.width - w) / 2;
    }
    return { x, y: r.top, w, h, z: bz };
  }, []);

  // Reposition the (already-open) child window; keep zoom in sync.
  const syncBounds = useCallback(() => {
    const b = computeBounds();
    if (!b) return;
    void previewSetBounds(b.x, b.y, b.w, b.h);
    if (Math.abs(lastBounds.current.z - b.z) > 0.001) void previewSetZoom(b.z);
    lastBounds.current = b;
  }, [computeBounds]);

  // Open/navigate the child window at `url` (create-or-navigate — self-heals if the
  // window went away). Used on first open, URL changes, and dead→live reloads.
  const openAt = useCallback(
    (url: string) => {
      const b = computeBounds();
      if (!b) return;
      openedRef.current = true;
      void previewOpen(url, b.x, b.y, b.w, b.h);
      if (Math.abs(lastBounds.current.z - b.z) > 0.001) void previewSetZoom(b.z);
      lastBounds.current = b;
    },
    [computeBounds],
  );

  useEffect(() => {
    openAt(usePreview.getState().url);
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncBounds);
    ro.observe(el);
    return () => {
      ro.disconnect();
      openedRef.current = false;
      void previewClose();
      // Drop the MCP mirror so the agent's tools report "no preview" once closed.
      const r = useProject.getState().root;
      if (r) void previewClearState(r);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncBounds, openAt]);

  // Re-park when the device, pane width, or interface zoom changes. Zoom matters:
  // it's a CSS transform, so the ResizeObserver doesn't fire — but the pane's
  // on-screen rect (what the child window needs) does move.
  useEffect(() => {
    syncBounds();
  }, [device, paneWidth, zoom, browserZoom, inspectorSize, inspectorPos, syncBounds]);

  // Drag the inspector's edge to resize it (height when docked bottom, width right).
  const startInspectorResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const pos = usePreview.getState().inspectorPos;
    const start = pos === "right" ? e.clientX : e.clientY;
    const startSize = usePreview.getState().inspectorSize;
    const z = useSettings.getState().zoom || 1;
    const onMove = (ev: PointerEvent) => {
      const cur = pos === "right" ? ev.clientX : ev.clientY;
      setInspectorSize(startSize + (start - cur) / z);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Hide the preview while a Reado overlay is open (a native window can't sit
  // under the DOM), and show it again when they close. Design comments no longer
  // hide it — the composer and dots are injected *into* the page.
  useEffect(() => {
    void previewSetVisible(!overlayOpen);
  }, [overlayOpen]);

  // Draw a dot per design comment belonging to the current page (and toggle the
  // whole layer). Re-runs on navigation (url) and when comments change; the bridge
  // is re-injected on load, so a short settle delay lets the page lay out first.
  useEffect(() => {
    const list = comments
      .filter((c) => c.anchor.scope === "web" && c.anchor.url && sameDoc(c.anchor.url, url))
      .map((c) => ({ id: c.id, x: c.anchor.x ?? 0, y: c.anchor.y ?? 0, text: c.messages[0]?.body ?? "" }));
    const js = `window.__readoBridge&&window.__readoBridge.marks(${JSON.stringify(list)},${showMarks})`;
    const t = setTimeout(() => void previewEval(js).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [comments, url, showMarks]);

  // A comment was clicked in the list → navigate there and drop the marker.
  useEffect(() => {
    if (!pinRequest) return;
    const { url, x, y, text } = pinRequest;
    let cancelled = false;
    void (async () => {
      usePreview.getState().openPane(url);
      try {
        await previewNavigate(url);
        usePreview.getState().setUrl(url);
      } catch {
        /* navigation blocked/failed — still try to pin the current page */
      }
      // ponytail: fixed settle delay before injecting the marker; a load-event
      // handshake would be tighter if pages routinely outrun it.
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;
      await previewEval(
        `window.__readoBridge&&window.__readoBridge.pin(${x},${y},${JSON.stringify(text)})`,
      ).catch(() => {});
    })();
    setPinRequest(null);
    return () => {
      cancelled = true;
    };
  }, [pinRequest, setPinRequest]);

  // The preview is a child window in screen coordinates, so it must follow the
  // host window when it moves or resizes.
  useEffect(() => {
    const win = getCurrentWindow();
    const uns: Array<() => void> = [];
    void win.onMoved(() => syncBounds()).then((u) => uns.push(u));
    void win.onResized(() => syncBounds()).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, [syncBounds]);

  const fitZoom = () => {
    const el = bodyRef.current;
    const dev = usePreview.getState().device;
    if (!el || !dev) return;
    const r = el.getBoundingClientRect();
    setBrowserZoom(Math.min(r.width / dev.w, r.height / dev.h));
  };

  // Drag the left edge to resize the pane. The pointer moves in on-screen px but
  // the width lives in the zoom layer's layout px, so divide the delta by zoom.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = usePreview.getState().paneWidth;
    const z = useSettings.getState().zoom || 1;
    const onMove = (ev: PointerEvent) => {
      const dw = (startX - ev.clientX) / z;
      setPaneWidth(Math.min(startW + dw, window.innerWidth / z - 200));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const setDim = (which: "w" | "h", val: number) => {
    const cur = usePreview.getState().device;
    setDevice({
      w: which === "w" ? val : (cur?.w ?? 390),
      h: which === "h" ? val : (cur?.h ?? 844),
      label: t("preview.device.custom"),
    });
  };

  // Sniff the common dev-server ports and switch to the running one if the current
  // URL is dead. Re-checked every 2s so a dev server started *after* opening the
  // pane gets picked up automatically. A live current URL (incl. a manual one) is
  // probed too, so it's never overridden.
  useEffect(() => {
    let alive = true;
    const origin = (u: string) => {
      try {
        return new URL(u).origin;
      } catch {
        return "";
      }
    };
    const check = async () => {
      if (!alive) return;
      const curUrl = usePreview.getState().url;
      let live: string[] = [];
      try {
        live = await previewDetectUrls(root, curUrl);
      } catch {
        return;
      }
      const curLive = live.some((u) => origin(u) === origin(curUrl));
      if (curLive) {
        // The current URL responds: if it just came alive (server started after we
        // opened), reload it so a page loaded while dead now shows.
        if (!wasLive.current) openAt(curUrl);
        wasLive.current = true;
      } else {
        wasLive.current = false;
        // Auto-pick a detected server only while the user hasn't taken the wheel.
        if (!manualUrl.current && live.length) {
          usePreview.getState().setUrl(live[0]);
          openAt(live[0]);
        }
      }
    };
    void check();
    const id = window.setInterval(check, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, openAt]);

  const go = (next: string) => {
    const u = normalizeUrl(next);
    manualUrl.current = true; // the user chose this URL — stop auto-switching
    wasLive.current = false; // let a dead→live reload fire for the new URL
    setUrl(u);
    openAt(u);
  };

  const DEVICES = [
    { label: t("preview.device.responsive"), w: 0, h: 0 },
    { label: t("preview.device.mobile"), w: 390, h: 844 },
    { label: t("preview.device.tablet"), w: 834, h: 1112 },
    { label: t("preview.device.laptop"), w: 1280, h: 800 },
  ];

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
          onClick={() => void previewBack()}
        />
        <IconButton
          size="sm"
          label={t("preview.forward")}
          icon={<ChevronIcon className="h-3.5 w-3.5" />}
          onClick={() => void previewForward()}
        />
        <IconButton
          size="sm"
          label={t("preview.reload")}
          icon={<FetchIcon className="h-3.5 w-3.5" />}
          onClick={() => void previewReload()}
        />
        <input
          key={url}
          defaultValue={url}
          onKeyDown={(e) => {
            if (e.key === "Enter") go((e.target as HTMLInputElement).value);
          }}
          spellCheck={false}
          aria-label={t("preview.url")}
          className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
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
          label={t("preview.detach")}
          icon={<DetachIcon className="h-3.5 w-3.5" />}
          onClick={() => {
            void previewDetach(url);
            close();
          }}
        />
        <IconButton
          size="sm"
          label={t("preview.close")}
          icon={<CloseIcon className="h-3.5 w-3.5" />}
          onClick={close}
        />
      </header>
      {/* Device-size bar: emulate a viewport, or fill the pane (Responsive). */}
      <div className="flex h-8 flex-none items-center gap-1 border-b border-line px-2 text-xs">
        <DevicesIcon className="h-3.5 w-3.5 flex-none text-faint" />
        {DEVICES.map((d) => {
          const active = d.w === 0 ? device === null : device?.label === d.label;
          return (
            <button
              key={d.label}
              type="button"
              onClick={() => setDevice(d.w === 0 ? null : { w: d.w, h: d.h, label: d.label })}
              className={`rounded-md px-2 py-0.5 ${active ? "bg-surface text-ink" : "text-faint hover:text-ink"}`}
            >
              {d.label}
            </button>
          );
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
        <button
          type="button"
          onClick={() => setBrowserZoom(browserZoom - 0.1)}
          className="grid h-5 w-5 place-items-center rounded text-faint hover:bg-surface hover:text-ink"
          aria-label={t("preview.zoomOut")}
        >
          −
        </button>
        <input
          type="number"
          value={Math.round(browserZoom * 100)}
          onChange={(e) => e.target.value && setBrowserZoom(Number(e.target.value) / 100)}
          aria-label="Zoom %"
          className="w-12 rounded border border-line bg-surface px-1 py-0.5 text-center tabular-nums text-ink outline-none focus:border-accent"
        />
        <span className="text-faint">%</span>
        <button
          type="button"
          onClick={() => setBrowserZoom(browserZoom + 0.1)}
          className="grid h-5 w-5 place-items-center rounded text-faint hover:bg-surface hover:text-ink"
          aria-label={t("preview.zoomIn")}
        >
          +
        </button>
        {device && (
          <button
            type="button"
            onClick={fitZoom}
            className="rounded-md px-2 py-0.5 text-faint hover:text-ink"
          >
            {t("preview.fit")}
          </button>
        )}
      </div>
      {/* The native preview webview is parked over the placeholder; the inspector
          docks below (or to the right), and the placeholder shrinks → the webview
          follows via the ResizeObserver above. */}
      <div className={`flex min-h-0 flex-1 ${inspectorPos === "right" ? "flex-row" : "flex-col"}`}>
        <div ref={bodyRef} className={`min-h-0 min-w-0 flex-1 ${device ? "bg-surface" : "bg-canvas"}`} />
        {inspector && !inspectorDetached && (
          <>
            <div
              onPointerDown={startInspectorResize}
              className={`flex-none border-line bg-surface hover:bg-accent ${inspectorPos === "right" ? "w-1 cursor-col-resize border-l" : "h-1 cursor-row-resize border-t"}`}
            />
            <div
              className="flex-none overflow-hidden"
              style={inspectorPos === "right" ? { width: inspectorSize } : { height: inspectorSize }}
            >
              <BrowserInspector />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

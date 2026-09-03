/**
 * The project workspace: sidebar file tree, editor tabs, reading surface,
 * status bar, and the overlays (palette + settings). Loads git state and
 * restores the prior session on mount; persists the session as tabs change.
 */

import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { ContextMenu } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon, CollapseAllIcon, EyeIcon, EyeOffIcon, SwapIcon } from "@/components/atoms/icons"
import { Breadcrumb } from "@/components/molecules/Breadcrumb"
import { GitignorePrompt } from "@/components/molecules/GitignorePrompt"
import { StatusBar } from "@/components/molecules/StatusBar"
import { ActivityBar } from "@/components/organisms/ActivityBar"
import { DockRegion } from "@/components/organisms/DockRegion"
import { DocsView } from "@/components/organisms/DocsView"
import { Editor } from "@/components/organisms/Editor"
import { KnowledgeGraph } from "@/components/organisms/KnowledgeGraph"
import { Tabs } from "@/components/organisms/Tabs"
import { TOOL_TITLE, ToolPanelBody } from "@/components/organisms/ToolPanelBody"
import { TourBar } from "@/components/organisms/ToursPanel"
import { t as translate } from "@/i18n"
import { dispatchToAgent } from "@/lib/agents"
import {
  anywhereClearProject,
  anywhereSetProject,
  gitInfo,
  listFiles,
  type Objective,
  previewClose,
  ptyWrite,
  readFile,
  reanchorFile,
  rebuildIndex,
  semanticRebuild,
  semanticReindexFile,
  startWatching,
} from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { toRelative, useComments } from "@/lib/comments"
import { useGuidedReview } from "@/lib/guidedReview"
import { type DockArea, findPanel, useLayout } from "@/lib/layout"
import { createLogger, safeError } from "@/lib/logger"
import { ensureMcp } from "@/lib/mcp"
import { notifyError } from "@/lib/notice"
import { notifyResolved } from "@/lib/notify"
import { usePreReview } from "@/lib/preReview"
import { usePreview } from "@/lib/preview"
import { loadProjectConfig, watchProjectConfig } from "@/lib/projectConfig"
import { useQa } from "@/lib/qa"
import { useReadProgress, wasSelfWrite } from "@/lib/readProgress"
import { useReasoning } from "@/lib/reasoning"
import { useResolveLoop } from "@/lib/resolveLoop"
import { composeReviewPrompt } from "@/lib/review"
import { useSpecs } from "@/lib/specs"
import { type Tool, useProject, useSessions, useSettings, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { useTours } from "@/lib/tours"
import { clearOpenFile, currentOpenFile, setWindowTitle } from "@/lib/window"

const log = createLogger("project")

const basename = (p: string) =>
  p
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() ?? p

// Keep at least this much room for the editor when applying the sidebar width,
// so a width persisted on a large monitor can't squeeze the editor to nothing
// on a smaller window.
const MIN_EDITOR_WIDTH = 360

export function ProjectView({ root }: { root: string }) {
  const init = useProject((s) => s.init)
  const setGit = useProject((s) => s.setGit)
  const tabs = useProject((s) => s.tabs)
  const active = useProject((s) => s.active)
  const expandedDirs = useProject((s) => s.expandedDirs)
  const splitPath = useProject((s) => s.splitPath)
  const treeNonce = useProject((s) => s.treeNonce)
  const saveSession = useSessions((s) => s.save)
  const { t } = useTranslation()

  // True once the saved session has been restored. We must not persist the
  // (empty) initial state before then, or it would clobber the saved session.
  const restored = useRef(false)

  // Restore the saved session synchronously on mount, then load git info
  // separately. Doing the restore synchronously (rather than after the async
  // git call) keeps tab order deterministic and race-free.
  useEffect(() => {
    // Restore the saved session only when the setting allows; otherwise start
    // clean. The stored session is left on disk (not deleted).
    const session = useSettings.getState().restoreSession
      ? useSessions.getState().byRoot[root]
      : undefined
    init(
      root,
      {
        isRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
        changedFiles: 0,
      },
      session,
    )
    restored.current = true
    // Opened from an OS file association: open the requested file, then drop the
    // hash param so a reload doesn't re-open it.
    const openFile = currentOpenFile()
    if (openFile?.startsWith(root)) {
      useProject.getState().open(openFile)
      clearOpenFile()
    }
    setWindowTitle(basename(root))
    useComments.getState().load(root)
    useReadProgress.getState().load(root)
    useBookmarks.getState().load(root)
    useQa.getState().load(root)
    useTours.getState().load(root)
    usePreReview.getState().load(root)
    useGuidedReview.getState().load(root)
    void useResolveLoop.getState().load(root)
    listFiles(root)
      .then((f) => setTotalFiles(f.length))
      .catch(() => setTotalFiles(0))
    // Build the SQLite index on open if missing/stale (rebuildable cache).
    rebuildIndex(root).catch((e) => log.warn("index rebuild failed", { error: safeError(e) }))
    // And the semantic one, so "where do we…?" answers from the first keystroke
    // rather than waiting on an agent.
    semanticRebuild(root).catch((e) =>
      log.warn("semantic index rebuild failed", { error: safeError(e) }),
    )
    gitInfo(root)
      .then(setGit)
      .catch((e) => log.warn("git info failed", { error: safeError(e) }))
  }, [root, init, setGit])

  // Reload the specs list when files change on disk (mirrors the file tree), so
  // adding/removing an OpenSpec change or capability shows up without a reopen —
  // and the Specs tool appears the moment the first spec lands.
  useEffect(() => {
    void useSpecs.getState().load(root)
  }, [root, treeNonce])

  // Re-list the tree/search when the exclude globs change (skip the initial run;
  // the tree already lists on mount).
  const excludeGlobs = useSettings((s) => s.excludeGlobs)
  const firstGlobs = useRef(true)
  useEffect(() => {
    if (firstGlobs.current) {
      firstGlobs.current = false
      return
    }
    useProject.getState().bumpTree()
  }, [excludeGlobs])

  // Reado Anywhere: expose this window's project to paired phones, and act on
  // their requests (run the agent / pre-review) when they target this project.
  useEffect(() => {
    if (!root) return
    const id = getCurrentWindow().label
    anywhereSetProject(id, root, basename(root)).catch(() => {})
    const subs = [
      listen<string>("anywhere://run-agent", (e) => {
        if (e.payload !== root) return
        const tasks = useComments
          .getState()
          .comments.filter((c) => c.kind === "task" && c.state === "open")
        void dispatchToAgent(composeReviewPrompt(tasks.length))
      }),
      listen<string>("anywhere://prereview", (e) => {
        if (e.payload === root) usePreReview.getState().generate(root)
      }),
      // Keystrokes from a paired phone, typed into the agent terminal here. The
      // desktop owns the PTY, so it does the write — one writer, no interleaving.
      listen<string>("anywhere://agent-input", (e) => {
        const term = useTerminals.getState()
        const target =
          term.activeId && term.agentTerminals.includes(term.activeId)
            ? term.activeId
            : term.agentTerminals[0]
        if (target) void ptyWrite(target, e.payload).catch(() => {})
      }),
      // A paired phone triggered a guided-review agent action — run it here (the
      // agent lives on this desktop). Disposals the phone does hit disk directly.
      listen<{
        root: string
        id: string
        file: string
        action: string
        objective: string | null
      }>("anywhere://review-action", (e) => {
        const a = e.payload
        if (a.root !== root) return
        const g = useGuidedReview.getState()
        switch (a.action) {
          case "start":
            void g.start(root, { kind: "diff" }, (a.objective as Objective) ?? "bug_risk")
            break
          case "file":
            void g.reviewFile(root, a.id, a.file)
            break
          case "respond":
            void g.respond(root, a.id, a.file)
            break
          case "challenge":
            void g.challenge(root, a.id, a.file)
            break
          case "send":
            void g.sendTasks(root, a.id)
            break
        }
      }),
    ]
    return () => {
      anywhereClearProject(id).catch(() => {})
      // The unlisten can reject (Tauri's listener map may already be torn down
      // on a fast remount / StrictMode double-effect) — swallow it so it doesn't
      // surface as an unhandled rejection.
      subs.forEach((p) => void p.then((un) => un()).catch(() => {}))
    }
  }, [root])

  // Persist the session whenever the open tabs, active file, tree drill-down, or
  // split pane change, so reopening the project restores all of it.
  useEffect(() => {
    if (!restored.current) return
    saveSession(root, { tabs, active, expanded: expandedDirs, split: splitPath })
  }, [root, tabs, active, expandedDirs, splitPath, saveSession])

  // Apply per-project settings overrides, then persist changes back to them.
  useEffect(() => {
    loadProjectConfig(root)
    return watchProjectConfig(root)
  }, [root])

  // Watch the project and re-anchor a file's comments when it changes on disk
  // (external edits, or the agent's own writes).
  useEffect(() => {
    // A failed watcher silently breaks live refresh (external edits, agent writes
    // won't show) — surface it so the user knows updates won't stream in.
    startWatching(root).catch((e) => notifyError("project", translate("notice.watchFailed"), e))
    // Coalesce tree refreshes: a burst of file-changed events (e.g. an agent
    // bulk-editing) would otherwise trigger one full repo re-walk + tree re-list
    // per file. Debounce bumpTree() to fire once after the burst settles.
    let treeTimer: ReturnType<typeof setTimeout> | null = null
    const bumpTreeSoon = () => {
      if (treeTimer) clearTimeout(treeTimer)
      treeTimer = setTimeout(() => {
        treeTimer = null
        useProject.getState().bumpTree()
        // Editing a file changes the working tree but touches nothing under
        // `.git`, so no `git-changed` arrives — refresh here too, or the Source
        // Control badge only catches up on the next commit or checkout.
        gitInfo(root)
          .then(setGit)
          .catch((e) => log.warn("git info failed", { error: safeError(e) }))
      }, 250)
    }
    const offs = [
      listen<{ file: string }>("file-changed", (event) => {
        const { file } = event.payload
        // An external change (e.g. an agent's edit) to a file marked read means
        // there's new content to look at — flag the delta *before* unmarking
        // (mark(read=false) keeps the snapshot), then flip it to unread. Our own
        // saves are suppressed via wasSelfWrite.
        if (!wasSelfWrite(file) && useReadProgress.getState().read.has(file)) {
          useReadProgress.getState().markChanged(file)
          useReadProgress.getState().mark(root, file, false)
        }
        reanchorFile(root, file)
          .then((list) => useComments.getState().replaceForFile(file, list))
          .catch(() => {})
        // Keep the semantic index current, one file at a time — a full rebuild
        // per keystroke-triggered save would be the wrong shape entirely.
        semanticReindexFile(root, file).catch((e) =>
          log.warn("semantic reindex failed", { error: safeError(e) }),
        )
        // Re-list the tree so files created/moved/deleted on disk (or dragged in
        // from outside) show up without a manual refresh — coalesced so a burst
        // of edits only walks the tree once.
        bumpTreeSoon()
        // If a file open in a tab was deleted on disk, close the tab instead of
        // leaving a broken editor (VS Code behaviour).
        const { tabs, close } = useProject.getState()
        // Tabs hold absolute paths; pass the absolute path so read_file resolves
        // it against the project root (a relative path would fail to canonicalize
        // and wrongly close the tab on every edit).
        const tab = tabs.find((p) => toRelative(root, p) === file)
        if (tab) readFile(root, tab).catch(() => close(tab))
      }),
      // An agent mutated comments via the `reado` CLI — reload the list so the
      // UI reflects done/reply/add without a manual refresh.
      listen("comments-changed", () => {
        useComments
          .getState()
          .load(root)
          // The resolve loop tracks progress by watching comments resolve.
          .then(() => useResolveLoop.getState().sync(root))
          .catch((e) => log.warn("resolve-loop sync failed", { error: safeError(e) }))
        rebuildIndex(root).catch((e) => log.warn("index rebuild failed", { error: safeError(e) }))
      }),
      // A guided review advanced (the agent planned a route or proposed an
      // artifact via the CLI) — reload sessions so the Review Guide stays live.
      listen("sessions-changed", () => {
        useGuidedReview.getState().load(root)
      }),
      // The agent narrated a reasoning line via `reado thought` — refresh the
      // live reasoning feed docked beside the terminal.
      listen("reasoning-changed", () => {
        useReasoning.getState().load(root)
      }),
      // The branch changed on disk (e.g. `git checkout` in the terminal) — refresh
      // git state so the status bar shows the real branch.
      listen("git-changed", () => {
        gitInfo(root)
          .then(setGit)
          .catch((e) => log.warn("git info failed", { error: safeError(e) }))
      }),
    ]
    return () => {
      if (treeTimer) clearTimeout(treeTimer)
      offs.forEach((p) => void p.then((off) => off()).catch(() => {}))
    }
  }, [root])

  const [toolMenu, setToolMenu] = useState<{ x: number; y: number; tool: Tool } | null>(null)
  const onRight = useSettings((s) => s.sidebarSide) === "right"
  const selectedTool = useWorkspace((s) => s.tool)
  // A tool the user has docked renders there, not here — otherwise the same
  // panel would exist twice, with two scroll positions and two selections.
  const docked = useLayout((s) => (selectedTool ? !!findPanel(s.layout, selectedTool) : false))
  const tool = docked ? null : selectedTool
  const graphOpen = useWorkspace((s) => s.graphOpen)
  const docsOpen = useWorkspace((s) => s.docsOpen)
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth)
  const showHidden = useProject((s) => s.showHidden)
  const setShowHidden = useProject((s) => s.setShowHidden)
  const showActivityBar = useSettings((s) => s.showActivityBar)
  // Auto-hide activity bar: revealed while hovered at the left edge.
  const [railHover, setRailHover] = useState(false)
  const showStatusBar = useSettings((s) => s.showStatusBar)
  const showBreadcrumbs = useSettings((s) => s.showBreadcrumbs)
  // A native preview webview can outlive a full frontend reload (dev HMR, or any
  // reload); if the pane isn't open when the workspace mounts, close the orphan so
  // it can't sit on top of the UI.
  useEffect(() => {
    if (!usePreview.getState().open) void previewClose()
  }, [])

  // Ensure the terminal agent can reach Reado's MCP server: wire `reado mcp` into
  // the project's agent config on open (idempotent, non-clobbering).
  useEffect(() => {
    void ensureMcp(root)
  }, [root])

  // Load any existing reasoning feed on open (a run from before this session).
  useEffect(() => {
    void useReasoning.getState().load(root)
  }, [root])

  // Self-heal: if the console is on and detached but not placed anywhere in the
  // layout (e.g. persisted stores drifted, or a reset), dock it so it can't vanish.
  const inspectorOn = usePreview((s) => s.inspector)
  const inspectorDetached = usePreview((s) => s.inspectorDetached)
  useEffect(() => {
    if (inspectorOn && inspectorDetached && !findPanel(useLayout.getState().layout, "inspector")) {
      useLayout.getState().move("inspector", "bottom", { split: true })
    }
  }, [inspectorOn, inspectorDetached])
  const closeSplit = useProject((s) => s.closeSplit)
  const swapSplit = useProject((s) => s.swapSplit)
  const readCount = useReadProgress((s) => s.read.size)
  const [totalFiles, setTotalFiles] = useState(0)
  const openTaskCount = useComments(
    (s) => s.comments.filter((c) => c.kind === "task" && c.state === "open").length,
  )
  const prevOpenTasks = useRef(openTaskCount)

  // Notify when the open-task count drops (the agent resolved something).
  useEffect(() => {
    if (openTaskCount < prevOpenTasks.current) notifyResolved(openTaskCount)
    prevOpenTasks.current = openTaskCount
  }, [openTaskCount])

  // Idle heuristic for the resolve loop: if the agent goes quiet mid-loop, flag
  // it as waiting for the human (delivered to a paired phone via Anywhere).
  useEffect(() => {
    if (!root) return
    const t = setInterval(() => useResolveLoop.getState().tick(root), 15_000)
    return () => clearInterval(t)
  }, [root])

  // Live width during a drag; committed to the persisted store only on pointerup
  // so we don't serialize+write localStorage on every pointermove. `null` means
  // not dragging (use the persisted value).
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  // Re-clamp the applied width when the window resizes (see appliedSidebarWidth);
  // a bare counter bump is enough to re-run render with the new innerWidth.
  const [, setResizeTick] = useState(0)
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Drag the sidebar's right edge to resize. The panel starts after the 48px
  // activity bar, so its width tracks the cursor's x minus that offset. During
  // the drag we update local state for immediate feedback; the persisted store
  // is written once on release. `clientX` is a viewport (visual) pixel but the
  // width is a layout pixel inside the interface-zoom transform, so divide by the
  // zoom to convert — otherwise the sidebar tracks the wrong width at zoom ≠ 1.
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault()
    let latest = sidebarWidth
    const zoom = useSettings.getState().zoom || 1
    // The sidebar is measured from its own outer edge, so on the right the
    // pointer is subtracted from the viewport rather than added from zero —
    // otherwise dragging inward would narrow it.
    const rail = showActivityBar ? 48 : 0
    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX / zoom
      latest = onRight ? window.innerWidth / zoom - x - rail : x - rail
      setDragWidth(latest)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setSidebarWidth(latest)
      setDragWidth(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  // Clamp the applied (not persisted) width so the editor keeps a minimum size.
  // Widths are layout pixels; `innerWidth` is a visual pixel, so convert it to the
  // layout viewport width (innerWidth / zoom) before subtracting the min editor.
  const zoom = useSettings((s) => s.zoom) || 1
  const appliedSidebarWidth = Math.min(
    dragWidth ?? sidebarWidth,
    window.innerWidth / zoom - MIN_EDITOR_WIDTH,
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h1 className="sr-only">{root.split(/[\\/]/).filter(Boolean).pop() ?? root}</h1>
      <div
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{
          // Pinned: the activity bar takes a grid column (`auto` tracks its width
          // under interface zoom). Auto-hide: it leaves the grid entirely — 3 → 2
          // columns — and overlays on the left edge, revealed on hover (below).
          // The sidebar edge is one unit: the activity bar and the tool panel
          // move together, and the editor keeps the middle either way. Column
          // order is reversed for the right edge and the children carry an
          // explicit `order`, so the DOM stays in reading order.
          gridTemplateColumns: onRight
            ? showActivityBar
              ? tool
                ? `1fr ${appliedSidebarWidth}px auto`
                : "1fr auto"
              : tool
                ? `1fr ${appliedSidebarWidth}px`
                : "1fr"
            : showActivityBar
              ? tool
                ? `auto ${appliedSidebarWidth}px 1fr`
                : "auto 1fr"
              : tool
                ? `${appliedSidebarWidth}px 1fr`
                : "1fr",
        }}
      >
        {showActivityBar && (
          <div className="contents" style={{ order: onRight ? 3 : 1 }}>
            <ActivityBar />
          </div>
        )}
        {/* Auto-hide: the bar overlays the left edge, collapsed to a thin sliver
          you hover to reveal — so tools/Settings stay reachable without a column. */}
        {!showActivityBar && (
          <div
            className={`absolute inset-y-0 z-30 transition-transform duration-200 ease-out ${
              onRight ? "right-0" : "left-0"
            }`}
            style={{
              transform: railHover
                ? "translateX(0)"
                : `translateX(calc(${onRight ? "" : "-"}100% ${onRight ? "-" : "+"} 10px))`,
            }}
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
          >
            <div className="h-full shadow-[var(--shadow)]">
              <ActivityBar />
            </div>
          </div>
        )}
        {tool && (
          <aside
            style={{ order: 2 }}
            className={`relative flex min-w-0 flex-col overflow-hidden bg-surface ${
              onRight ? "border-l border-line" : "border-r border-line"
            }`}
          >
            {/* Resize handle straddling the border that faces the editor. */}
            <div
              onPointerDown={startSidebarResize}
              className={`absolute top-0 bottom-0 z-10 w-2 cursor-col-resize ${
                onRight ? "-left-1" : "-right-1"
              }`}
            />
            <header className="flex h-9 flex-none items-center justify-between border-b border-line pr-2 pl-3 text-xs font-medium tracking-wide text-muted uppercase">
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  title={t("dock.menu")}
                  className="-ml-1 px-1 text-inherit uppercase"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setToolMenu({ x: r.left, y: r.bottom, tool })
                  }}
                >
                  {t(TOOL_TITLE[tool])}
                </Button>
                {tool === "files" && totalFiles > 0 && (
                  <span className="text-[10px] font-normal normal-case text-faint">
                    {readCount}/{totalFiles} {t("progress.read")}
                  </span>
                )}
              </span>
              {tool === "files" && (
                <span className="flex items-center gap-0.5">
                  <IconButton
                    size="sm"
                    label={t("tree.collapseAll")}
                    onClick={() => useProject.getState().collapseTree()}
                    icon={<CollapseAllIcon className="h-[15px] w-[15px]" />}
                  />
                  <IconButton
                    size="sm"
                    label={t("tree.showHidden")}
                    active={showHidden}
                    onClick={() => setShowHidden(!showHidden)}
                    icon={
                      showHidden ? (
                        <EyeIcon className="h-[15px] w-[15px]" weight="duotone" />
                      ) : (
                        <EyeOffIcon className="h-[15px] w-[15px]" />
                      )
                    }
                  />
                </span>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ToolPanelBody tool={tool} />
            </div>
          </aside>
        )}
        <main style={{ order: onRight ? 1 : 3 }} className="flex min-w-0 flex-col overflow-hidden">
          <Tabs />
          {showBreadcrumbs && <Breadcrumb />}
          {/* Editor + optional split pane + terminal (right dock). The primary
            (left) pane is the one with the breadcrumb/tabs above it; the split
            pane carries its own compact header — that asymmetry signals which
            pane drives the status bar, no loud accent needed. */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <Editor />
              <TourBar />
            </div>
            {splitPath && (
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-l-line">
                <header className="flex h-9 flex-none items-center gap-2 border-b border-line pr-1.5 pl-3 text-xs text-muted">
                  <span
                    className="min-w-0 flex-1 truncate font-mono"
                    title={toRelative(root, splitPath)}
                  >
                    {toRelative(root, splitPath)}
                  </span>
                  <IconButton
                    size="sm"
                    label={t("split.swap")}
                    icon={<SwapIcon className="h-3.5 w-3.5" />}
                    onClick={swapSplit}
                  />
                  <IconButton
                    size="sm"
                    label={t("split.close")}
                    icon={<CloseIcon className="h-3.5 w-3.5" />}
                    onClick={closeSplit}
                  />
                </header>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <Editor paneFile={splitPath} />
                </div>
              </div>
            )}
            <DockRegion area="right" />
          </div>
          <DockRegion area="bottom" />
        </main>
        {/* Send a tool panel to a dock. The sidebar is just where a panel sits
          by default; from here it can live beside the terminal or the browser. */}
        {toolMenu && (
          <ContextMenu
            x={toolMenu.x}
            y={toolMenu.y}
            onClose={() => setToolMenu(null)}
            items={(["left", "right", "bottom"] as DockArea[])
              .filter((area) => area !== "left")
              .map((area) => ({
                label: t(area === "right" ? "dock.moveRight" : "dock.moveBottom"),
                onSelect: () => {
                  useLayout.getState().move(toolMenu.tool, area, { split: true })
                  setToolMenu(null)
                },
              }))}
          />
        )}
        <GitignorePrompt />
        {graphOpen && <KnowledgeGraph />}
        {docsOpen && <DocsView />}
      </div>
      {/* Status bar spans the full window width, below the activity bar + sidebar. */}
      {showStatusBar && <StatusBar />}
    </div>
  )
}

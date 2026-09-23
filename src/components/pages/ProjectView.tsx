/**
 * The project workspace: sidebar file tree, editor tabs, reading surface,
 * status bar, and the overlays (palette + settings). Loads git state and
 * restores the prior session on mount; persists the session as tabs change.
 */

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { ContextMenu } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import {
  CloseIcon,
  CollapseAllIcon,
  EyeIcon,
  EyeOffIcon,
  NewFileIcon,
  NewFolderIcon,
  RefreshIcon,
  SearchIcon,
  SwapIcon,
} from "@/components/atoms/icons"
import { Breadcrumb } from "@/components/molecules/Breadcrumb"
import { GitignorePrompt } from "@/components/molecules/GitignorePrompt"
import { StatusBar } from "@/components/molecules/StatusBar"
import { ActivityBar } from "@/components/organisms/ActivityBar"
import { DockRegion } from "@/components/organisms/DockRegion"
import { DocsView } from "@/components/organisms/DocsView"
import { Editor } from "@/components/organisms/Editor"
import { ExtensionPage } from "@/components/organisms/ExtensionPage"
import { useTreeFilter } from "@/components/organisms/FileTree"
import { GitGraph } from "@/components/organisms/GitGraph"
import { KnowledgeGraph } from "@/components/organisms/KnowledgeGraph"
import { Tabs } from "@/components/organisms/Tabs"
import { TOOL_TITLE, ToolPanelBody } from "@/components/organisms/ToolPanelBody"
import { TourBar } from "@/components/organisms/ToursPanel"
import { previewClose } from "@/lib/api"
import { openTaskCount as openTaskCountOf, toRelative, useComments } from "@/lib/comments"
import { newFile, newFolder } from "@/lib/docInfo"
import { type DockArea, findPanel, useLayout } from "@/lib/layout"
import { workbenchColumns } from "@/lib/layoutColumns"
import { ensureMcp } from "@/lib/mcp"
import { notifyResolved } from "@/lib/notify"
import { trackPointer } from "@/lib/pointerDrag"
import { usePreview } from "@/lib/preview"
import { loadProjectConfig, watchProjectConfig } from "@/lib/projectConfig"
import { useReadProgress } from "@/lib/readProgress"
import { useReasoning } from "@/lib/reasoning"
import { offerRecommendations } from "@/lib/recommended"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useSpecs } from "@/lib/specs"
import { type Tool, useProject, useSettings, useWorkspace } from "@/lib/store"
import { useTesting } from "@/lib/testing"
import { useAnywhereBridge } from "./project/useAnywhereBridge"
import { useProjectSession } from "./project/useProjectSession"
import { useProjectWatcher } from "./project/useProjectWatcher"

// Keep at least this much room for the editor when applying the sidebar width,
// so a width persisted on a large monitor can't squeeze the editor to nothing
// on a smaller window.
const MIN_EDITOR_WIDTH = 360
// …and the sidebar keeps this much, so the editor's room can't squeeze *it* to
// nothing either: in a window too small for both (800px at 200% zoom is a 400px
// layout), the sidebar went down to 40px — file names gone, its header cut.
// There, the two share the space instead.
const MIN_SIDEBAR_WIDTH = 180

export function ProjectView({ root }: { root: string }) {
  const splitPath = useProject((s) => s.splitPath)
  const groups = useProject((s) => s.groups)
  const focusedGroup = useProject((s) => s.focusedGroup)
  const focusGroup = useProject((s) => s.focusGroup)
  const treeNonce = useProject((s) => s.treeNonce)
  const { t } = useTranslation()

  const totalFiles = useProjectSession(root)

  // Reload the specs list when files change on disk (mirrors the file tree), so
  // adding/removing an OpenSpec change or capability shows up without a reopen —
  // and the Specs tool appears the moment the first spec lands.
  useEffect(() => {
    void useSpecs.getState().load(root)
  }, [root, treeNonce])

  // The same for tests, but on open only: the Test Explorer appears in the rail
  // once the project has tests, so the sweep cannot wait for the panel it is
  // what reveals. Not on `treeNonce` — that fires after every save, and the
  // sweep reads every test file in the project to answer "still the same". The
  // panel's own Refresh button is the deliberate re-run.
  useEffect(() => {
    void useTesting.getState().load(root)
  }, [root])

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

  useAnywhereBridge(root)

  // Apply per-project settings overrides, then persist changes back to them.
  useEffect(() => {
    loadProjectConfig(root)
    return watchProjectConfig(root)
  }, [root])

  // What the repository says a reader needs, once per project per session.
  useEffect(() => {
    void offerRecommendations(root)
  }, [root])

  useProjectWatcher(root)

  const [toolMenu, setToolMenu] = useState<{ x: number; y: number; tool: Tool } | null>(null)
  const onRight = useSettings((s) => s.sidebarSide) === "right"
  const selectedTool = useWorkspace((s) => s.tool)
  // A tool the user has docked renders there, not here — otherwise the same
  // panel would exist twice, with two scroll positions and two selections.
  const docked = useLayout((s) => (selectedTool ? !!findPanel(s.layout, selectedTool) : false))
  const tool = docked ? null : selectedTool
  const graphOpen = useWorkspace((s) => s.graphOpen)
  const gitGraphOpen = useWorkspace((s) => s.gitGraphOpen)
  const docsOpen = useWorkspace((s) => s.docsOpen)
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth)
  const showHidden = useProject((s) => s.showHidden)
  const setShowHidden = useProject((s) => s.setShowHidden)
  const filterOpen = useTreeFilter((s) => s.open)
  const showActivityBar = useSettings((s) => s.showActivityBar)
  // Auto-hide activity bar: revealed while hovered at the left edge.
  const [railHover, setRailHover] = useState(false)
  const showStatusBar = useSettings((s) => s.showStatusBar)
  const showBreadcrumbs = useSettings((s) => s.showBreadcrumbs)
  const panelAlignment = useSettings((s) => s.panelAlignment)
  const centeredLayout = useSettings((s) => s.centeredLayout)
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
  const openTaskCount = useComments((s) => openTaskCountOf(s.comments))
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
    trackPointer(onMove, () => {
      setSidebarWidth(latest)
      setDragWidth(null)
    })
  }

  // Clamp the applied (not persisted) width so the editor keeps a minimum size.
  // Widths are layout pixels; `innerWidth` is a visual pixel, so convert it to the
  // layout viewport width (innerWidth / zoom) before subtracting the min editor.
  const zoom = useSettings((s) => s.zoom) || 1
  const layoutWidth = window.innerWidth / zoom
  const appliedSidebarWidth = Math.max(
    Math.min(MIN_SIDEBAR_WIDTH, layoutWidth / 2),
    Math.min(dragWidth ?? sidebarWidth, layoutWidth - MIN_EDITOR_WIDTH),
  )

  const { columns, rowRegions, rowPanel } = workbenchColumns({
    showActivityBar,
    onRight,
    sidebar: !!tool,
    sidebarWidth: appliedSidebarWidth,
    panelAlignment,
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h1 className="sr-only">{root.split(/[\\/]/).filter(Boolean).pop() ?? root}</h1>
      <div
        data-workbench
        className="relative grid min-h-0 flex-1 overflow-hidden"
        style={{
          // The workbench is a two-row grid: the regions across the top, the
          // bottom panel underneath. Naming the areas rather than counting
          // column indices is what keeps the alignment maths below readable
          // while the activity bar, the sidebar and the secondary sidebar come
          // and go.
          //
          // Pinned: the activity bar takes a column (`auto` tracks its width
          // under interface zoom). Auto-hide: it leaves the grid entirely and
          // overlays the edge, revealed on hover (below). The sidebar edge is
          // one unit — activity bar and tool panel move together — so on the
          // right edge both swap sides while the DOM stays in reading order.
          gridTemplateColumns: columns.map((c) => c.size).join(" "),
          gridTemplateRows: "minmax(0, 1fr) auto",
          gridTemplateAreas: `"${rowRegions}" "${rowPanel}"`,
        }}
      >
        {showActivityBar && (
          <div style={{ gridArea: "act" }} className="flex min-h-0">
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
            style={{ gridArea: "side" }}
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
                    label={t("file.newFile")}
                    onClick={() => void newFile()}
                    icon={<NewFileIcon className="h-[15px] w-[15px]" />}
                  />
                  <IconButton
                    size="sm"
                    label={t("tree.newFolder")}
                    onClick={() => void newFolder()}
                    icon={<NewFolderIcon className="h-[15px] w-[15px]" />}
                  />
                  <IconButton
                    size="sm"
                    label={t("tree.filter")}
                    active={filterOpen}
                    onClick={() => useTreeFilter.getState().toggle()}
                    icon={<SearchIcon className="h-[15px] w-[15px]" />}
                  />
                  <IconButton
                    size="sm"
                    label={t("tree.refresh")}
                    onClick={() => useProject.getState().bumpTree()}
                    icon={<RefreshIcon className="h-[15px] w-[15px]" />}
                  />
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
        <main style={{ gridArea: "edit" }} className="flex min-w-0 flex-col overflow-hidden">
          <Tabs />
          {showBreadcrumbs && <Breadcrumb />}
          {/* Editor + optional split pane + terminal (right dock). The primary
            (left) pane is the one with the breadcrumb/tabs above it; the split
            pane carries its own compact header — that asymmetry signals which
            pane drives the status bar, no loud accent needed. */}
          {/* Centered layout: hold the text to a readable measure and give the
            slack back as margin, rather than letting a line run the width of a
            wide display. */}
          <div
            className={`flex min-h-0 flex-1 overflow-hidden ${
              centeredLayout ? "mx-auto w-full max-w-[min(100%,980px)]" : ""
            }`}
          >
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <Editor />
              <TourBar />
              {/* Inside the editor pane, not over the window: you read an
                  extension's page while the list you came from is still there,
                  so picking the next one is one click and not a re-navigation. */}
              <ExtensionPage />
            </div>
            {/* The other editor groups. Each is a real pane — its own tabs, its
                own file, its own history — and clicking anywhere in one focuses
                it, so the next file you open lands where you are looking. */}
            {groups
              .filter((g) => g.id !== focusedGroup)
              .map((g) => (
                // Not a <button>: the pane holds its own tabs, close buttons and
                // ruler markers, and a button cannot contain buttons — React said
                // so on every split ("<button> cannot be a descendant of
                // <button>"), and 22 nested ones is a pane whose tab order and
                // screen-reader tree are both wrong. The element was never doing
                // the work anyway: focusing on click is entirely the two capture
                // handlers below. A named <section> keeps the pane addressable
                // (it reads as a region with this label) without pretending to be
                // a control.
                <section
                  key={g.id}
                  aria-label={t("group.focus", { n: groups.indexOf(g) + 1 })}
                  onFocusCapture={() => focusGroup(g.id)}
                  onMouseDownCapture={() => focusGroup(g.id)}
                  className="flex min-w-0 flex-1 cursor-default flex-col overflow-hidden border-l border-l-line text-left"
                >
                  <Tabs group={g.id} />
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    {g.active ? (
                      <Editor paneFile={g.active} />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-faint">
                        {t("group.empty")}
                      </div>
                    )}
                  </div>
                </section>
              ))}
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
          </div>
        </main>
        {/* The secondary sidebar and the panel are grid regions of their own —
          which is what lets the panel run under one, the other, both or neither
          (Panel alignment). Inside `main` it could only ever be "center". */}
        <div style={{ gridArea: "aux" }} className="flex min-h-0">
          <DockRegion area="right" />
        </div>
        <div style={{ gridArea: "panel" }} className="flex min-w-0 flex-col">
          <DockRegion area="bottom" />
        </div>
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
        {gitGraphOpen && <GitGraph />}
        {docsOpen && <DocsView />}
      </div>
      {/* Status bar spans the full window width, below the activity bar + sidebar. */}
      {showStatusBar && <StatusBar />}
    </div>
  )
}

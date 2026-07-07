/**
 * The project workspace: sidebar file tree, editor tabs, reading surface,
 * status bar, and the overlays (palette + settings). Loads git state and
 * restores the prior session on mount; persists the session as tabs change.
 */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  gitInfo,
  startWatching,
  reanchorFile,
  rebuildIndex,
  readFile,
  listFiles,
  anywhereSetProject,
  anywhereClearProject,
  type Objective,
} from "../../lib/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { dispatchToAgent } from "../../lib/agents";
import { composeReviewPrompt } from "../../lib/review";
import { useReadProgress, wasSelfWrite } from "../../lib/readProgress";
import { useProject, useSessions, useWorkspace, useSettings } from "../../lib/store";
import { useComments, toRelative } from "../../lib/comments";
import { notifyResolved } from "../../lib/notify";
import { loadProjectConfig, watchProjectConfig } from "../../lib/projectConfig";
import { setWindowTitle, currentOpenFile, clearOpenFile } from "../../lib/window";
import { type MessageKey } from "../../i18n";
import { ActivityBar } from "../organisms/ActivityBar";
import { FileTree } from "../organisms/FileTree";
import { SearchPanel } from "../organisms/SearchPanel";
import { CommentsPanel } from "../organisms/CommentsPanel";
import { GitPanel } from "../organisms/GitPanel";
import { OrphansPanel } from "../organisms/OrphansPanel";
import { SpecsPanel } from "../organisms/SpecsPanel";
import { ExtensionsPanel } from "../organisms/ExtensionsPanel";
import { OutlinePanel } from "../organisms/OutlinePanel";
import { ProblemsPanel } from "../organisms/ProblemsPanel";
import { BookmarksPanel } from "../organisms/BookmarksPanel";
import { HierarchyPanel } from "../organisms/HierarchyPanel";
import { TimelinePanel } from "../organisms/TimelinePanel";
import { QaPanel } from "../organisms/QaPanel";
import { ToursPanel, TourBar } from "../organisms/ToursPanel";
import { PreReviewPanel } from "../organisms/PreReviewPanel";
import { GuidedReviewPanel } from "../organisms/GuidedReviewPanel";
import { useSpecs } from "../../lib/specs";
import { useTours } from "../../lib/tours";
import { usePreReview } from "../../lib/preReview";
import { useGuidedReview } from "../../lib/guidedReview";
import { useResolveLoop } from "../../lib/resolveLoop";
import { useBookmarks } from "../../lib/bookmarks";
import { useQa } from "../../lib/qa";
import { Tabs } from "../organisms/Tabs";
import { Breadcrumb } from "../molecules/Breadcrumb";
import { Editor } from "../organisms/Editor";
import { StatusBar } from "../molecules/StatusBar";
import { GitignorePrompt } from "../molecules/GitignorePrompt";
import { KnowledgeGraph } from "../organisms/KnowledgeGraph";
import { DocsView } from "../organisms/DocsView";
import { TerminalPanel } from "../organisms/TerminalPanel";
import { useTerminals } from "../../lib/terminals";
import { EyeIcon, EyeOffIcon, CloseIcon, SwapIcon, CollapseAllIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

const PANEL_TITLE: Record<string, MessageKey> = {
  files: "files.panel",
  search: "search.placeholder",
  comments: "comments.panel",
  outline: "outline.panel",
  git: "git.panel",
  orphans: "orphans.panel",
  specs: "specs.panel",
  extensions: "ext.panel",
};

const basename = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;

// Keep at least this much room for the editor when applying the sidebar width,
// so a width persisted on a large monitor can't squeeze the editor to nothing
// on a smaller window.
const MIN_EDITOR_WIDTH = 360;

export function ProjectView({ root }: { root: string }) {
  const init = useProject((s) => s.init);
  const setGit = useProject((s) => s.setGit);
  const tabs = useProject((s) => s.tabs);
  const active = useProject((s) => s.active);
  const expandedDirs = useProject((s) => s.expandedDirs);
  const splitPath = useProject((s) => s.splitPath);
  const treeNonce = useProject((s) => s.treeNonce);
  const saveSession = useSessions((s) => s.save);
  const { t } = useTranslation();

  // True once the saved session has been restored. We must not persist the
  // (empty) initial state before then, or it would clobber the saved session.
  const restored = useRef(false);

  // Restore the saved session synchronously on mount, then load git info
  // separately. Doing the restore synchronously (rather than after the async
  // git call) keeps tab order deterministic and race-free.
  useEffect(() => {
    // Restore the saved session only when the setting allows; otherwise start
    // clean. The stored session is left on disk (not deleted).
    const session = useSettings.getState().restoreSession
      ? useSessions.getState().byRoot[root]
      : undefined;
    init(root, { isRepo: false, branch: null }, session);
    restored.current = true;
    // Opened from an OS file association: open the requested file, then drop the
    // hash param so a reload doesn't re-open it.
    const openFile = currentOpenFile();
    if (openFile && openFile.startsWith(root)) {
      useProject.getState().open(openFile);
      clearOpenFile();
    }
    setWindowTitle(basename(root));
    useComments.getState().load(root);
    useReadProgress.getState().load(root);
    useBookmarks.getState().load(root);
    useQa.getState().load(root);
    useTours.getState().load(root);
    usePreReview.getState().load(root);
    useGuidedReview.getState().load(root);
    void useResolveLoop.getState().load(root);
    listFiles(root)
      .then((f) => setTotalFiles(f.length))
      .catch(() => setTotalFiles(0));
    // Build the SQLite index on open if missing/stale (rebuildable cache).
    rebuildIndex(root).catch(() => {});
    gitInfo(root)
      .then(setGit)
      .catch(() => {});
  }, [root, init, setGit]);

  // Reload the specs list when files change on disk (mirrors the file tree), so
  // adding/removing an OpenSpec change or capability shows up without a reopen —
  // and the Specs tool appears the moment the first spec lands.
  useEffect(() => {
    void useSpecs.getState().load(root);
  }, [root, treeNonce]);

  // Re-list the tree/search when the exclude globs change (skip the initial run;
  // the tree already lists on mount).
  const excludeGlobs = useSettings((s) => s.excludeGlobs);
  const firstGlobs = useRef(true);
  useEffect(() => {
    if (firstGlobs.current) {
      firstGlobs.current = false;
      return;
    }
    useProject.getState().bumpTree();
  }, [excludeGlobs]);

  // Reado Anywhere: expose this window's project to paired phones, and act on
  // their requests (run the agent / pre-review) when they target this project.
  useEffect(() => {
    if (!root) return;
    const id = getCurrentWindow().label;
    anywhereSetProject(id, root, basename(root)).catch(() => {});
    const subs = [
      listen<string>("anywhere://run-agent", (e) => {
        if (e.payload !== root) return;
        const tasks = useComments
          .getState()
          .comments.filter((c) => c.kind === "task" && c.state === "open");
        void dispatchToAgent(composeReviewPrompt(tasks.length));
      }),
      listen<string>("anywhere://prereview", (e) => {
        if (e.payload === root) usePreReview.getState().generate(root);
      }),
      // A paired phone triggered a guided-review agent action — run it here (the
      // agent lives on this desktop). Disposals the phone does hit disk directly.
      listen<{
        root: string;
        id: string;
        file: string;
        action: string;
        objective: string | null;
      }>("anywhere://review-action", (e) => {
        const a = e.payload;
        if (a.root !== root) return;
        const g = useGuidedReview.getState();
        switch (a.action) {
          case "start":
            void g.start(root, { kind: "diff" }, (a.objective as Objective) ?? "bug_risk");
            break;
          case "file":
            void g.reviewFile(root, a.id, a.file);
            break;
          case "respond":
            void g.respond(root, a.id, a.file);
            break;
          case "challenge":
            void g.challenge(root, a.id, a.file);
            break;
          case "send":
            void g.sendTasks(root, a.id);
            break;
        }
      }),
    ];
    return () => {
      anywhereClearProject(id).catch(() => {});
      // The unlisten can reject (Tauri's listener map may already be torn down
      // on a fast remount / StrictMode double-effect) — swallow it so it doesn't
      // surface as an unhandled rejection.
      subs.forEach((p) => void p.then((un) => un()).catch(() => {}));
    };
  }, [root]);

  // Persist the session whenever the open tabs, active file, tree drill-down, or
  // split pane change, so reopening the project restores all of it.
  useEffect(() => {
    if (!restored.current) return;
    saveSession(root, { tabs, active, expanded: expandedDirs, split: splitPath });
  }, [root, tabs, active, expandedDirs, splitPath, saveSession]);

  // Apply per-project settings overrides, then persist changes back to them.
  useEffect(() => {
    loadProjectConfig(root);
    return watchProjectConfig(root);
  }, [root]);

  // Watch the project and re-anchor a file's comments when it changes on disk
  // (external edits, or the agent's own writes).
  useEffect(() => {
    startWatching(root).catch(() => {});
    // Coalesce tree refreshes: a burst of file-changed events (e.g. an agent
    // bulk-editing) would otherwise trigger one full repo re-walk + tree re-list
    // per file. Debounce bumpTree() to fire once after the burst settles.
    let treeTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpTreeSoon = () => {
      if (treeTimer) clearTimeout(treeTimer);
      treeTimer = setTimeout(() => {
        treeTimer = null;
        useProject.getState().bumpTree();
      }, 250);
    };
    const offs = [
      listen<{ file: string }>("file-changed", (event) => {
        const { file } = event.payload;
        // An external change (e.g. an agent's edit) to a file marked read means
        // there's new content to look at — flag the delta *before* unmarking
        // (mark(read=false) keeps the snapshot), then flip it to unread. Our own
        // saves are suppressed via wasSelfWrite.
        if (!wasSelfWrite(file) && useReadProgress.getState().read.has(file)) {
          useReadProgress.getState().markChanged(file);
          useReadProgress.getState().mark(root, file, false);
        }
        reanchorFile(root, file)
          .then((list) => useComments.getState().replaceForFile(file, list))
          .catch(() => {});
        // Re-list the tree so files created/moved/deleted on disk (or dragged in
        // from outside) show up without a manual refresh — coalesced so a burst
        // of edits only walks the tree once.
        bumpTreeSoon();
        // If a file open in a tab was deleted on disk, close the tab instead of
        // leaving a broken editor (VS Code behaviour).
        const { tabs, close } = useProject.getState();
        // Tabs hold absolute paths; pass the absolute path so read_file resolves
        // it against the project root (a relative path would fail to canonicalize
        // and wrongly close the tab on every edit).
        const tab = tabs.find((p) => toRelative(root, p) === file);
        if (tab) readFile(root, tab).catch(() => close(tab));
      }),
      // An agent mutated comments via the `reado` CLI — reload the list so the
      // UI reflects done/reply/add without a manual refresh.
      listen("comments-changed", () => {
        useComments
          .getState()
          .load(root)
          // The resolve loop tracks progress by watching comments resolve.
          .then(() => useResolveLoop.getState().sync(root))
          .catch(() => {});
        rebuildIndex(root).catch(() => {});
      }),
      // A guided review advanced (the agent planned a route or proposed an
      // artifact via the CLI) — reload sessions so the Review Guide stays live.
      listen("sessions-changed", () => {
        useGuidedReview.getState().load(root);
      }),
      // The branch changed on disk (e.g. `git checkout` in the terminal) — refresh
      // git state so the status bar shows the real branch.
      listen("git-changed", () => {
        gitInfo(root).then(setGit).catch(() => {});
      }),
    ];
    return () => {
      if (treeTimer) clearTimeout(treeTimer);
      offs.forEach((p) => void p.then((off) => off()).catch(() => {}));
    };
  }, [root]);

  const tool = useWorkspace((s) => s.tool);
  const graphOpen = useWorkspace((s) => s.graphOpen);
  const docsOpen = useWorkspace((s) => s.docsOpen);
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth);
  const showHidden = useProject((s) => s.showHidden);
  const setShowHidden = useProject((s) => s.setShowHidden);
  const showActivityBar = useSettings((s) => s.showActivityBar);
  // Auto-hide activity bar: revealed while hovered at the left edge.
  const [railHover, setRailHover] = useState(false);
  const showStatusBar = useSettings((s) => s.showStatusBar);
  const showBreadcrumbs = useSettings((s) => s.showBreadcrumbs);
  const terminalOpen = useTerminals((s) => s.open);
  const terminalPosition = useTerminals((s) => s.position);
  const closeSplit = useProject((s) => s.closeSplit);
  const swapSplit = useProject((s) => s.swapSplit);
  const readCount = useReadProgress((s) => s.read.size);
  const [totalFiles, setTotalFiles] = useState(0);
  const openTaskCount = useComments(
    (s) => s.comments.filter((c) => c.kind === "task" && c.state === "open").length,
  );
  const prevOpenTasks = useRef(openTaskCount);

  // Notify when the open-task count drops (the agent resolved something).
  useEffect(() => {
    if (openTaskCount < prevOpenTasks.current) notifyResolved(openTaskCount);
    prevOpenTasks.current = openTaskCount;
  }, [openTaskCount]);

  // Idle heuristic for the resolve loop: if the agent goes quiet mid-loop, flag
  // it as waiting for the human (delivered to a paired phone via Anywhere).
  useEffect(() => {
    if (!root) return;
    const t = setInterval(() => useResolveLoop.getState().tick(root), 15_000);
    return () => clearInterval(t);
  }, [root]);

  // Live width during a drag; committed to the persisted store only on pointerup
  // so we don't serialize+write localStorage on every pointermove. `null` means
  // not dragging (use the persisted value).
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  // Re-clamp the applied width when the window resizes (see appliedSidebarWidth);
  // a bare counter bump is enough to re-run render with the new innerWidth.
  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag the sidebar's right edge to resize. The panel starts after the 48px
  // activity bar, so its width tracks the cursor's x minus that offset. During
  // the drag we update local state for immediate feedback; the persisted store
  // is written once on release.
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    let latest = sidebarWidth;
    const onMove = (ev: PointerEvent) => {
      latest = ev.clientX - 48;
      setDragWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSidebarWidth(latest);
      setDragWidth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Clamp the applied (not persisted) width so the editor keeps a minimum size.
  const appliedSidebarWidth = Math.min(
    dragWidth ?? sidebarWidth,
    window.innerWidth - MIN_EDITOR_WIDTH,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
    <h1 className="sr-only">{root.split(/[\\/]/).filter(Boolean).pop() ?? root}</h1>
    <div
      className="relative grid min-h-0 flex-1 overflow-hidden"
      style={{
        // Pinned: the activity bar takes a grid column (`auto` tracks its width
        // under interface zoom). Auto-hide: it leaves the grid entirely — 3 → 2
        // columns — and overlays on the left edge, revealed on hover (below).
        gridTemplateColumns: showActivityBar
          ? tool
            ? `auto ${appliedSidebarWidth}px 1fr`
            : "auto 1fr"
          : tool
            ? `${appliedSidebarWidth}px 1fr`
            : "1fr",
      }}
    >
      {showActivityBar && <ActivityBar />}
      {/* Auto-hide: the bar overlays the left edge, collapsed to a thin sliver
          you hover to reveal — so tools/Settings stay reachable without a column. */}
      {!showActivityBar && (
        <div
          className="absolute inset-y-0 left-0 z-30 transition-transform duration-200 ease-out"
          style={{ transform: railHover ? "translateX(0)" : "translateX(calc(-100% + 10px))" }}
          onMouseEnter={() => setRailHover(true)}
          onMouseLeave={() => setRailHover(false)}
        >
          <div className="h-full shadow-[var(--shadow)]">
            <ActivityBar />
          </div>
        </div>
      )}
      {tool && (
        <aside className="relative flex min-w-0 flex-col overflow-hidden border-r border-line bg-surface">
          {/* Resize handle straddling the right border. */}
          <div
            onPointerDown={startSidebarResize}
            className="absolute top-0 -right-1 bottom-0 z-10 w-2 cursor-col-resize"
          />
          <header className="flex h-9 flex-none items-center justify-between border-b border-line pr-2 pl-3 text-xs font-medium tracking-wide text-muted uppercase">
            <span className="flex items-center gap-2">
              {t(PANEL_TITLE[tool])}
              {tool === "files" && totalFiles > 0 && (
                <span className="text-[10px] font-normal normal-case text-faint">
                  {readCount}/{totalFiles} {t("progress.read")}
                </span>
              )}
            </span>
            {tool === "files" && (
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => useProject.getState().collapseTree()}
                  title={t("tree.collapseAll")}
                  aria-label={t("tree.collapseAll")}
                  className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-ink"
                >
                  <CollapseAllIcon className="h-[15px] w-[15px]" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowHidden(!showHidden)}
                  aria-pressed={showHidden}
                  title={t("tree.showHidden")}
                  aria-label={t("tree.showHidden")}
                  className={`grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-overlay hover:text-ink ${
                    showHidden ? "text-accent" : "text-faint"
                  }`}
                >
                  {showHidden ? (
                    <EyeIcon className="h-[15px] w-[15px]" />
                  ) : (
                    <EyeOffIcon className="h-[15px] w-[15px]" />
                  )}
                </button>
              </span>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {tool === "files" && <FileTree />}
            {tool === "search" && <SearchPanel />}
            {tool === "comments" && <CommentsPanel />}
            {tool === "outline" && <OutlinePanel />}
            {tool === "git" && <GitPanel />}
            {tool === "specs" && <SpecsPanel />}
            {tool === "orphans" && <OrphansPanel />}
            {tool === "problems" && <ProblemsPanel />}
            {tool === "bookmarks" && <BookmarksPanel />}
            {tool === "hierarchy" && <HierarchyPanel />}
            {tool === "timeline" && <TimelinePanel />}
            {tool === "qa" && <QaPanel />}
            {tool === "tours" && <ToursPanel />}
            {tool === "prereview" && <PreReviewPanel />}
            {tool === "guidedreview" && <GuidedReviewPanel />}
            {tool === "extensions" && <ExtensionsPanel />}
          </div>
        </aside>
      )}
      <main className="flex min-w-0 flex-col overflow-hidden">
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
                <span className="min-w-0 flex-1 truncate font-mono" title={toRelative(root, splitPath)}>
                  {toRelative(root, splitPath)}
                </span>
                <button
                  type="button"
                  onClick={swapSplit}
                  aria-label={t("split.swap")}
                  title={t("split.swap")}
                  className="grid h-6 w-6 flex-none place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
                >
                  <SwapIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={closeSplit}
                  aria-label={t("split.close")}
                  title={t("split.close")}
                  className="grid h-6 w-6 flex-none place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </header>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <Editor paneFile={splitPath} />
              </div>
            </div>
          )}
          {terminalOpen && terminalPosition === "right" && <TerminalPanel />}
        </div>
        {terminalOpen && terminalPosition === "bottom" && <TerminalPanel />}
      </main>
      <GitignorePrompt />
      {graphOpen && <KnowledgeGraph />}
      {docsOpen && <DocsView />}
    </div>
    {/* Status bar spans the full window width, below the activity bar + sidebar. */}
    {showStatusBar && <StatusBar />}
    </div>
  );
}

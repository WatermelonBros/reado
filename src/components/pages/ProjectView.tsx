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
} from "../../lib/api";
import { useReadProgress, wasSelfWrite } from "../../lib/readProgress";
import { useProject, useSessions, useWorkspace, useSettings } from "../../lib/store";
import { useComments, toRelative } from "../../lib/comments";
import { notifyResolved } from "../../lib/notify";
import { loadProjectConfig, watchProjectConfig } from "../../lib/projectConfig";
import { setWindowTitle } from "../../lib/window";
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
import { TestsPanel } from "../organisms/TestsPanel";
import { useSpecs } from "../../lib/specs";
import { useTours } from "../../lib/tours";
import { usePreReview } from "../../lib/preReview";
import { useTests } from "../../lib/tests";
import { useBookmarks } from "../../lib/bookmarks";
import { useQa } from "../../lib/qa";
import { Tabs } from "../organisms/Tabs";
import { Breadcrumb } from "../molecules/Breadcrumb";
import { Editor } from "../organisms/Editor";
import { StatusBar } from "../molecules/StatusBar";
import { Palette } from "../organisms/Palette";
import { Settings } from "../organisms/Settings";
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

export function ProjectView({ root }: { root: string }) {
  const init = useProject((s) => s.init);
  const setGit = useProject((s) => s.setGit);
  const tabs = useProject((s) => s.tabs);
  const active = useProject((s) => s.active);
  const saveSession = useSessions((s) => s.save);
  const { t } = useTranslation();

  // True once the saved session has been restored. We must not persist the
  // (empty) initial state before then, or it would clobber the saved session.
  const restored = useRef(false);

  // Restore the saved session synchronously on mount, then load git info
  // separately. Doing the restore synchronously (rather than after the async
  // git call) keeps tab order deterministic and race-free.
  useEffect(() => {
    const session = useSessions.getState().byRoot[root];
    init(root, { isRepo: false, branch: null }, session);
    restored.current = true;
    setWindowTitle(basename(root));
    useComments.getState().load(root);
    useSpecs.getState().load(root);
    useReadProgress.getState().load(root);
    useBookmarks.getState().load(root);
    useQa.getState().load(root);
    useTours.getState().load(root);
    usePreReview.getState().load(root);
    void useTests.getState().detect(root);
    listFiles(root)
      .then((f) => setTotalFiles(f.length))
      .catch(() => setTotalFiles(0));
    // Build the SQLite index on open if missing/stale (rebuildable cache).
    rebuildIndex(root).catch(() => {});
    gitInfo(root)
      .then(setGit)
      .catch(() => {});
  }, [root, init, setGit]);

  // Persist the session whenever the open tabs or active file change.
  useEffect(() => {
    if (!restored.current) return;
    saveSession(root, { tabs, active });
  }, [root, tabs, active, saveSession]);

  // Apply per-project settings overrides, then persist changes back to them.
  useEffect(() => {
    loadProjectConfig(root);
    return watchProjectConfig(root);
  }, [root]);

  // Watch the project and re-anchor a file's comments when it changes on disk
  // (external edits, or the agent's own writes).
  useEffect(() => {
    startWatching(root).catch(() => {});
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
        // from outside) show up without a manual refresh.
        useProject.getState().bumpTree();
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
        useComments.getState().load(root);
        rebuildIndex(root).catch(() => {});
      }),
      // The branch changed on disk (e.g. `git checkout` in the terminal) — refresh
      // git state so the status bar shows the real branch.
      listen("git-changed", () => {
        gitInfo(root).then(setGit).catch(() => {});
      }),
    ];
    return () => {
      offs.forEach((p) => p.then((off) => off()));
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
  const showStatusBar = useSettings((s) => s.showStatusBar);
  const showBreadcrumbs = useSettings((s) => s.showBreadcrumbs);
  const terminalOpen = useTerminals((s) => s.open);
  const terminalPosition = useTerminals((s) => s.position);
  const splitPath = useProject((s) => s.splitPath);
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

  // Drag the sidebar's right edge to resize. The panel starts after the 48px
  // activity bar, so its width tracks the cursor's x minus that offset.
  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => setSidebarWidth(ev.clientX - 48);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
    <div
      className="grid min-h-0 flex-1 overflow-hidden"
      style={{
        gridTemplateColumns: tool ? `48px ${sidebarWidth}px 1fr` : "48px 1fr",
      }}
    >
      {showActivityBar && <ActivityBar />}
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
            {tool === "tests" && <TestsPanel />}
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
      <Palette />
      <Settings />
      <GitignorePrompt />
      {graphOpen && <KnowledgeGraph />}
      {docsOpen && <DocsView />}
    </div>
    {/* Status bar spans the full window width, below the activity bar + sidebar. */}
    {showStatusBar && <StatusBar />}
    </div>
  );
}

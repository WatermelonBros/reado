/**
 * The project workspace: sidebar file tree, editor tabs, reading surface,
 * status bar, and the overlays (palette + settings). Loads git state and
 * restores the prior session on mount; persists the session as tabs change.
 */
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { gitInfo, startWatching, reanchorFile } from "../lib/api";
import { useProject, useSessions, useWorkspace } from "../lib/store";
import { useComments } from "../lib/comments";
import { notifyResolved } from "../lib/notify";
import { setWindowTitle } from "../lib/window";
import { useT, type MessageKey } from "../i18n";
import { ActivityBar } from "./ActivityBar";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { CommentsPanel } from "./CommentsPanel";
import { OrphansPanel } from "./OrphansPanel";
import { Tabs } from "./Tabs";
import { Breadcrumb } from "./Breadcrumb";
import { Editor } from "./Editor";
import { StatusBar } from "./StatusBar";
import { Palette } from "./Palette";
import { Settings } from "./Settings";
import { GitignorePrompt } from "./GitignorePrompt";
import { TerminalPanel } from "./TerminalPanel";
import { useTerminals } from "../lib/terminals";
import { EyeIcon, EyeOffIcon } from "./icons";

const PANEL_TITLE: Record<string, MessageKey> = {
  files: "files.panel",
  search: "search.placeholder",
  comments: "comments.panel",
  orphans: "orphans.panel",
};

const basename = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;

export function ProjectView({ root }: { root: string }) {
  const init = useProject((s) => s.init);
  const setGit = useProject((s) => s.setGit);
  const tabs = useProject((s) => s.tabs);
  const active = useProject((s) => s.active);
  const saveSession = useSessions((s) => s.save);
  const t = useT();

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
    gitInfo(root)
      .then(setGit)
      .catch(() => {});
  }, [root, init, setGit]);

  // Persist the session whenever the open tabs or active file change.
  useEffect(() => {
    if (!restored.current) return;
    saveSession(root, { tabs, active });
  }, [root, tabs, active, saveSession]);

  // Watch the project and re-anchor a file's comments when it changes on disk
  // (external edits, or the agent's own writes).
  useEffect(() => {
    startWatching(root).catch(() => {});
    const offs = [
      listen<{ file: string }>("file-changed", (event) => {
        const { file } = event.payload;
        reanchorFile(root, file)
          .then((list) => useComments.getState().replaceForFile(file, list))
          .catch(() => {});
      }),
      // An agent mutated comments via the `reado` CLI — reload the list so the
      // UI reflects done/reply/add without a manual refresh.
      listen("comments-changed", () => {
        useComments.getState().load(root);
      }),
    ];
    return () => {
      offs.forEach((p) => p.then((off) => off()));
    };
  }, [root]);

  const tool = useWorkspace((s) => s.tool);
  const showHidden = useProject((s) => s.showHidden);
  const setShowHidden = useProject((s) => s.setShowHidden);
  const terminalOpen = useTerminals((s) => s.open);
  const noComments = useComments((s) => s.comments.length === 0);
  const openTaskCount = useComments(
    (s) => s.comments.filter((c) => c.kind === "task" && c.state === "open").length,
  );
  const prevOpenTasks = useRef(openTaskCount);

  // Notify when the open-task count drops (the agent resolved something).
  useEffect(() => {
    if (openTaskCount < prevOpenTasks.current) notifyResolved(openTaskCount);
    prevOpenTasks.current = openTaskCount;
  }, [openTaskCount]);

  // First-comment hint: shown while a file is open and the project has no
  // comments yet; it disappears once the first comment exists (spec).
  const showEmptyHint = active != null && noComments;

  return (
    <div
      className="grid h-full overflow-hidden"
      style={{ gridTemplateColumns: tool ? "48px 264px 1fr" : "48px 1fr" }}
    >
      <ActivityBar />
      {tool && (
        <aside className="flex min-w-0 flex-col overflow-hidden border-r border-line bg-surface">
          <header className="flex h-9 flex-none items-center justify-between border-b border-line pr-2 pl-3 text-xs font-medium tracking-wide text-muted uppercase">
            <span>{t(PANEL_TITLE[tool])}</span>
            {tool === "files" && (
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
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {tool === "files" && <FileTree />}
            {tool === "search" && <SearchPanel />}
            {tool === "comments" && <CommentsPanel />}
            {tool === "orphans" && <OrphansPanel />}
          </div>
        </aside>
      )}
      <main className="flex min-w-0 flex-col overflow-hidden">
        <Tabs />
        <Breadcrumb />
        <div className="relative flex-1 overflow-hidden">
          <Editor />
          {/* Discreet first-comment hint — replaced by the annotation flow in
              phase 3, hidden once any file is open. */}
          {showEmptyHint && (
            <p
              role="note"
              className="pointer-events-none absolute bottom-8 left-1/2 m-0 max-w-[420px] -translate-x-1/2 rounded-lg border border-line bg-overlay px-4 py-3 text-center text-sm text-muted shadow-[var(--shadow)]"
            >
              {t("empty.firstComment")}
            </p>
          )}
        </div>
        {terminalOpen && <TerminalPanel />}
        <StatusBar />
      </main>
      <Palette />
      <Settings />
      <GitignorePrompt />
    </div>
  );
}

/**
 * Bridge from the native OS menu to in-app commands. The Rust side emits a
 * `menu` event with the clicked item's id; here we map each id to the matching
 * action, reusing the same stores/helpers the keyboard shortcuts and palette use.
 */
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  usePalette,
  useProject,
  useSettings,
  useWorkspace,
  useEditorActions,
  type ThemeName,
  type SettingsState,
} from "./store";
import { useTerminals } from "./terminals";
import {
  formatDocument,
  saveDocument,
  openFind,
  openReplace,
  openGotoLine,
  toggleLineComment,
  addNextOccurrence,
  selectAllOccurrences,
  addCursorAbove,
  addCursorBelow,
  addCursorsToLineEnds,
  duplicateSelection,
  expandSelectionCmd,
  shrinkSelectionCmd,
  goToBracket,
  gotoLastEdit,
  copyLineUpCmd,
  copyLineDownCmd,
  moveLineUpCmd,
  moveLineDownCmd,
  findReferencesAtCursor,
  goToDefinitionAtCursor,
  goToTypeDefinitionAtCursor,
  goToImplementationAtCursor,
  toggleBlockCommentCmd,
  nextProblem,
  prevProblem,
  revertFile,
  newFile,
  saveAs,
} from "./docInfo";
import { checkForUpdates } from "./updater";
import { launchAgent, runInTerminal, clearTerminal, restartTerminal } from "./agents";
import { composeReviewPrompt } from "./review";
import { useComments, openCount } from "./comments";
import { closeProject, openInNewWindow, pickFolderAndOpen, openFileDialog } from "./window";

const WEBSITE = "https://reado.watermelon-studio.it";
const ISSUES = "https://github.com/WatermelonBros/reado/issues";
const RELEASES = "https://github.com/WatermelonBros/reado/releases";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
const nudgeZoom = (delta: number) =>
  useSettings.getState().set({ zoom: clampZoom(useSettings.getState().zoom + delta) });

/** Run an app-menu command by id — shared by the native menu (forwarded as a
 *  `menu` event) and the rendered Win/Linux menu bar in the title bar. */
export function runMenuCommand(id: string): void {
    const palette = usePalette.getState();
    const project = useProject.getState();
    const workspace = useWorkspace.getState();
    const settings = useSettings.getState();
    const terminals = useTerminals.getState();

    // Theme submenu: ids like "theme:dark".
    if (id.startsWith("theme:")) {
      settings.set({ theme: id.slice(6) as ThemeName, mode: "manual" });
      return;
    }
    // Auto Save submenu: ids like "autosave:afterDelay".
    if (id.startsWith("autosave:")) {
      settings.set({ autoSave: id.slice(9) as SettingsState["autoSave"] });
      return;
    }

    switch (id) {
      // App
      case "settings":
        palette.toggleSettings(true);
        break;
      case "checkUpdates":
        void checkForUpdates(true);
        break;

      // File
      case "window:new":
        openInNewWindow();
        break;
      case "openFile":
        void openFileDialog();
        break;
      case "openFolder":
        void pickFolderAndOpen();
        break;
      case "openRecent":
        palette.open("recents");
        break;
      case "closeProject":
        void closeProject();
        break;
      case "newFile":
        void newFile();
        break;
      case "saveAs":
        void saveAs();
        break;
      case "save":
        saveDocument();
        break;
      case "format":
        void formatDocument();
        break;
      case "closeEditor":
        if (project.active) project.close(project.active);
        break;
      case "reopenClosed":
        project.reopenClosed();
        break;
      case "revert":
        revertFile();
        break;

      // Edit
      case "find":
        openFind();
        break;
      case "edit:replace":
        openReplace();
        break;
      case "edit:findInFiles":
      case "edit:replaceInFiles":
        workspace.searchFor("");
        break;
      case "edit:toggleComment":
        toggleLineComment();
        break;
      case "edit:toggleBlockComment":
        toggleBlockCommentCmd();
        break;
      case "gotoLine":
        openGotoLine();
        break;

      // Selection
      case "sel:expand":
        expandSelectionCmd();
        break;
      case "sel:shrink":
        shrinkSelectionCmd();
        break;
      case "sel:addNext":
        addNextOccurrence();
        break;
      case "sel:allOccurrences":
        selectAllOccurrences();
        break;
      case "sel:cursorAbove":
        addCursorAbove();
        break;
      case "sel:cursorBelow":
        addCursorBelow();
        break;
      case "sel:lineEnds":
        addCursorsToLineEnds();
        break;
      case "sel:duplicate":
        duplicateSelection();
        break;
      case "sel:explain":
        useEditorActions.getState().requestExplain();
        break;
      case "sel:copyUp":
        copyLineUpCmd();
        break;
      case "sel:copyDown":
        copyLineDownCmd();
        break;
      case "sel:moveUp":
        moveLineUpCmd();
        break;
      case "sel:moveDown":
        moveLineDownCmd();
        break;

      // Go
      case "palette:files":
        palette.open("files");
        break;
      case "palette:commands":
        palette.open("commands");
        break;
      case "palette:search":
        palette.open("search");
        break;
      case "palette:symbols":
        palette.open("symbols");
        break;
      case "palette:wsymbols":
        palette.open("wsymbols");
        break;
      case "gotodef":
        goToDefinitionAtCursor();
        break;
      case "go:peek":
        useEditorActions.getState().requestPeek();
        break;
      case "go:typedef":
        goToTypeDefinitionAtCursor();
        break;
      case "go:impl":
        goToImplementationAtCursor();
        break;
      case "go:references":
        findReferencesAtCursor();
        break;
      case "go:bracket":
        goToBracket();
        break;
      case "go:lastEdit":
        gotoLastEdit();
        break;
      case "go:nextProblem":
        nextProblem();
        break;
      case "go:prevProblem":
        prevProblem();
        break;
      case "go:nextTab":
        project.cycleTab(1);
        break;
      case "go:prevTab":
        project.cycleTab(-1);
        break;
      case "go:back":
        project.goBack();
        break;
      case "go:forward":
        project.goForward();
        break;

      // View
      case "view:sidebar":
        workspace.toggleSidebar();
        break;
      case "view:split":
        project.openSplit();
        break;
      case "view:wrap":
        settings.set({ wrap: !settings.wrap });
        break;
      case "view:whitespace":
        settings.set({ renderWhitespace: !settings.renderWhitespace });
        break;
      case "view:focus":
        settings.set({ focusMode: !settings.focusMode });
        break;
      case "view:readingWidth":
        settings.set({ readingWidth: !settings.readingWidth });
        break;
      case "view:activityBar":
        settings.set({ showActivityBar: !settings.showActivityBar });
        break;
      case "view:statusBar":
        settings.set({ showStatusBar: !settings.showStatusBar });
        break;
      case "view:breadcrumbs":
        settings.set({ showBreadcrumbs: !settings.showBreadcrumbs });
        break;
      case "view:open:files":
        workspace.selectTool("files");
        break;
      case "view:open:search":
        workspace.selectTool("search");
        break;
      case "view:open:comments":
        workspace.selectTool("comments");
        break;
      case "view:open:outline":
        workspace.selectTool("outline");
        break;
      case "view:open:git":
        workspace.selectTool("git");
        break;
      case "view:open:extensions":
        workspace.selectTool("extensions");
        break;
      case "graph":
        workspace.toggleGraph(true);
        break;
      case "docs":
        workspace.toggleDocs(true);
        break;
      case "zoom:in":
        nudgeZoom(0.1);
        break;
      case "zoom:out":
        nudgeZoom(-0.1);
        break;
      case "zoom:reset":
        settings.set({ zoom: 1 });
        break;

      // Terminal
      case "terminal":
        terminals.toggle();
        break;
      case "terminal:new":
        terminals.add();
        break;
      case "terminal:split":
        terminals.split();
        break;
      case "terminal:clear":
        clearTerminal();
        break;
      case "terminal:restart":
        restartTerminal();
        break;
      case "terminal:launch:claude":
        void launchAgent("claude-code", "claude");
        break;
      case "terminal:launch:codex":
        void launchAgent("codex", "codex");
        break;
      case "terminal:launch:copilot":
        void launchAgent("copilot", "copilot");
        break;
      case "terminal:sendReview": {
        const count = openCount(useComments.getState().comments);
        runInTerminal(composeReviewPrompt(count));
        break;
      }

      // Help
      case "help:shortcuts":
        palette.toggleShortcuts(true);
        break;
      case "help:website":
        void openUrl(WEBSITE);
        break;
      case "help:report":
        void openUrl(ISSUES);
        break;
      case "help:releases":
        void openUrl(RELEASES);
        break;
    }
}

/** Start handling native-menu events; returns an unlisten function. */
export function listenForMenu(): Promise<() => void> {
  return listen<string>("menu", ({ payload: id }) => runMenuCommand(id));
}

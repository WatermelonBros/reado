/**
 * Bridge from the native OS menu to in-app commands. The Rust side emits a
 * `menu` event with the clicked item's id; here we map each id to the matching
 * action, reusing the same stores/helpers the keyboard shortcuts and palette use.
 */
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  usePalette,
  useProject,
  useSettings,
  useWorkspace,
  type ThemeName,
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
  copyLineUpCmd,
  copyLineDownCmd,
  moveLineUpCmd,
  moveLineDownCmd,
  findReferencesAtCursor,
  goToDefinitionAtCursor,
} from "./docInfo";
import { checkForUpdates } from "./updater";
import { openProject, closeProject } from "./window";

const WEBSITE = "https://reado.watermelon-studio.it";
const ISSUES = "https://github.com/WatermelonBros/reado/issues";
const RELEASES = "https://github.com/WatermelonBros/reado/releases";

/** Prompt for a folder and open it in this window. */
async function pickAndOpenFolder() {
  const selected = await openDialog({ directory: true, multiple: false });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (path) await openProject(path);
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
const nudgeZoom = (delta: number) =>
  useSettings.getState().set({ zoom: clampZoom(useSettings.getState().zoom + delta) });

/** Start handling native-menu events; returns an unlisten function. */
export function listenForMenu(): Promise<() => void> {
  return listen<string>("menu", ({ payload: id }) => {
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

    switch (id) {
      // App
      case "settings":
        palette.toggleSettings(true);
        break;
      case "checkUpdates":
        void checkForUpdates(true);
        break;

      // File
      case "openFolder":
        void pickAndOpenFolder();
        break;
      case "closeProject":
        void closeProject();
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
      case "gotoLine":
        openGotoLine();
        break;

      // Selection
      case "sel:addNext":
        addNextOccurrence();
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
      case "gotodef":
        goToDefinitionAtCursor();
        break;
      case "go:references":
        findReferencesAtCursor();
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
      case "view:focus":
        settings.set({ focusMode: !settings.focusMode });
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

      // Help
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
  });
}

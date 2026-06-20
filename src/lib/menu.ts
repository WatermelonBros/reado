/**
 * Bridge from the native OS menu to in-app commands. The Rust side emits a
 * `menu` event with the clicked item's id; here we map each id to the matching
 * action, reusing the same stores/helpers the keyboard shortcuts and palette use.
 */
import { listen } from "@tauri-apps/api/event";
import { usePalette, useProject, useSettings, useWorkspace } from "./store";
import { useTerminals } from "./terminals";
import { formatDocument, saveDocument, openFind, goToDefinitionAtCursor } from "./docInfo";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
const nudgeZoom = (delta: number) =>
  useSettings.getState().set({ zoom: clampZoom(useSettings.getState().zoom + delta) });

/** Start handling native-menu events; returns an unlisten function. */
export function listenForMenu(): Promise<() => void> {
  return listen<string>("menu", ({ payload: id }) => {
    const palette = usePalette.getState();
    switch (id) {
      case "settings":
        palette.toggleSettings(true);
        break;
      case "save":
        saveDocument();
        break;
      case "format":
        void formatDocument();
        break;
      case "closeEditor": {
        const active = useProject.getState().active;
        if (active) useProject.getState().close(active);
        break;
      }
      case "find":
        openFind();
        break;
      case "palette:files":
        palette.open("files");
        break;
      case "palette:commands":
        palette.open("commands");
        break;
      case "palette:search":
        palette.open("search");
        break;
      case "gotodef":
        goToDefinitionAtCursor();
        break;
      case "terminal":
        useTerminals.getState().toggle();
        break;
      case "graph":
        useWorkspace.getState().toggleGraph(true);
        break;
      case "docs":
        useWorkspace.getState().toggleDocs(true);
        break;
      case "zoom:in":
        nudgeZoom(0.1);
        break;
      case "zoom:out":
        nudgeZoom(-0.1);
        break;
      case "zoom:reset":
        useSettings.getState().set({ zoom: 1 });
        break;
    }
  });
}

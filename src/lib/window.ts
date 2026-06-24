/**
 * Window management.
 *
 * A project opens either in the current window (navigating via the URL hash,
 * like VS Code) or in a brand-new OS window. The project path is encoded in the
 * hash; `App` re-routes from the launcher to the workspace on load and on
 * hashchange — so a new window pointed at `#project=…` boots straight into it.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { useRecents, useProject } from "./store";
import { currentOS } from "./extensions";
import { t } from "../i18n";

// A per-window salt keeps new-window labels unique even if two windows spawn a
// window in the same millisecond (each runs its own module with windowSeq = 0).
const WIN_SALT = (globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 8);
let windowSeq = 0;

/** Open a fresh OS window — empty (launcher) or pointed at a project. The label
 * matches the `project_*` capability glob so it inherits the app permissions. */
export function openInNewWindow(projectPath?: string): void {
  const label = `project_${WIN_SALT}_${Date.now().toString(36)}_${windowSeq++}`;
  const hash = projectPath ? `#project=${encodeURIComponent(projectPath)}` : "";
  const mac = currentOS() === "mac";
  new WebviewWindow(label, {
    url: `index.html${hash}`,
    title: "Reado",
    width: 1280,
    height: 832,
    minWidth: 720,
    minHeight: 480,
    // Match the main window's custom chrome: native traffic lights over a
    // transparent bar on macOS, no native decorations elsewhere.
    titleBarStyle: mac ? "overlay" : undefined,
    decorations: mac,
  });
}

/** Pick a folder, then ask whether to open it here or in a new window. */
export async function pickFolderAndOpen(): Promise<void> {
  const selected = await openDialog({ directory: true, multiple: false });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;
  const newWindow = await ask(t("window.openWhere"), {
    title: t("window.openFolderTitle"),
    okLabel: t("window.newWindow"),
    cancelLabel: t("window.thisWindow"),
  });
  useRecents.getState().touch(path);
  if (newWindow) openInNewWindow(path);
  else await openProject(path);
}

/** Pick a single file (defaulting into the open project) and open it. Reads are
 *  confined to the project root in Rust, so files outside it won't load. */
export async function openFileDialog(): Promise<void> {
  const root = useProject.getState().root;
  const selected = await openDialog({
    directory: false,
    multiple: false,
    defaultPath: root || undefined,
  });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (path) useProject.getState().open(path);
}

/** The project path encoded in the current window's URL hash, if any. */
export function currentProjectPath(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/project=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Open a project in the current window (no new window). */
export async function openProject(path: string): Promise<void> {
  // Setting the hash fires `hashchange`, which App re-routes on — switching to
  // the workspace without a full reload.
  window.location.hash = `project=${encodeURIComponent(path)}`;
}

/** Return to the launcher (recent-projects screen) in the current window. */
export async function closeProject(): Promise<void> {
  window.location.hash = "";
}

/** Set the OS window title to the project name. On macOS the title bar is an
 *  Overlay, so the native title text would render centered *over* the Command
 *  Center pill — keep it empty there (the pill already shows the project). Other
 *  platforms have no native title strip but their taskbar/switcher uses it. */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    const text =
      currentOS() === "mac" ? "" : title ? `${title} — Reado` : "Reado";
    await getCurrentWindow().setTitle(text);
  } catch {
    /* non-fatal in the browser dev context */
  }
}

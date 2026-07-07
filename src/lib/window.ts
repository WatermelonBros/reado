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

/** Open a fresh OS window — empty (launcher), pointed at a project, or pointed at
 * a project with a specific file to open. The label matches the `project_*`
 * capability glob so it inherits the app permissions. */
export function openInNewWindow(projectPath?: string, file?: string): void {
  const label = `project_${WIN_SALT}_${Date.now().toString(36)}_${windowSeq++}`;
  const params: string[] = [];
  if (projectPath) params.push(`project=${encodeURIComponent(projectPath)}`);
  if (file) params.push(`open=${encodeURIComponent(file)}`);
  const hash = params.length ? `#${params.join("&")}` : "";
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

/** Open a known project path, honouring the current window. If this window is
 *  empty (the launcher), reuse it silently. If a project is already open here,
 *  ask — defaulting to THIS window (cancel opens a new one). Used by both the
 *  Open Folder flow and the recents lists. */
export async function openProjectHere(path: string): Promise<void> {
  useRecents.getState().touch(path);
  // Nothing open in this window yet → just open here, no prompt.
  if (!currentProjectPath()) {
    await openProject(path);
    return;
  }
  // A project is already open: ask, with "This window" as the default action
  // (the ok/confirm button). Cancel opens a new window instead.
  const here = await ask(t("window.openWhere"), {
    title: t("window.openFolderTitle"),
    okLabel: t("window.thisWindow"),
    cancelLabel: t("window.newWindow"),
  });
  if (here) await openProject(path);
  else openInNewWindow(path);
}

/** Pick a folder, then open it with the window-choice logic above. */
export async function pickFolderAndOpen(): Promise<void> {
  const selected = await openDialog({ directory: true, multiple: false });
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;
  await openProjectHere(path);
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

/** A file to open on load (from an OS "open with Reado"), encoded in the hash. */
export function currentOpenFile(): string | null {
  const match = window.location.hash.match(/[#&]open=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Drop the `open=` param once its file has been opened, so a reload doesn't
 *  re-open it (the project stays, so this never remounts the workspace). */
export function clearOpenFile(): void {
  const proj = currentProjectPath();
  window.location.hash = proj ? `project=${encodeURIComponent(proj)}` : "";
}

/** Open a specific file (from an OS file association) at its project root: reuse
 *  this window if it's the empty launcher, else open a dedicated new window. */
export async function openPathTarget(root: string, file: string): Promise<void> {
  useRecents.getState().touch(root);
  if (!currentProjectPath()) {
    window.location.hash = `project=${encodeURIComponent(root)}&open=${encodeURIComponent(file)}`;
  } else {
    openInNewWindow(root, file);
  }
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

/**
 * Window management.
 *
 * Reado uses one window per project (per the spec). Opening a project either
 * focuses its existing window or spawns a new one pointing at the project via
 * the URL hash. If window creation is unavailable (e.g. permissions during
 * development), it falls back to navigating the current window.
 */
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** The project path encoded in the current window's URL hash, if any. */
export function currentProjectPath(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/project=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** A Tauri-safe window label derived from a filesystem path. */
function labelFor(path: string): string {
  // Labels allow only [a-zA-Z0-9-/:_]; hash the path to a compact, valid id.
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) | 0;
  }
  return `project_${(hash >>> 0).toString(36)}`;
}

const projectUrl = (path: string) =>
  `index.html#project=${encodeURIComponent(path)}`;

/**
 * Open a project in its own window, focusing it if already open. Falls back to
 * navigating the current window when window creation is not possible.
 */
export async function openProject(path: string): Promise<void> {
  const label = labelFor(path);
  try {
    const existing = await getAllWebviewWindows();
    const match = existing.find((w) => w.label === label);
    if (match) {
      await match.setFocus();
      return;
    }
    const win = new WebviewWindow(label, {
      url: projectUrl(path),
      title: path.split(/[\\/]/).pop() ?? "Reado",
      width: 1280,
      height: 832,
      minWidth: 720,
      minHeight: 480,
    });
    win.once("tauri://error", () => {
      // Creation failed — fall back to navigating this window.
      window.location.assign(projectUrl(path));
    });
  } catch {
    window.location.assign(projectUrl(path));
  }
}

/** Set the OS window title to the project name. */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title ? `${title} — Reado` : "Reado");
  } catch {
    /* non-fatal in the browser dev context */
  }
}

/**
 * Window management.
 *
 * Reado is a single-window app: opening a project navigates the current window
 * (like VS Code) rather than spawning a new one. The project path is encoded in
 * the URL hash; `App` re-routes from the launcher to the workspace on hashchange.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";

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

/** Set the OS window title to the project name. */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title ? `${title} — Reado` : "Reado");
  } catch {
    /* non-fatal in the browser dev context */
  }
}

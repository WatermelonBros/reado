/**
 * Signed auto-updates.
 *
 * Checks the configured update endpoint; if a newer, signature-verified release
 * exists, offers to download, install and relaunch. Runs silently on launch and
 * on demand from the command palette. Fails quietly when no update server is
 * reachable (e.g. in development).
 */
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

/**
 * Check for updates. When `interactive`, surface "up to date" / errors; when
 * silent (startup), only prompt if an update is actually available.
 */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  try {
    const update = await check();
    if (!update) {
      if (interactive) {
        await message("Reado is up to date.", { title: "Reado", kind: "info" });
      }
      return;
    }
    const install = await ask(
      `Reado ${update.version} is available${update.body ? `:\n\n${update.body}` : ""}\n\nInstall and restart now?`,
      { title: "Update available", kind: "info" },
    );
    if (!install) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    if (interactive) {
      await message(`Could not check for updates.\n${String(error)}`, {
        title: "Reado",
        kind: "error",
      });
    }
  }
}

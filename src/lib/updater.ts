/**
 * Signed auto-updates.
 *
 * Checks the configured update endpoint; if a newer, signature-verified release
 * exists, hands it to the update store, which drives the custom in-app update
 * UI (modal + indicator + toast). Runs silently on launch and on demand from the
 * command palette. Fails quietly when no update server is reachable (e.g. dev).
 */
import { check } from "@tauri-apps/plugin-updater";
import { useUpdate } from "./update";

/**
 * Check for updates. When `interactive`, surface "up to date" / errors via a
 * toast; when silent (startup), only open the modal if an update is available.
 */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  try {
    const update = await check();
    if (!update) {
      if (interactive)
        useUpdate.getState().setToast({ kind: "info", text: "Reado is up to date." });
      return;
    }
    // Don't re-nag for a version already surfaced: a background (periodic/focus)
    // check stays quiet, while a manual check reopens the modal.
    const st = useUpdate.getState();
    if (st.version === update.version) {
      if (interactive) st.reopen();
      return;
    }
    st.setAvailable(update);
  } catch (error) {
    if (interactive) {
      useUpdate
        .getState()
        .setToast({ kind: "error", text: `Could not check for updates. ${String(error)}` });
    }
  }
}

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
import { createLogger } from "./logger";

const log = createLogger("updater");

/**
 * Check for updates. When `interactive`, surface "up to date" / errors via a
 * toast; when silent (startup), only open the modal if an update is available.
 */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  log.info("update check", { interactive });
  try {
    const update = await check();
    if (!update) {
      log.info("up to date");
      if (interactive)
        useUpdate.getState().setToast({ kind: "info", text: "Reado is up to date." });
      return;
    }
    log.info("update available", { version: update.version });
    // Don't re-nag for a version already surfaced: a background (periodic/focus)
    // check stays quiet, while a manual check reopens the modal.
    const st = useUpdate.getState();
    if (st.version === update.version) {
      if (interactive) st.reopen();
      return;
    }
    st.setAvailable(update);
  } catch (error) {
    log.error("update check failed", { error: String(error) });
    if (interactive) {
      useUpdate
        .getState()
        .setToast({ kind: "error", text: `Could not check for updates. ${String(error)}` });
    }
  }
}

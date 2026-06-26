/**
 * Update state for the custom (in-app) update experience.
 *
 * `updater.ts` checks the endpoint and, when a signed update is available, fills
 * this store instead of opening native dialogs. The UI renders a styled modal;
 * dismissing it keeps a small "update available" indicator so the user can come
 * back to it. A lightweight toast covers the "up to date" / error feedback.
 */
import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createLogger } from "./logger";

const log = createLogger("updater");

interface UpdateState {
  /** The pending update handle, or null when up to date. */
  update: Update | null;
  version: string | null;
  notes: string | null;
  /** Whether the update modal is open. */
  open: boolean;
  /** Dismissed but still available — show the indicator. */
  dismissed: boolean;
  installing: boolean;
  toast: { kind: "info" | "error"; text: string } | null;

  setAvailable: (u: Update) => void;
  reopen: () => void;
  dismiss: () => void;
  setToast: (t: { kind: "info" | "error"; text: string }) => void;
  clearToast: () => void;
  install: () => Promise<void>;
}

export const useUpdate = create<UpdateState>((set, get) => ({
  update: null,
  version: null,
  notes: null,
  open: false,
  dismissed: false,
  installing: false,
  toast: null,

  setAvailable: (u) =>
    set({ update: u, version: u.version, notes: u.body ?? null, open: true, dismissed: false }),
  reopen: () => set({ open: true }),
  dismiss: () => set({ open: false, dismissed: true }),
  setToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),

  install: async () => {
    const u = get().update;
    if (!u) return;
    set({ installing: true });
    log.info("download + install", { version: u.version });
    try {
      await u.downloadAndInstall();
      log.info("installed; relaunching", { version: u.version });
      await relaunch();
    } catch (e) {
      log.error("install failed", { version: u.version, error: String(e) });
      set({ installing: false, open: false, toast: { kind: "error", text: String(e) } });
    }
  },
}));

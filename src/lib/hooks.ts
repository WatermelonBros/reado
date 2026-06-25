/** Cross-cutting React hooks: theme application and global keyboard shortcuts. */
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useSettings,
  usePalette,
  useEditorActions,
  useProject,
  useWorkspace,
  type ThemeName,
} from "./store";
import { useTerminals } from "./terminals";
import { useExtensions } from "./extensions";
import { formatDocument } from "./docInfo";
import { checkForUpdates } from "./updater";

/** The dark Reado themes — used to match the native window (title bar) chrome. */
const DARK_THEMES: ThemeName[] = ["reado-dark", "reado-high-contrast"];

/** Resolve the active theme from settings, OS preference and time of day. */
function resolveTheme(
  mode: string,
  theme: ThemeName,
  lightTheme: ThemeName,
  darkTheme: ThemeName,
): ThemeName {
  if (mode === "manual") return theme;
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? darkTheme
      : lightTheme;
  }
  // "auto" — Trust Reado: light during the day, dark in the evening/night.
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? lightTheme : darkTheme;
}

/** Apply the resolved theme to <html> and keep it live (system + time of day). */
export function useApplyTheme(): void {
  const { mode, theme, lightTheme, darkTheme } = useSettings();

  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(mode, theme, lightTheme, darkTheme);
      document.documentElement.dataset.theme = resolved;
      // Match the native window chrome (notably the Windows title bar, which is
      // otherwise the default light bar even under a dark theme).
      getCurrentWindow()
        .setTheme(DARK_THEMES.includes(resolved) ? "dark" : "light")
        .catch(() => {});
    };
    apply();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    // Re-evaluate the time-of-day theme once a minute in "auto" mode.
    const timer = mode === "auto" ? window.setInterval(apply, 60_000) : undefined;
    return () => {
      mq.removeEventListener("change", apply);
      if (timer) clearInterval(timer);
    };
  }, [mode, theme, lightTheme, darkTheme]);
}

/** Periodically check for updates while the app stays open, plus when the window
 * regains focus, so the update prompt appears without needing a restart. */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
    const THROTTLE_MS = 30 * 60 * 1000; // at most once per 30 min (focus churn)
    let last = 0;
    const run = () => {
      const now = Date.now();
      if (now - last < THROTTLE_MS) return;
      last = now;
      void checkForUpdates(false);
    };
    // First check shortly after launch (covers project windows, which otherwise
    // never checked), then on an interval and whenever the window is refocused.
    const initial = window.setTimeout(run, 4000);
    const interval = window.setInterval(run, INTERVAL_MS);
    window.addEventListener("focus", run);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", run);
    };
  }, []);
}

/** Apply the interface zoom factor to the document. */
export function useApplyZoom(): void {
  const zoom = useSettings((s) => s.zoom);
  useEffect(() => {
    // Use the webview's native zoom (like a browser's Cmd+/-): it scales the
    // whole UI *and* keeps pointer hit-testing correct. CSS `zoom` does not —
    // it desyncs CodeMirror's coordinate mapping so clicks land on the wrong
    // line and Cmd+click resolves the wrong token. Fall back to CSS `zoom`
    // only outside Tauri (e.g. the browser dev/test context).
    getCurrentWebview()
      .setZoom(zoom)
      .catch(() => {
        document.documentElement.style.zoom = String(zoom);
      });
  }, [zoom]);
}

/** Keep global preferences in sync across windows. zustand `persist` writes to
 *  localStorage (shared per origin), but an already-open window won't see another
 *  window's change until it re-reads. The `storage` event fires in *other*
 *  windows on every write, so rehydrating the matching store there applies the
 *  change live — e.g. switching theme or toggling a setting updates every window.
 *  (Per-window UI like the sidebar tool and terminal layout are intentionally
 *  not synced.) */
export function useCrossWindowSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "reado.settings") void useSettings.persist.rehydrate();
      else if (e.key === "reado.extensions") void useExtensions.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

/** Interface zoom bounds. */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

/** Bind Reado's global keyboard shortcuts. */
export function useGlobalShortcuts(): void {
  const open = usePalette((s) => s.open);
  const toggleSettings = usePalette((s) => s.toggleSettings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Format Document (Shift+Alt+F), like VS Code — not a Cmd/Ctrl shortcut.
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void formatDocument();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // Ctrl+Tab / Ctrl+Shift+Tab cycle the open tabs (Ctrl, not Cmd, on macOS
      // too — matching editors).
      if (e.ctrlKey && key === "tab") {
        e.preventDefault();
        useProject.getState().cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
      // Back / forward through the navigation history (Cmd/Ctrl+Alt+←/→).
      if (e.altKey && key === "arrowleft") {
        e.preventDefault();
        useProject.getState().goBack();
        return;
      } else if (e.altKey && key === "arrowright") {
        e.preventDefault();
        useProject.getState().goForward();
        return;
      }
      // Interface zoom: Cmd/Ctrl with +/=, -, or 0 to reset.
      if (key === "=" || key === "+") {
        e.preventDefault();
        const z = useSettings.getState().zoom;
        useSettings.getState().set({ zoom: clampZoom(z + 0.1) });
        return;
      } else if (key === "-") {
        e.preventDefault();
        const z = useSettings.getState().zoom;
        useSettings.getState().set({ zoom: clampZoom(z - 0.1) });
        return;
      } else if (key === "0") {
        e.preventDefault();
        useSettings.getState().set({ zoom: 1 });
        return;
      }
      if (key === "p") {
        e.preventDefault();
        open("files");
      } else if (key === "k") {
        e.preventDefault();
        open("commands");
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        open("search");
      } else if (key === "o" && e.shiftKey) {
        e.preventDefault();
        open("symbols");
      } else if (key === "m" && e.shiftKey) {
        // Create a comment from the current selection (or cursor line).
        e.preventDefault();
        useEditorActions.getState().requestCompose();
      } else if (key === ",") {
        e.preventDefault();
        toggleSettings(true);
      } else if (key === "j") {
        // Toggle the integrated terminal.
        e.preventDefault();
        useTerminals.getState().toggle();
      } else if (key === "b") {
        // Toggle the sidebar.
        e.preventDefault();
        useWorkspace.getState().toggleSidebar();
      } else if (key === "t" && e.shiftKey) {
        // Reopen the most recently closed tab.
        e.preventDefault();
        useProject.getState().reopenClosed();
      } else if (key === "t") {
        // Go to symbol in the whole project.
        e.preventDefault();
        open("wsymbols");
      } else if (key === "\\") {
        // Toggle the split (side-by-side) editor.
        e.preventDefault();
        const p = useProject.getState();
        if (p.splitPath) p.closeSplit();
        else p.openSplit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggleSettings]);

  // Mouse back/forward buttons (X1/X2) should walk Reado's read-history, not the
  // webview's page history (which would jump to the launcher). preventDefault on
  // mousedown stops the navigation; we act on mouseup so it fires once.
  useEffect(() => {
    const isNav = (b: number) => b === 3 || b === 4;
    const block = (e: MouseEvent) => {
      if (isNav(e.button)) e.preventDefault();
    };
    const onUp = (e: MouseEvent) => {
      if (!isNav(e.button)) return;
      e.preventDefault();
      const p = useProject.getState();
      if (e.button === 3) p.goBack();
      else p.goForward();
    };
    window.addEventListener("mousedown", block);
    window.addEventListener("auxclick", block);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousedown", block);
      window.removeEventListener("auxclick", block);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
}

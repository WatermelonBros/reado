/** Cross-cutting React hooks: theme application and global keyboard shortcuts. */
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useSettings, usePalette, useEditorActions, type ThemeName } from "./store";
import { useTerminals } from "./terminals";
import { formatDocument } from "./docInfo";

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
      document.documentElement.dataset.theme = resolveTheme(
        mode,
        theme,
        lightTheme,
        darkTheme,
      );
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggleSettings]);
}

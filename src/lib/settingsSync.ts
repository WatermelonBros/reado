/**
 * Settings sync via a portable bundle (clipboard / pasted text).
 *
 * Exports the user's global preferences + disabled-extension list as a versioned
 * JSON bundle and re-applies it on another machine. Deliberately clipboard-based
 * (not file I/O) to avoid an unconfined filesystem surface. Never includes
 * secrets or project-local state (recents, sessions, window layout, `.reado/`).
 */
import { useSettings, type SettingsState } from "./store";
import { useExtensions } from "./extensions";
import { prompt } from "./prompt";
import { t } from "../i18n";

const BUNDLE_VERSION = 1;

/** The settings fields that travel between machines (everything user-facing and
 *  machine-independent). `set` and any transient fields are excluded. */
const SETTINGS_KEYS = [
  "theme",
  "lightTheme",
  "darkTheme",
  "mode",
  "codeFont",
  "readingWidth",
  "focusMode",
  "wrap",
  "stickyScroll",
  "zoom",
  "versionReado",
  "gitignoreDontAsk",
  "completionSound",
  "autoSave",
  "showActivityBar",
  "showStatusBar",
  "showBreadcrumbs",
  "renderWhitespace",
] as const satisfies readonly (keyof SettingsState)[];

interface Bundle {
  version: number;
  settings: Partial<SettingsState>;
  extensionsDisabled: string[];
}

export function buildBundle(): Bundle {
  const s = useSettings.getState();
  const settings = Object.fromEntries(
    SETTINGS_KEYS.map((k) => [k, s[k]]),
  ) as Partial<SettingsState>;
  return { version: BUNDLE_VERSION, settings, extensionsDisabled: useExtensions.getState().disabled };
}

/** Parse + apply a bundle; returns false on malformed input (no partial apply). */
export function applyBundle(json: string): boolean {
  let b: Bundle;
  try {
    b = JSON.parse(json) as Bundle;
  } catch {
    return false;
  }
  if (!b || typeof b !== "object" || typeof b.settings !== "object") return false;
  useSettings.getState().set(b.settings);
  if (Array.isArray(b.extensionsDisabled)) {
    useExtensions.setState({ disabled: b.extensionsDisabled });
  }
  return true;
}

/** Copy the current settings bundle to the clipboard. */
export async function exportSettings(): Promise<void> {
  await navigator.clipboard.writeText(JSON.stringify(buildBundle(), null, 2)).catch(() => {});
}

/** Prompt for a pasted bundle and apply it. */
export async function importSettings(): Promise<void> {
  const json = await prompt({
    title: t("sync.importTitle"),
    placeholder: "{ …bundle JSON… }",
    confirmLabel: t("sync.import"),
  });
  if (json) applyBundle(json);
}

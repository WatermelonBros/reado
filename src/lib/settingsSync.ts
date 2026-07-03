/**
 * Settings sync via a portable bundle (clipboard / pasted text).
 *
 * Exports the user's global preferences + disabled-extension list as a versioned
 * JSON bundle and re-applies it on another machine. Deliberately clipboard-based
 * (not file I/O) to avoid an unconfined filesystem surface. Never includes
 * secrets or project-local state (recents, sessions, window layout, `.reado/`).
 */
import { ask } from "@tauri-apps/plugin-dialog";
import { useSettings, type SettingsState } from "./store";
import { useExtensions } from "./extensions";
import { prompt } from "./prompt";
import { t } from "../i18n";
import { createLogger, safeError } from "./logger";

const log = createLogger("settingsSync");

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

/** Parse + validate a bundle. Returns null on malformed input or a newer schema
 *  than this build understands (forward-incompatible). */
export function parseBundle(json: string): Bundle | null {
  let b: Bundle;
  try {
    b = JSON.parse(json) as Bundle;
  } catch (e) {
    log.warn("malformed bundle JSON", { error: safeError(e) });
    return null;
  }
  if (!b || typeof b !== "object" || typeof b.settings !== "object") return null;
  if (typeof b.version === "number" && b.version > BUNDLE_VERSION) return null; // too new
  return b;
}

/** A plain summary of what importing a bundle will change (for confirmation). */
export function summarizeBundle(b: Bundle): string {
  const settings = Object.keys(b.settings ?? {}).length;
  const disabled = Array.isArray(b.extensionsDisabled) ? b.extensionsDisabled.length : 0;
  return t("sync.summary", { settings, disabled });
}

/** Apply a parsed bundle. */
export function applyBundle(b: Bundle): void {
  useSettings.getState().set(b.settings);
  if (Array.isArray(b.extensionsDisabled)) {
    useExtensions.setState({ disabled: b.extensionsDisabled });
  }
  log.info("settings imported", {
    settings: Object.keys(b.settings ?? {}).length,
    disabled: b.extensionsDisabled?.length ?? 0,
  });
}

/** Copy the current settings bundle to the clipboard. */
export async function exportSettings(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(buildBundle(), null, 2));
    log.info("settings exported");
  } catch (e) {
    log.error("settings export failed", { error: safeError(e) });
  }
}

/** Prompt for a pasted bundle, show a summary, and apply it on confirm. */
export async function importSettings(): Promise<void> {
  const json = await prompt({
    title: t("sync.importTitle"),
    placeholder: "{ …bundle JSON… }",
    confirmLabel: t("sync.import"),
  });
  if (!json) return;
  const bundle = parseBundle(json);
  if (!bundle) {
    await ask(t("sync.invalid"), { title: t("sync.import"), kind: "error" });
    return;
  }
  const ok = await ask(summarizeBundle(bundle), {
    title: t("sync.import"),
    okLabel: t("sync.apply"),
  });
  if (ok) applyBundle(bundle);
}

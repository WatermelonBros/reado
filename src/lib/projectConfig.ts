/**
 * Per-project settings (`.reado/config.json`).
 *
 * A small set of reading/preference keys can be overridden per project, so a
 * codebase can keep its own wrap/width/focus/font/versioning. On project open
 * the config is merged over the user's global settings; changes to those keys
 * are written back to the project's config.
 */
import { useSettings, type SettingsState } from "./store";
import { readProjectConfig, writeProjectConfig } from "./api";

/** Settings that are meaningful to override per project. */
const KEYS = ["wrap", "readingWidth", "focusMode", "codeFont", "versionReado"] as const;
type Key = (typeof KEYS)[number];

/** Apply a project's saved overrides over the current (global) settings. */
export async function loadProjectConfig(root: string): Promise<void> {
  const json = await readProjectConfig(root).catch(() => null);
  if (!json) return;
  try {
    const cfg = JSON.parse(json) as Partial<Record<Key, unknown>>;
    const patch: Record<string, unknown> = {};
    for (const k of KEYS) if (cfg[k] !== undefined) patch[k] = cfg[k];
    useSettings.getState().set(patch as Partial<SettingsState>);
  } catch {
    /* malformed config — ignore */
  }
}

/** Persist the per-project subset of settings on change. Returns an unsubscribe. */
export function watchProjectConfig(root: string): () => void {
  let timer: number | undefined;
  const unsub = useSettings.subscribe((s) => {
    const subset: Record<string, unknown> = {};
    for (const k of KEYS) subset[k] = s[k];
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      writeProjectConfig(root, JSON.stringify(subset, null, 2)).catch(() => {});
    }, 600);
  });
  return () => {
    unsub();
    clearTimeout(timer);
  };
}

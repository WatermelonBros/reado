/**
 * Keep Claude Code's theme in step with Reado's — at launch only.
 *
 * The embedded terminal is a light surface in a light interface, but Claude Code
 * defaults to a dark theme (light text), so it renders white-on-white. Claude
 * Code reads a `theme` key from `.claude/settings.local.json` at startup, so we
 * write Reado's current light/dark mode there just before launching it. This
 * only fixes the *start* of a session; a running session isn't re-themed (that
 * would need injecting `/config theme=…`, deliberately out of scope here).
 */
import { readFile, createFile, writeFile } from "./api";

/** Classify a CSS `rgb(...)` background as light or dark by its Rec. 601 luma. */
export function modeFromColor(rgb: string): "light" | "dark" {
  const n = rgb.match(/\d+(?:\.\d+)?/g);
  if (!n || n.length < 3) return "dark";
  const [r, g, b] = n.slice(0, 3).map(Number);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.5 ? "light" : "dark";
}

/** Reado's current effective mode, read from the applied `--bg` token — works for
 *  every theme (sepia, high-contrast, custom) without hard-coding names. */
export function effectiveThemeMode(): "light" | "dark" {
  const probe = document.createElement("span");
  probe.style.backgroundColor = "var(--bg)";
  probe.style.display = "none";
  document.body.appendChild(probe);
  const bg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return modeFromColor(bg);
}

/** Point Claude Code at Reado's current light/dark mode via the project's personal
 *  `.claude/settings.local.json`. Merges (never clobbers other keys) and is a
 *  no-op when already correct or when the file is present but unparseable. */
export async function syncClaudeTheme(root: string): Promise<void> {
  if (!root) return;
  const path = `${root.replace(/[\\/]+$/, "")}/.claude/settings.local.json`;
  // Distinguish "no file yet" from "read failed": a transient read rejection
  // (I/O blip, permission, or another Claude Code instance's brief unlink window
  // during a write-temp+rename) must NOT be treated as an empty file, or we'd
  // overwrite real settings (permissions, env, hooks) with a bare {theme}.
  let obj: Record<string, unknown> = {};
  let absent = false;
  try {
    const content = await readFile(root, path);
    if (content.kind !== "text") return; // present but not text — leave it alone
    if (content.text.trim()) {
      try {
        const parsed = JSON.parse(content.text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
        obj = parsed as Record<string, unknown>;
      } catch {
        return; // present but not JSON we understand — leave the user's file alone
      }
    }
  } catch {
    // The read failed for some reason. It's only safe to write when the file is
    // genuinely absent — confirm that below via createFile (which errors if the
    // file already exists), so an unreadable-but-present file is never clobbered.
    absent = true;
  }
  const theme = effectiveThemeMode();
  if (obj.theme === theme) return;
  obj.theme = theme;
  if (absent) {
    // Only proceed if we can freshly create the file; any failure means it exists
    // (or its dir is unwritable) — either way, don't clobber.
    try {
      await createFile(root, path);
    } catch {
      return;
    }
    await writeFile(root, path, `${JSON.stringify(obj, null, 2)}\n`).catch(() => {});
    return;
  }
  await createFile(root, path).catch(() => {});
  await writeFile(root, path, `${JSON.stringify(obj, null, 2)}\n`).catch(() => {});
}

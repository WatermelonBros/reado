/**
 * Build an xterm.js theme from Reado's CSS theme tokens.
 *
 * xterm needs concrete colour strings, not `oklch(var(--…))`, so we resolve each
 * token to its computed `rgb(...)` via a throwaway probe element. Called when a
 * terminal mounts (and can be re-applied on theme change).
 */
import type { ITheme } from "@xterm/xterm";

/** Resolve a CSS custom property to a concrete `rgb(...)` string. */
function resolve(varName: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${varName})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color || "#000";
}

export function xtermTheme(): ITheme {
  return {
    background: resolve("--bg"),
    foreground: resolve("--text"),
    cursor: resolve("--accent"),
    cursorAccent: resolve("--bg"),
    selectionBackground: resolve("--selection"),
    black: resolve("--bg-elevated"),
    red: resolve("--marker"),
    green: resolve("--syn-string"),
    yellow: resolve("--syn-number"),
    blue: resolve("--syn-keyword"),
    magenta: resolve("--syn-control"),
    cyan: resolve("--accent"),
    white: resolve("--text-muted"),
    brightBlack: resolve("--text-faint"),
    brightRed: resolve("--marker"),
    brightGreen: resolve("--syn-string"),
    brightYellow: resolve("--syn-number"),
    brightBlue: resolve("--syn-keyword"),
    brightMagenta: resolve("--syn-control"),
    brightCyan: resolve("--accent"),
    brightWhite: resolve("--text"),
  };
}

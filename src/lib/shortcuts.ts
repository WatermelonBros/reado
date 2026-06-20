/**
 * Canonical keyboard shortcuts, in one place so the command palette and the
 * welcome screen display the same bindings that `lib/hooks.ts` actually binds.
 */
import type { MessageKey } from "../i18n";

/** Platform modifier glyph (⌘ on macOS, Ctrl elsewhere). */
export const mod = /mac|iphone|ipad/i.test(navigator.platform) ? "⌘" : "Ctrl";

export interface Shortcut {
  labelKey: MessageKey;
  /** Display combo, e.g. "⌘P" or "⌘⇧M". */
  combo: string;
}

export const SHORTCUTS: Shortcut[] = [
  { labelKey: "comment.new", combo: `${mod}⇧M` },
  { labelKey: "finder.placeholder", combo: `${mod}P` },
  { labelKey: "search.placeholder", combo: `${mod}⇧F` },
  { labelKey: "palette.placeholder", combo: `${mod}K` },
  { labelKey: "terminal.toggle", combo: `${mod}J` },
  { labelKey: "settings.title", combo: `${mod},` },
];

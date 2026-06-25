/**
 * Canonical keyboard shortcuts, in one place so the command palette and the
 * welcome screen display the same bindings that `lib/hooks.ts` actually binds.
 */
import type { MessageKey } from "../i18n";

/** Platform modifier glyph (⌘ on macOS, Ctrl elsewhere). `navigator.platform`
 * is deprecated, so sniff the user agent instead. */
export const mod = /mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

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

/** Full reference, grouped, for the shortcuts panel. Labels are kept literal
 * (concise dev terms); group titles are localized via the dialog. */
export interface ShortcutGroup {
  titleKey: MessageKey;
  items: { label: string; combo: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: "sc.navigation",
    items: [
      { label: "Go to File", combo: `${mod}P` },
      { label: "Command Palette", combo: `${mod}K` },
      { label: "Search in Project", combo: `${mod}⇧F` },
      { label: "Go to Symbol in File", combo: `${mod}⇧O` },
      { label: "Go to Symbol in Project", combo: `${mod}T` },
      { label: "Go to Definition", combo: "F12" },
      { label: "Find References", combo: "⇧F12" },
      { label: "Peek Definition", combo: "⌥F12" },
      { label: "Go to Line", combo: `${mod}G` },
      { label: "Back / Forward", combo: "⌥← / ⌥→" },
      { label: "Switch Tabs", combo: "⌃Tab / ⌃⇧Tab" },
      { label: "Reopen Closed Tab", combo: `${mod}⇧T` },
    ],
  },
  {
    titleKey: "sc.editing",
    items: [
      { label: "Comment on Selection", combo: `${mod}⇧M` },
      { label: "Toggle Line Comment", combo: `${mod}/` },
      { label: "Find / Replace", combo: `${mod}F` },
      { label: "Add Selection to Next Match", combo: `${mod}D` },
      { label: "Expand / Shrink Selection", combo: "⇧⌥→ / ⇧⌥←" },
      { label: "Move Line Up / Down", combo: "⌥↑ / ⌥↓" },
      { label: "Copy Line Up / Down", combo: "⇧⌥↑ / ⇧⌥↓" },
      { label: "Delete Line", combo: `⇧${mod}K` },
      { label: "Format Document", combo: "⇧⌥F" },
      { label: "Save", combo: `${mod}S` },
    ],
  },
  {
    titleKey: "sc.view",
    items: [
      { label: "Toggle Sidebar", combo: `${mod}B` },
      { label: "Toggle Terminal", combo: `${mod}J` },
      { label: "Split Editor", combo: `${mod}\\` },
      { label: "Zoom In / Out / Reset", combo: `${mod}+ / ${mod}- / ${mod}0` },
      { label: "Settings", combo: `${mod},` },
    ],
  },
];

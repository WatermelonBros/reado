/**
 * Canonical keyboard shortcuts, in one place so the command palette and the
 * welcome screen display the same bindings that `lib/hooks.ts` actually binds.
 */
import type { MessageKey } from "@/i18n"

// Platform modifier glyphs. `navigator.platform` is deprecated, so sniff the
// user agent. On non-macOS the Apple symbols (⌘ ⌥ ⌃) become plain key names so
// Windows/Linux users see keys that exist on their keyboard.
export const isMacUA = /mac|iphone|ipad/i.test(navigator.userAgent)
export const mod = isMacUA ? "⌘" : "Ctrl"
export const alt = isMacUA ? "⌥" : "Alt"
export const ctrl = isMacUA ? "⌃" : "Ctrl"
export const shift = isMacUA ? "⇧" : "Shift"

/** Full screen and zen mode need a platform split: a ⌃⌘ pair doesn't exist off
 *  macOS, where Ctrl already *is* the mod key. Named here so the menu, the
 *  shortcuts dialog and `lib/hooks.ts` can't drift apart. */
export const FULLSCREEN_COMBO = isMacUA ? `${ctrl}${mod}F` : "F11"
export const ZEN_COMBO = isMacUA ? `${alt}${mod}Z` : `${mod}${alt}Z`

export interface Shortcut {
  labelKey: MessageKey
  /** Display combo, e.g. "⌘P" or "CtrlP". */
  combo: string
}

export const SHORTCUTS: Shortcut[] = [
  { labelKey: "comment.new", combo: `${mod}${shift}M` },
  { labelKey: "finder.placeholder", combo: `${mod}P` },
  { labelKey: "search.placeholder", combo: `${mod}${shift}F` },
  { labelKey: "palette.placeholder", combo: `${mod}K` },
  { labelKey: "terminal.toggle", combo: `${mod}J` },
  { labelKey: "settings.title", combo: `${mod},` },
]

/** Full reference, grouped, for the shortcuts panel. Labels are kept literal
 * (concise dev terms); group titles are localized via the dialog. */
export interface ShortcutGroup {
  titleKey: MessageKey
  items: { label: string; combo: string }[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: "sc.navigation",
    items: [
      { label: "Go to File", combo: `${mod}P` },
      { label: "Command Palette", combo: `${mod}${shift}P` },
      { label: "Search in Project", combo: `${mod}${shift}F` },
      { label: "Go to Symbol in File", combo: `${mod}${shift}O` },
      { label: "Go to Symbol in Project", combo: `${mod}T` },
      { label: "Go to Definition", combo: "F12" },
      { label: "Find References", combo: `${shift}F12` },
      { label: "Peek Definition", combo: `${alt}F12` },
      { label: "Go to Line", combo: `${ctrl}G` },
      { label: "Back / Forward", combo: `${alt}← / ${alt}→` },
      { label: "Switch Tabs", combo: `${ctrl}Tab / ${ctrl}${shift}Tab` },
      { label: "Reopen Closed Tab", combo: `${mod}${shift}T` },
      { label: "Close Editor", combo: `${mod}W` },
      { label: "Keep a Preview Tab Open", combo: "double-click" },
      { label: "Focus Editor Group 1 / 2", combo: `${mod}1 / ${mod}2` },
    ],
  },
  {
    titleKey: "sc.editing",
    items: [
      { label: "Undo / Redo", combo: `${mod}Z / ${mod}${shift}Z` },
      { label: "Comment on Selection", combo: `${mod}${shift}M` },
      { label: "Toggle Line Comment", combo: `${mod}/` },
      { label: "Find / Replace", combo: `${mod}F` },
      { label: "Add Selection to Next Match", combo: `${mod}D` },
      { label: "Expand / Shrink Selection", combo: `${shift}${alt}→ / ${shift}${alt}←` },
      { label: "Select Line", combo: `${mod}L` },
      { label: "Insert Line Below / Above", combo: `${mod}↵ / ${mod}${shift}↵` },
      { label: "Indent / Outdent", combo: `Tab / ${shift}Tab` },
      { label: "Add Cursors to Line Ends", combo: `${shift}${alt}I` },
      { label: "Move Line Up / Down", combo: `${alt}↑ / ${alt}↓` },
      { label: "Copy Line Up / Down", combo: `${shift}${alt}↑ / ${shift}${alt}↓` },
      { label: "Delete Line", combo: `${shift}${mod}K` },
      { label: "Quick Fix", combo: `${mod}.` },
      { label: "Format Document", combo: `${shift}${alt}F` },
      { label: "Join Lines", combo: `${ctrl}J` },
      { label: "Suggestions", combo: `${ctrl}Space` },
      { label: "New File", combo: `${mod}N` },
      { label: "Open File", combo: `${mod}O` },
      { label: "Save", combo: `${mod}S` },
      { label: "Save All", combo: `${alt}${mod}S` },
      { label: "Compare with Saved", combo: "—" },
    ],
  },
  {
    titleKey: "sc.files",
    items: [
      { label: "Rename", combo: "F2" },
      { label: "Delete", combo: isMacUA ? `${mod}⌫` : "Del" },
      { label: "Cut / Copy / Paste", combo: `${mod}X / ${mod}C / ${mod}V` },
      { label: "Duplicate", combo: `${mod}D` },
      { label: "Walk Rows", combo: "↑ ↓ ← → / Home / End" },
      { label: "Multi-select", combo: `${mod}click / ${shift}click / ${shift}↑↓` },
      { label: "Jump by Name", combo: "type a letter" },
    ],
  },
  {
    // `⌘K` waits for a second key rather than firing on its own; the status bar
    // says so while it is armed.
    titleKey: "sc.chords",
    items: [
      { label: "Command Palette (again)", combo: `${mod}K ${mod}K` },
      { label: "Keyboard Shortcuts", combo: `${mod}K ${mod}S` },
      { label: "Settings / Settings (JSON)", combo: `${mod}K , / ${mod}K J` },
      { label: "Zen Mode", combo: `${mod}K Z` },
      { label: "Preview to the Side", combo: `${mod}K V` },
      { label: "Fold All / Unfold All", combo: `${mod}K ${mod}0 / ${mod}K ${mod}J` },
      { label: "Fold to Level 1–9", combo: `${mod}K ${mod}1 … ${mod}9` },
      { label: "Close All Editors", combo: `${mod}K W` },
      { label: "Copy Path / Reveal File", combo: `${mod}K P / ${mod}K R` },
    ],
  },
  {
    titleKey: "sc.view",
    items: [
      { label: "Toggle Sidebar", combo: `${mod}B` },
      { label: "Toggle Word Wrap", combo: `${alt}Z` },
      { label: "Toggle Secondary Sidebar", combo: `${alt}${mod}B` },
      { label: "Toggle Terminal", combo: `${mod}J` },
      { label: "Zen Mode", combo: ZEN_COMBO },
      { label: "Full Screen", combo: FULLSCREEN_COMBO },
      { label: "Split Editor", combo: `${mod}\\` },
      { label: "Fold / Unfold", combo: `${mod}${alt}[ / ${mod}${alt}]` },
      { label: "Markdown Preview", combo: `${mod}${shift}V` },
      { label: "New Terminal", combo: `${ctrl}${shift}\`` },
      { label: "Zoom In / Out / Reset", combo: `${mod}+ / ${mod}- / ${mod}0` },
      { label: "Settings", combo: `${mod},` },
    ],
  },
]

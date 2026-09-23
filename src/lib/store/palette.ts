import { create } from "zustand"

export type PaletteMode =
  | "commands"
  | "files"
  | "symbols"
  | "wsymbols"
  | "recents"
  | "bookmarks"
  | "profiles"
  | "tasks"
  | null

interface PaletteState {
  mode: PaletteMode
  /** True while the settings panel is shown. */
  settingsOpen: boolean
  /** The settings dialog's JSON view. A flag here rather than local state so the
   *  command palette can open straight onto it. */
  settingsJsonOpen: boolean
  /** True while the keyboard-shortcuts reference is shown. */
  shortcutsOpen: boolean
  /** True while the Reado Anywhere (phone pairing) dialog is shown. */
  anywhereOpen: boolean
  open: (mode: Exclude<PaletteMode, null>) => void
  close: () => void
  toggleSettings: (open?: boolean) => void
  /** Open the settings dialog on its JSON view (or close that view). */
  toggleSettingsJson: (open?: boolean) => void
  toggleShortcuts: (open?: boolean) => void
  toggleAnywhere: (open?: boolean) => void
}

/** Drives the quick-open palette (commands / files / search) and settings. */
export const usePalette = create<PaletteState>((set) => ({
  mode: null,
  settingsOpen: false,
  settingsJsonOpen: false,
  shortcutsOpen: false,
  anywhereOpen: false,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
  toggleSettings: (open) =>
    set((s) => ({
      settingsOpen: open ?? !s.settingsOpen,
      // Closing the dialog closes the view it was showing, so reopening lands
      // on the tabs rather than on a JSON blob nobody asked for again.
      settingsJsonOpen: open === false ? false : s.settingsJsonOpen,
      mode: null,
    })),
  toggleSettingsJson: (open) =>
    set((s) => {
      const next = open ?? !s.settingsJsonOpen
      return { settingsJsonOpen: next, settingsOpen: next || s.settingsOpen, mode: null }
    }),
  toggleShortcuts: (open) => set((s) => ({ shortcutsOpen: open ?? !s.shortcutsOpen, mode: null })),
  toggleAnywhere: (open) => set((s) => ({ anywhereOpen: open ?? !s.anywhereOpen, mode: null })),
}))

/**
 * Every command `runMenuCommand` answers to, by id — the one registry behind the
 * native menu, the rendered menu bar, keybindings and the command palette.
 *
 * Split by menu, merged here. A command is a `run` plus, optionally, the context
 * it needs (`when`), which the dispatcher checks first.
 */
import { foldLevel } from "@/lib/activeEditor"
import { type SettingsState, THEMES, type ThemeName, useProject, useSettings } from "@/lib/store"
import { appCommands } from "./app"
import { editCommands } from "./edit"
import { fileCommands } from "./file"
import { goCommands } from "./go"
import { helpCommands } from "./help"
import { reviewCommands } from "./review"
import { selectionCommands } from "./selection"
import { terminalCommands } from "./terminal"
import type { CommandTable } from "./types"
import { viewCommands } from "./view"

export type { Command, CommandTable, MenuCond } from "./types"

// No prototype: an id like "toString" is a typo to report, not a method to run.
export const COMMANDS: CommandTable = Object.assign(Object.create(null), {
  ...appCommands,
  ...fileCommands,
  ...editCommands,
  ...selectionCommands,
  ...goCommands,
  ...viewCommands,
  ...terminalCommands,
  ...helpCommands,
  ...reviewCommands,
})

/** A command a build embedding Reado adds, listed in the palette under its label. */
export interface ExtensionCommand {
  id: string
  /** Read when the palette opens, so it follows the active language. */
  label: () => string
  /** When given and `false`, the palette hides the command. */
  when?: () => boolean
}

export const EXTENSION_COMMANDS: ExtensionCommand[] = []

/**
 * Add a command from outside the core — the official build's team commands, say.
 * It joins the one registry, so a keybinding, the palette and `runMenuCommand`
 * all reach it like any built-in. Call before `boot()`, like `registerSlot`.
 */
export function registerCommand(
  id: string,
  run: () => void,
  label: () => string,
  when?: () => boolean,
): void {
  COMMANDS[id] = { run }
  EXTENSION_COMMANDS.push({ id, label, when })
}

/**
 * Commands that carry an argument in their id — a theme, an auto-save policy, a
 * fold level, a group number. Matched by pattern rather than listed one by one;
 * `known` names the ids worth offering to the keybinding editor.
 */
interface CommandFamily {
  pattern: RegExp
  run: (arg: string) => void
  known: () => string[]
}

export const COMMAND_FAMILIES: CommandFamily[] = [
  // Theme submenu: ids like "theme:dark".
  {
    pattern: /^theme:([\s\S]*)$/,
    run: (theme) => useSettings.getState().set({ theme: theme as ThemeName, mode: "manual" }),
    known: () => THEMES.map((t) => `theme:${t}`),
  },
  // Fold to a numbered level: `view:foldLevel:3`.
  {
    pattern: /^view:foldLevel:([\s\S]*)$/,
    run: (level) => foldLevel(Number(level)),
    known: () => Array.from({ length: 9 }, (_, i) => `view:foldLevel:${i + 1}`),
  },
  // Auto Save submenu: ids like "autosave:afterDelay".
  {
    pattern: /^autosave:([\s\S]*)$/,
    run: (policy) => useSettings.getState().set({ autoSave: policy as SettingsState["autoSave"] }),
    known: () => (["off", "afterDelay", "onFocusChange"] as const).map((v) => `autosave:${v}`),
  },
  // ⌘3…⌘9 are seven ids with one meaning; a prefix match beats seven cases.
  {
    pattern: /^group:([1-9])$/,
    run: (n) => useProject.getState().focusGroup(Number(n) - 1),
    known: () => Array.from({ length: 9 }, (_, i) => `group:${i + 1}`),
  },
]

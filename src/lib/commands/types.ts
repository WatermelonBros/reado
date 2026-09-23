/**
 * Which context a command needs to do anything. Commands without one are always
 * available. Mirrors the command-palette `when:` gating so the menu, the menu
 * bar and the palette agree on what's applicable.
 */
export type MenuCond =
  | "file"
  | "selection"
  | "back"
  | "forward"
  | "reopen"
  | "split"
  | "terminal"
  | "problems"

/** One command the native menu, the menu bar, a keybinding or the palette can run. */
export interface Command {
  run: () => void
  /** The context the command needs; checked by `runMenuCommand` before `run`. */
  when?: MenuCond
}

export type CommandTable = Record<string, Command>

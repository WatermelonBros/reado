/**
 * Bridge from the native OS menu to in-app commands. The Rust side emits a
 * `menu` event with the clicked item's id; here we look the id up in the command
 * table (`commands/`), the same registry the keyboard shortcuts and palette use.
 */
import { listen } from "@tauri-apps/api/event"
import { type MessageKey, t } from "@/i18n"
import { COMMAND_FAMILIES, COMMANDS, type MenuCond } from "./commands"
import { useDiagnostics } from "./diagnostics"
import { useDocInfo } from "./docInfo"
import { notify } from "./notice"
import { useProject } from "./store"
import { useTerminals } from "./terminals"

/** The message shown when a command is invoked without its precondition. */
const MENU_COND_MSG: Record<MenuCond, MessageKey> = {
  file: "menu.needFile",
  selection: "menu.needSelection",
  back: "menu.needBack",
  forward: "menu.needForward",
  reopen: "menu.needReopen",
  split: "menu.needFile",
  terminal: "menu.needTerminal",
  problems: "menu.needProblems",
}

function menuCondMet(cond: MenuCond): boolean {
  const project = useProject.getState()
  switch (cond) {
    case "file":
      return !!project.active
    case "selection": {
      const v = useDocInfo.getState().view
      return !!v && !v.state.selection.main.empty
    }
    case "back":
      return project.navIndex > 0
    case "forward":
      return project.navIndex < project.navStack.length - 1
    case "reopen":
      return project.closedTabs.length > 0
    case "split":
      return !!project.active || !!project.splitPath
    case "terminal":
      return useTerminals.getState().sessions.length > 0
    case "problems":
      return Object.keys(useDiagnostics.getState().byFile).length > 0
  }
}

/** Whether a menu command can act in the current context (drives both the greyed
 *  state in the rendered menu bar and the notice-instead-of-no-op in the handler). */
export function menuCommandEnabled(id: string): boolean {
  const cond = COMMANDS[id]?.when
  return !cond || menuCondMet(cond)
}

/** Run an app-menu command by id — shared by the native menu (forwarded as a
 *  `menu` event) and the rendered Win/Linux menu bar in the title bar. */
export function runMenuCommand(id: string): void {
  const command = COMMANDS[id]
  // A command whose precondition isn't met would silently do nothing (the
  // native macOS menu can't be greyed from here) — tell the user why instead.
  if (command?.when && !menuCondMet(command.when)) {
    notify("info", t(MENU_COND_MSG[command.when]))
    return
  }
  if (command) {
    command.run()
    return
  }
  for (const family of COMMAND_FAMILIES) {
    const match = family.pattern.exec(id)
    if (match) {
      family.run(match[1])
      return
    }
  }
}

/**
 * Every command id `runMenuCommand` answers to, so the keybinding editor can
 * tell a typo from a command — a line pointing at nothing would otherwise just
 * silently do nothing.
 */
export function knownCommands(): Set<string> {
  return new Set([...Object.keys(COMMANDS), ...COMMAND_FAMILIES.flatMap((f) => f.known())])
}

/** Start handling native-menu events; returns an unlisten function. */
export function listenForMenu(): Promise<() => void> {
  return listen<string>("menu", ({ payload: id }) => runMenuCommand(id))
}

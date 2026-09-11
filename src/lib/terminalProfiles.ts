/**
 * Named terminal profiles.
 *
 * One integrated terminal is one shell, which is fine until the work needs more
 * than one: a container shell, a Node REPL, `bash` because a script only works
 * there. A profile is a name and a command, so those become a menu instead of
 * something retyped in every new terminal.
 *
 * Stored as lines — `Node REPL = node --experimental-repl-await` — the same
 * shape the keybindings and the file-nesting rules use, because the settings
 * store holds strings and arrays of strings, and a line is diffable, pasteable
 * and editable in the settings JSON like everything else here.
 */
import { useSettings } from "./store"

export interface TermProfile {
  name: string
  command: string
  args: string[]
}

/**
 * Split a command line into its words, honouring single and double quotes so a
 * path with a space survives. Not a shell: no expansion, no operators — the
 * command is executed directly, not through a shell.
 */
export function splitArgs(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of line.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

/** Parse the settings lines into profiles. A line with no `=`, or no command
 *  after it, is skipped rather than becoming a profile that cannot start. */
export function parseProfiles(lines: string[]): TermProfile[] {
  const out: TermProfile[] = []
  for (const line of lines) {
    const at = line.indexOf("=")
    if (at < 0) continue
    const name = line.slice(0, at).trim()
    const [command, ...args] = splitArgs(line.slice(at + 1))
    if (!name || !command) continue
    out.push({ name, command, args })
  }
  return out
}

/** The profiles the user has defined. */
export const terminalProfiles = (): TermProfile[] =>
  parseProfiles(useSettings.getState().terminalProfiles)

/**
 * The profile a new terminal should run: the one asked for, else the default,
 * else nothing — and nothing means the login shell, exactly as before profiles
 * existed.
 */
export function profileFor(name?: string): TermProfile | null {
  const profiles = terminalProfiles()
  const wanted = name ?? useSettings.getState().defaultTerminalProfile
  return profiles.find((p) => p.name === wanted) ?? null
}

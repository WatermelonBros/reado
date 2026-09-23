/**
 * A command run in a PTY the user never sees — Reado's own errand, not one typed
 * into their terminal.
 *
 * Test runs and curated installs both work this way: the command goes to a
 * hidden shell followed by `exit`, so the run ends on `pty-exit` rather than on a
 * guess about how long silence means "finished"; a timer is the backstop for a
 * command that never returns. Whatever ends it, the shell is killed and both
 * subscriptions are dropped.
 */
import type { UnlistenFn } from "@tauri-apps/api/event"
import { onPtyExit, ptyKill, ptySpawn, submitToTerminal } from "./api"
import { listenPtyLines, offSafe, plainText } from "./terminals"

export interface HiddenRunOptions {
  /** Each complete line the command prints, as it arrives. */
  onLine?: (line: string) => void
  /** The backstop, in ms: the run is ended when it runs out. */
  timeoutMs: number
  /** Restart the backstop on every line, so it measures silence rather than
   *  the whole run. */
  idle?: boolean
  /** How much of the output to keep for the caller's log. */
  tailChars?: number
}

/** How a hidden run ended, and the last of what it printed (ANSI stripped). */
export interface HiddenRunEnd {
  reason: "exit" | "timeout" | "stopped" | "spawnFailed"
  tail: string
  /** Why the shell could not start, for `spawnFailed`. */
  error?: unknown
}

export interface HiddenRun {
  /** Settles once the run is over, however it ended. */
  done: Promise<HiddenRunEnd>
  /** End the run now: the shell is killed, what it printed so far stands. */
  stop: () => void
}

/** Run `cmd` in a hidden shell `id` started in `cwd`. */
export function runHidden(
  id: string,
  cwd: string,
  cmd: string,
  { onLine, timeoutMs, idle = false, tailChars = 8000 }: HiddenRunOptions,
): HiddenRun {
  let tail = ""
  let timer: ReturnType<typeof setTimeout> | undefined
  let subs: UnlistenFn[] = []
  let over = false
  let settle: (end: HiddenRunEnd) => void = () => {}
  const done = new Promise<HiddenRunEnd>((resolve) => {
    settle = resolve
  })
  const end = (reason: HiddenRunEnd["reason"], error?: unknown) => {
    if (over) return
    over = true
    for (const off of subs) offSafe(off)
    clearTimeout(timer)
    void ptyKill(id).catch(() => {})
    settle({ reason, tail, error })
  }
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => end("timeout"), timeoutMs)
  }

  void (async () => {
    // Subscribed before the shell starts, so its first line can't be missed.
    const subLines = await listenPtyLines(id, (line) => {
      tail = `${tail}${plainText(line)}\n`.slice(-tailChars)
      onLine?.(line)
      if (idle) arm()
    })
    const subExit = await onPtyExit(id, () => end("exit"))
    // Kept only after the awaits: if the run already ended (stopped, or a second
    // run started), there was nothing for `end` to unsubscribe and these would
    // outlive the run they belong to.
    if (over) {
      offSafe(subLines)
      offSafe(subExit)
      return
    }
    subs = [subLines, subExit]
    arm()
    try {
      await ptySpawn(id, cwd, 24, 200)
    } catch (e) {
      end("spawnFailed", e)
      return
    }
    submitToTerminal(id, cmd, 200)
    // `exit` closes the shell once the command returns, which is what fires
    // `pty-exit`; it is spelled the same in every shell Reado can be pointed at.
    submitToTerminal(id, "exit", 400)
  })()

  return { done, stop: () => end("stopped") }
}

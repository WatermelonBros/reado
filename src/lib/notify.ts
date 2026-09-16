/**
 * Lightweight notifications for agent activity.
 *
 * Uses the webview's native Notification API (no extra Tauri plugin) for the OS
 * notification, plus an optional soft WebAudio chime. Called when the open-task
 * count drops — i.e. the agent (or the user) resolved something.
 */
import { useMascot } from "./mascot"
import { useSettings } from "./store"

let permissionAsked = false

async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  if (permissionAsked) return false
  permissionAsked = true
  return (await Notification.requestPermission()) === "granted"
}

/** A short, soft two-note chime (skipped unless enabled in settings). */
function chime() {
  try {
    const ctx = new AudioContext()
    // A context created without a user gesture starts suspended, and every
    // note would be scheduled into silence. Resuming is a no-op when it is
    // already running.
    void ctx.resume?.()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.12)
      osc.stop(now + i * 0.12 + 0.2)
    })
    setTimeout(() => ctx.close(), 600)
  } catch {
    /* audio not available */
  }
}

/** Notify that tasks were resolved; `remaining` is the open-task count left. */
export async function notifyResolved(remaining: number): Promise<void> {
  const body =
    remaining === 0
      ? "Review complete — all tasks resolved."
      : `A task was resolved — ${remaining} remaining.`

  if (await ensurePermission()) {
    new Notification("Reado", { body })
  }
  if (useSettings.getState().completionSound) chime()
}

/**
 * How long a handoff waits to see whether another one is right behind it.
 *
 * Agents say they are done far more often than they are: one `session_done` per
 * command that returns, not one per request — whatever their instructions say.
 * The end of that burst is the handoff the user wants, and the last summary is
 * the one that describes where the agent actually stopped.
 *
 * ponytail: a burst is only "handoffs close together", so a premature one
 * followed by two minutes of quiet work still rings early. The exact signal is
 * the agent's own pane falling silent, which the terminal does not publish yet.
 */
const HANDOFF_QUIET_MS = 10_000

let handoffTimer: number | undefined
let handoff: { status: string; summary: string } | null = null

/**
 * The agent handed the turn back — it called `session_done` over MCP. This is
 * what the "play a sound when the agent finishes" setting actually means; a
 * task being resolved (above) is a different event.
 *
 * Coalesced: one alert for a run of handoffs, carrying the last of them.
 */
export function notifyAgentDone(status: string, summary: string): void {
  handoff = { status, summary }
  clearTimeout(handoffTimer)
  handoffTimer = window.setTimeout(() => {
    const last = handoff
    handoff = null
    if (!last) return
    // The companion takes the same signal, not its own: what it shows and what
    // the notification says come from one place.
    useMascot.getState().handoff(last.status, last.summary)
    void announceAgentDone(last.status, last.summary)
  }, HANDOFF_QUIET_MS)
}

async function announceAgentDone(status: string, summary: string): Promise<void> {
  const body =
    summary ||
    (status === "blocked"
      ? "The agent is blocked and needs you."
      : status === "failed"
        ? "The agent stopped without finishing."
        : "The agent finished.")
  if (await ensurePermission()) {
    new Notification("Reado", { body })
  }
  if (useSettings.getState().completionSound) chime()
}

/**
 * What the companion is showing, and why.
 *
 * The state is never guessed: it is the agent's, read from the facts Reado
 * already holds. `working` is entered when Reado dispatches to an agent or a
 * `reado thought` line arrives, and left at the handoff — which means an agent
 * someone started by hand in another terminal, and that narrates nothing, shows
 * as idle until it hands the turn back. That is honest: Reado is told when an
 * agent *stops*, never when it starts.
 *
 * The handoff arrives here already coalesced by `notify.ts`, so a burst of
 * premature `session_done` calls is one change of face, and the companion and
 * the desktop notification can never disagree about what the agent said.
 */
import { emit, listen } from "@tauri-apps/api/event"
import { create } from "zustand"
import type { MascotState } from "@/components/organisms/mascot/frames"

/** How long a bubble stays up before it fades on its own. Long enough to read
 *  twice, short enough that a message from ten minutes ago is not still there
 *  claiming to be news. */
const BUBBLE_MS = 30_000

/** A question outlasts its bubble: it is the one state that stands until someone
 *  answers it, so it holds its face after the words have gone. */
const HOLDS: MascotState[] = ["ask"]

interface MascotStore {
  state: MascotState
  /** What it is saying, if anything. Always plain text — it comes from an agent. */
  text?: string
  /** Bumped on every change, so a window can tell a repeated message from a
   *  stale one. */
  seq: number
  /** The agent handed the turn back. */
  handoff: (status: string, summary: string) => void
  /** Reado dispatched to an agent, or the agent narrated a line. */
  working: () => void
  /** A test run finished. */
  tested: (failed: number) => void
  /** The agent said something through `mascot_say`. */
  say: (text: string, mood?: MascotState) => void
  /** The bubble timed out, or the user clicked it away. */
  hush: () => void
}

let bubbleTimer: number | undefined

export const useMascot = create<MascotStore>()((set, get) => {
  /** Show something, and start the bubble's clock if there are words. */
  const show = (state: MascotState, text?: string) => {
    clearTimeout(bubbleTimer)
    set((s) => ({ state, text, seq: s.seq + 1 }))
    if (text) bubbleTimer = window.setTimeout(() => get().hush(), BUBBLE_MS)
  }
  return {
    state: "idle",
    seq: 0,
    handoff: (status, summary) =>
      show(
        // `blocked` is the one that means *come here*; a failure is news but not
        // a question, so it settles rather than asking.
        status === "blocked" ? "ask" : "done",
        summary || undefined,
      ),
    working: () => {
      // Never interrupt a standing question with "working": the agent going back
      // to work does not answer it. And never talk over words that are still on
      // screen — an agent's TUI keeps repainting after it has finished, which
      // would otherwise wipe "done" a tenth of a second after showing it.
      if (get().state === "ask" || get().text) return
      if (get().state === "think") return
      show("think")
    },
    tested: (failed) => show(failed > 0 ? "ask" : "done"),
    say: (text, mood) => show(mood ?? "talk", text),
    hush: () => {
      clearTimeout(bubbleTimer)
      set((s) => ({ text: undefined, state: HOLDS.includes(s.state) ? s.state : "idle" }))
    },
  }
})

/** The moods an agent may name in `mascot_say`, mapped to a face. Anything else
 *  — a word the agent invented — falls back to talking, which is the honest
 *  reading of "it said something". */
export function moodOf(mood?: string): MascotState | undefined {
  const known: MascotState[] = ["done", "ask", "think", "talk"]
  return known.find((m) => m === mood)
}

/** An agent pane painting means the agent is thinking — but a terminal paints
 *  many times a second, and the state machine must not be asked that often. */
let lastBusy = 0

/**
 * An agent terminal produced output.
 *
 * Throttled to once a second, and a no-op where the store already refuses it —
 * while a question stands, or while there are words on screen. A TUI redraws for
 * a while after it has finished, and that redraw must not wipe the very message
 * it just printed.
 */
export function agentIsBusy(): void {
  const now = Date.now()
  if (now - lastBusy < 1000) return
  lastBusy = now
  useMascot.getState().working()
}

/**
 * The companion lives in its own webview, and a webview is its own JavaScript:
 * the store here and the store there are two different objects. What crosses is
 * an event — the same mechanism the backend already uses to reach the frontend.
 *
 * Only the main window publishes. The companion is a view of the state, never a
 * second author of it, so there is no echo to guard against.
 */
const CHANNEL = "mascot-state"
/** Where it sits and how big it is: the companion's own settings store is read
 *  once when its page loads and never hears about a change, so the main window
 *  tells it. Without this the backend moves the window to the new corner while
 *  the owl stays in the old corner *of* that window — which is how "top left"
 *  ended up in the middle of the screen. */
const CONFIG = "mascot-config"

export interface MascotConfig {
  corner: string
  size: number
}

/** Tell the companion where it should sit and how big it should be. */
export function publishMascotConfig(config: MascotConfig): void {
  broadcast(CONFIG, config)
}

/** Fire-and-forget. A broadcast is a courtesy to a window that may not exist:
 *  if it cannot be sent, the companion simply does not update — it must never
 *  be able to take the app down with it. */
function broadcast(channel: string, payload: unknown): void {
  try {
    void emit(channel, payload).catch(() => {})
  } catch {
    /* no transport (a test, or a webview without the API) */
  }
}

/** Follow that. For the companion window only. */
export function followMascotConfig(apply: (config: MascotConfig) => void): Promise<() => void> {
  return listen<MascotConfig>(CONFIG, (e) => apply(e.payload))
}

/** Broadcast this window's mascot state to the companion. Returns the
 *  unsubscribe. */
export function publishMascotState(): () => void {
  let last = -1
  return useMascot.subscribe((s) => {
    if (s.seq === last) return
    last = s.seq
    broadcast(CHANNEL, { state: s.state, text: s.text, seq: s.seq })
  })
}

/** Follow the main window's mascot state. For the companion window only. */
export async function followMascotState(): Promise<() => void> {
  return listen<{ state: MascotState; text?: string; seq: number }>(CHANNEL, (e) => {
    useMascot.setState({ state: e.payload.state, text: e.payload.text, seq: e.payload.seq })
  })
}

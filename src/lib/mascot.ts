/**
 * What the companion is showing, and why.
 *
 * The state is never guessed: it is the agent's, read from the facts Reado
 * already holds. `working` is entered when Reado dispatches to an agent or a
 * `reado thought` line arrives, and left at the handoff — or, failing one, when
 * the signs of work stop arriving (`WORK_QUIET_MS`). Reado is told when an agent
 * *stops*, never when it starts, and plenty of agents never say even that.
 *
 * The weakest fact here is an agent pane repainting, and it is the one most
 * often available. It is treated as work only while the turn is plausibly the
 * agent's (`handedBack`) — a TUI redraws its prompt long after it has finished,
 * and a companion that reads that as thinking is a companion that announces
 * work at an idle machine. A face that cannot go back to idle on its own is a
 * face that ends up lying, and the whole value of this thing is that it doesn't.
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

/** How long "working" stands after the last sign of work.
 *
 * `think` is entered on activity, and the only things that left it were a
 * handoff and a new message — so an agent that stopped without handing back, or
 * whose pane repainted once after it had, left the companion thinking for the
 * rest of the day. A companion that says "working" while nothing is working is
 * worse than no companion: it is a face you learn to stop believing.
 *
 * An agent pane repaints many times a second while it is busy — a spinner, an
 * elapsed counter — and `agentIsBusy` is called on every one of them, so silence
 * this long is silence rather than a pause.
 *
 * ponytail: a timeout, because "the pane went quiet" is not something the
 * terminal publishes. If it ever does, take the event and delete this.
 */
const WORK_QUIET_MS = 15_000

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
let workTimer: number | undefined
/**
 * The agent handed the turn back, and nobody has asked it anything since.
 *
 * Its pane keeps repainting afterwards — a TUI settles, redraws its prompt,
 * blinks a cursor — and none of that is work. Believing it is what made the
 * companion announce "thinking" at an agent that had finished, which is the one
 * behaviour that makes a companion worth ignoring.
 *
 * Only an *ambiguous* sign of work is held back by this. The unambiguous ones —
 * Reado dispatching a prompt, a test run starting, the user typing into the
 * agent's pane — go straight through, and clear it on the way.
 */
let handedBack = false

export const useMascot = create<MascotStore>()((set, get) => {
  /** Show something, and start the bubble's clock if there are words. Anything
   *  shown outranks work in progress, so the work clock stops here too. */
  const show = (state: MascotState, text?: string) => {
    clearTimeout(bubbleTimer)
    clearTimeout(workTimer)
    set((s) => ({ state, text, seq: s.seq + 1 }))
    if (text) bubbleTimer = window.setTimeout(() => get().hush(), BUBBLE_MS)
  }
  /** Believe "working" until this runs out. Re-armed by every sign of work. */
  const expectMoreWork = () => {
    clearTimeout(workTimer)
    workTimer = window.setTimeout(() => {
      // Only ever takes back its own claim: anything else has since been shown.
      if (get().state !== "think") return
      set((s) => ({ state: "idle", seq: s.seq + 1 }))
    }, WORK_QUIET_MS)
  }
  return {
    state: "idle",
    seq: 0,
    handoff: (status, summary) => {
      // Whatever its pane does from here is a TUI tidying up, not work.
      handedBack = true
      show(
        // `blocked` is the one that means *come here*; a failure is news but not
        // a question, so it settles rather than asking.
        status === "blocked" ? "ask" : "done",
        summary || undefined,
      )
    },
    working: () => {
      // Reaching here at all means something asked the agent to work — a
      // dispatch, a test run, a narrated line. The turn is the agent's again.
      handedBack = false
      // Never interrupt a standing question with "working": the agent going back
      // to work does not answer it. And never talk over words that are still on
      // screen — an agent's TUI keeps repainting after it has finished, which
      // would otherwise wipe "done" a tenth of a second after showing it.
      if (get().state === "ask" || get().text) return
      // Already thinking: this is the same work carrying on, so push the clock
      // out rather than re-showing, which would restart the animation mid-blink.
      if (get().state === "think") return expectMoreWork()
      show("think")
      expectMoreWork()
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
  // An agent that has handed the turn back is not working, however much its
  // pane keeps moving. Only `agentAsked` (or Reado dispatching) hands it back.
  if (handedBack) return
  const now = Date.now()
  if (now - lastBusy < 1000) return
  lastBusy = now
  useMascot.getState().working()
}

/**
 * The user typed into an agent's pane.
 *
 * The one thing that starts a turn Reado did not dispatch: someone answering the
 * agent in its own terminal. It does not claim the agent is working — a
 * keystroke is not work — it only lets the pane's own paints count again.
 */
export function agentAsked(): void {
  handedBack = false
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

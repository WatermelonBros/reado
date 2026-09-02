/**
 * The shared runner for agent-dispatched, file-result tasks.
 *
 * Reado never calls an LLM directly: a feature dispatches a prompt to the
 * terminal agent, the agent writes its answer to a path under `.reado/`, and
 * Reado watches for that file. Five features did that with the same hand-rolled
 * loop — a module-level token, a fixed delay, a capped poll count, then a
 * generic `error` — so a slow agent, a closed modal and a malformed write all
 * came out as the same empty result, and nothing could be cancelled or retried.
 *
 * This owns the loop once, with states the UI can tell apart, cancellation the
 * user can trigger, and retry with backoff. It does not change any on-disk
 * format, and dispatch is still the terminal agent.
 */
import { create } from "zustand"
import { type MessageKey, t } from "@/i18n"
import { dispatchToAgent } from "./agents"
import { notifyError } from "./notice"

/** A task's state — deliberately distinct from "the result was empty". */
export type TaskStatus = "running" | "done" | "failed" | "cancelled" | "timedOut"

/** A finished task: a value only ever accompanies `done`. */
export type Outcome<T> =
  | { status: "done"; value: T }
  | { status: "failed" | "cancelled" | "timedOut"; value: null }

/** Poll cadence. The agent writes its result in its own time; this is a watch,
 *  not a request/response, so the interval is generous. */
export const POLL_MS = 1500
/** Default budget before a task is declared timed out. */
export const TIMEOUT_MS = 90_000

export interface AgentTaskOptions<T> {
  /** Identity of the work. Starting a task with a live id cancels that one —
   *  which is how a feature supersedes its own previous run. */
  id: string
  /** Names the feature, for the in-flight list and the failure notice. */
  labelKey: MessageKey
  /** The prompt for the agent. Omit to poll for work already under way. */
  prompt?: string
  /** Read the raw result. `null`/blank means "not written yet"; a rejection is
   *  treated the same way (the file usually just isn't there). */
  poll: () => Promise<string | null>
  /**
   * Turn a raw result into a value.
   *
   * Return `undefined` for "not ready yet" — a half-written file — and polling
   * continues. **Throw** for a result that is genuinely malformed: the task
   * ends as `failed`, which is the whole point of this runner (a bad write is
   * not an empty success).
   */
  parse: (raw: string) => T | undefined
  /** Give up after this long (rounded to whole poll intervals). */
  timeoutMs?: number
  intervalMs?: number
  /** Re-dispatch and poll again this many times before reporting the failure. */
  retries?: number
  /** Cancels the task alongside the registry's own handle. */
  signal?: AbortSignal
}

/** A task the user can see and cancel. */
export interface InFlight {
  id: string
  labelKey: MessageKey
}

interface AgentTasksState {
  /** Tasks currently polling, in start order. */
  running: InFlight[]
  /** Cancel one by id (no-op if it already finished). */
  cancel: (id: string) => void
}

/** The live handles. Kept outside the store: an AbortController is not state to
 *  render, and putting it in zustand would make every abort a re-render. */
const controllers = new Map<string, AbortController>()

export const useAgentTasks = create<AgentTasksState>(() => ({
  running: [],
  cancel: (id) => controllers.get(id)?.abort(),
}))

/** Resolves after `ms`, or immediately when the signal aborts. Resolving (never
 *  rejecting) keeps the caller's control flow linear: it checks `aborted` next. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
}

function register(id: string, labelKey: MessageKey): AbortController {
  controllers.get(id)?.abort() // supersede our own previous run
  const controller = new AbortController()
  controllers.set(id, controller)
  useAgentTasks.setState((s) => ({
    running: [...s.running.filter((task) => task.id !== id), { id, labelKey }],
  }))
  return controller
}

function unregister(id: string, controller: AbortController) {
  // A superseding run already took this id — leave its entry alone.
  if (controllers.get(id) !== controller) return
  controllers.delete(id)
  useAgentTasks.setState((s) => ({ running: s.running.filter((task) => task.id !== id) }))
}

/** One dispatch-and-watch attempt: poll until the result parses, the budget
 *  runs out, or the task is cancelled. */
async function attempt<T>(
  opts: Pick<AgentTaskOptions<T>, "poll" | "parse">,
  ticks: number,
  intervalMs: number,
  signal: AbortSignal,
): Promise<Outcome<T>> {
  for (let i = 0; i < ticks; i++) {
    await sleep(intervalMs, signal)
    if (signal.aborted) return { status: "cancelled", value: null }
    const raw = await opts.poll().catch(() => null)
    if (signal.aborted) return { status: "cancelled", value: null }
    if (!raw?.trim()) continue
    try {
      const value = opts.parse(raw)
      if (value === undefined) continue // still being written — keep watching
      return { status: "done", value }
    } catch {
      // Malformed, not absent: asking again on the same budget would just burn
      // the clock on the same bad file.
      return { status: "failed", value: null }
    }
  }
  return { status: "timedOut", value: null }
}

/**
 * Dispatch a prompt to the agent and watch for its file result.
 *
 * Resolves with an honest status; failures and timeouts also surface on the
 * notice surface, so a task the user has navigated away from doesn't fail in
 * silence. Cancellation is not a failure and is never announced.
 */
export async function runAgentTask<T>(opts: AgentTaskOptions<T>): Promise<Outcome<T>> {
  const intervalMs = opts.intervalMs ?? POLL_MS
  const ticks = Math.max(1, Math.round((opts.timeoutMs ?? TIMEOUT_MS) / intervalMs))
  const retries = opts.retries ?? 0

  const controller = register(opts.id, opts.labelKey)
  const { signal } = controller
  opts.signal?.addEventListener("abort", () => controller.abort(), { once: true })

  let outcome: Outcome<T> = { status: "cancelled", value: null }
  for (let tries = 0; tries <= retries; tries++) {
    if (tries > 0) {
      // Back off before asking again: an attempt that produced nothing usually
      // means the agent needs longer, not that it needs pestering sooner.
      await sleep(intervalMs * 2 ** tries, signal)
      if (signal.aborted) {
        outcome = { status: "cancelled", value: null }
        break
      }
    }
    if (opts.prompt) void dispatchToAgent(opts.prompt)
    outcome = await attempt(opts, ticks, intervalMs, signal)
    if (outcome.status === "done" || outcome.status === "cancelled") break
  }

  unregister(opts.id, controller)
  if (outcome.status === "failed" || outcome.status === "timedOut") {
    notifyError(
      "agentTask",
      t(outcome.status === "failed" ? "agentTask.failed" : "agentTask.timedOut", {
        label: t(opts.labelKey),
      }),
    )
  }
  return outcome
}

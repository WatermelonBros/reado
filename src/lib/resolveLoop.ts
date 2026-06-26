/**
 * The async resolve loop — the back of the review system.
 *
 * Resolving a batch of task comments is fire-and-forget: queue them, let the
 * agent (with its own subagents) churn, and have Reado hold the *human* end of
 * the loop — track progress as comments resolve, notice when the agent has gone
 * quiet waiting on you, and notify when it's done. Reado issues one batch
 * instruction; it does NOT parallelise the agent itself.
 *
 * State persists to `.reado/resolve-loop.json` so a loop survives a restart, and
 * is published to the Reado Anywhere channel so a paired phone can follow it.
 * Delivery is Anywhere's job; this store only produces the events.
 */
import { create } from "zustand";
import {
  anywherePublishLoop,
  createFile,
  readFile,
  writeFile,
} from "./api";
import { dispatchToAgent } from "./agents";
import { composeReviewPromptForIds } from "./review";
import { useComments } from "./comments";
import { notifyResolved } from "./notify";

const STORE = ".reado/resolve-loop.json";
/** Quiet-time before a running loop is flagged as waiting for the human. */
// ponytail: idle heuristic, not PTY-output parsing — upgrade to terminal-activity
// detection if false "needs approval" flags become a problem.
const IDLE_MS = 90_000;

export type LoopStatus = "running" | "needs_approval" | "finished" | "failed";

export interface LoopState {
  /** Queued task comment ids. */
  ids: string[];
  /** Of those, the ones resolved so far. */
  resolvedIds: string[];
  status: LoopStatus;
  startedAt: number;
  /** Last time a queued comment resolved — drives the idle heuristic. */
  lastProgressAt: number;
  /** The guided session this batch came from, if any. */
  sessionId?: string;
}

async function persist(root: string, active: LoopState | null) {
  if (active) {
    await createFile(root, STORE).catch(() => {});
    await writeFile(root, STORE, JSON.stringify(active, null, 2)).catch(() => {});
  } else {
    await writeFile(root, STORE, "null").catch(() => {});
  }
  // Mirror to the Anywhere channel (best-effort; the server may be off).
  void anywherePublishLoop(active ? JSON.stringify(active) : null).catch(() => {});
}

/** Comment ids that are still open tasks (i.e. not yet resolved by the agent). */
function openTaskIds(): Set<string> {
  return new Set(
    useComments
      .getState()
      .comments.filter((c) => c.kind === "task" && c.state !== "done")
      .map((c) => c.id),
  );
}

interface ResolveLoopState {
  active: LoopState | null;
  load: (root: string) => Promise<void>;
  /** Queue ids (defaults to all open tasks if empty) and dispatch the agent. */
  start: (root: string, ids: string[], sessionId?: string) => Promise<void>;
  /** Recompute progress from the comment store; finish + notify when all done. */
  sync: (root: string) => void;
  /** Idle check: flag needs-approval when the agent has gone quiet. */
  tick: (root: string) => void;
  /** Clear the loop (cancel, or dismiss a finished one). */
  clear: (root: string) => void;
}

export const useResolveLoop = create<ResolveLoopState>((set, get) => ({
  active: null,

  load: async (root) => {
    const c = await readFile(root, STORE).catch(() => null);
    if (!c || c.kind !== "text") return;
    try {
      const parsed = JSON.parse(c.text) as LoopState | null;
      // Only resume a loop that was still going; finished ones start cleared.
      if (parsed && (parsed.status === "running" || parsed.status === "needs_approval")) {
        set({ active: parsed });
        get().sync(root);
      }
    } catch {
      /* malformed — ignore */
    }
  },

  start: async (root, ids, sessionId) => {
    const queue = ids.length
      ? ids
      : [...openTaskIds()];
    if (queue.length === 0) return;
    const now = Date.now();
    const active: LoopState = {
      ids: queue,
      resolvedIds: [],
      status: "running",
      startedAt: now,
      lastProgressAt: now,
      sessionId,
    };
    set({ active });
    void persist(root, active);
    void dispatchToAgent(composeReviewPromptForIds(queue));
  },

  sync: (root) => {
    const active = get().active;
    if (!active || active.status === "finished" || active.status === "failed") return;
    const open = openTaskIds();
    const resolvedIds = active.ids.filter((id) => !open.has(id));
    const progressed = resolvedIds.length !== active.resolvedIds.length;
    const done = resolvedIds.length === active.ids.length;
    const next: LoopState = {
      ...active,
      resolvedIds,
      status: done ? "finished" : "running",
      lastProgressAt: progressed ? Date.now() : active.lastProgressAt,
    };
    set({ active: next });
    void persist(root, next);
    if (done) void notifyResolved(0);
  },

  tick: (root) => {
    const active = get().active;
    if (!active || active.status !== "running") return;
    if (Date.now() - active.lastProgressAt > IDLE_MS) {
      const next = { ...active, status: "needs_approval" as const };
      set({ active: next });
      void persist(root, next);
    }
  },

  clear: (root) => {
    set({ active: null });
    void persist(root, null);
  },
}));

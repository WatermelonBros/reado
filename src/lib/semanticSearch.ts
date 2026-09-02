/**
 * Semantic search: natural-language "where do we…?" over the codebase, answered
 * twice over.
 *
 * The **local index** answers as you type — a rebuildable SQLite/FTS5 table over
 * the project's symbols, paths and prose, ranked by BM25 with declarations
 * boosted. It costs milliseconds and works with no agent running, which is most
 * of what this question needs.
 *
 * The **agent** is the escalation, behind an explicit ask: it reads the code
 * rather than matching words, so it answers what a keyword index can't. Its
 * answers are cached against a hash of the question, and shown as distinctly
 * the agent's, because a reader should know which kind of answer they have.
 */
import { create } from "zustand"
import { sanitizePromptText } from "./agents"
import { runAgentTask, useAgentTasks } from "./agentTask"
import { readFile, type SemanticHit, semanticQuery } from "./api"
import { useProject } from "./store"

const STORE = ".reado/semantic.json"

export interface Hit {
  file: string
  line: number
  snippet: string
  /** The declared symbol the hit sits on — why it ranked where it did. */
  symbol?: string
  /** True for a hit the agent reasoned out rather than the index matched. */
  fromAgent?: boolean
}

type Status = "loading" | "ready" | "error"

/** Stable key for caching an agent answer: the same question shouldn't cost a
 *  second round trip in one session. */
const cacheKey = (query: string) => query.trim().toLowerCase()
const agentCache = new Map<string, Hit[]>()

/** Debounce for the as-you-type local query. Long enough that a fast typist
 *  doesn't run a query per keystroke, short enough to feel immediate. */
const TYPING_MS = 120

/** One task slot: a new query supersedes the one before it. */
const TASK = "semantic"

/** Results the agent wrote. Throws on anything that isn't a JSON array — a bad
 *  write is a failure the user should see, not an empty result set. */
function parse(text: string): Hit[] {
  const raw = JSON.parse(text) as Partial<Hit>[]
  if (!Array.isArray(raw)) throw new Error("not an array")
  return raw
    .filter((h) => h && typeof h.file === "string")
    .map((h) => ({
      file: h.file as string,
      line: typeof h.line === "number" ? h.line : 1,
      snippet: typeof h.snippet === "string" ? h.snippet : "",
    }))
}

interface SemanticState {
  open: boolean
  query: string
  status: Status
  results: Hit[]
  /** True while the agent (not the index) is answering. */
  askingAgent: boolean
  /** Query the local index as the user types. */
  run: (query: string) => void
  /** Escalate to the agent, which reads the code instead of matching words. */
  askAgent: () => void
  close: () => void
}

/** Cancels a stale local query when a newer keystroke supersedes it. */
let localToken = 0

export const useSemanticSearch = create<SemanticState>((set, get) => ({
  open: false,
  query: "",
  status: "loading",
  results: [],
  askingAgent: false,

  run: (query) => {
    const mine = ++localToken
    set({ open: true, query, status: "loading", results: [], askingAgent: false })
    const root = useProject.getState().root
    // A question already asked of the agent keeps its answer: it is the better
    // one, and re-running the index over it would replace it with a worse one.
    const cached = agentCache.get(cacheKey(query))
    if (cached) {
      set({ status: "ready", results: cached })
      return
    }
    void (async () => {
      await new Promise((r) => setTimeout(r, TYPING_MS))
      if (localToken !== mine) return
      const hits = await semanticQuery(root, query).catch(() => [] as SemanticHit[])
      if (localToken !== mine) return
      set({ status: "ready", results: hits })
    })()
  },

  askAgent: () => {
    const query = get().query
    if (!query.trim()) return
    localToken++ // a local answer landing now would look like the agent's
    set({ status: "loading", askingAgent: true })
    const root = useProject.getState().root
    void (async () => {
      const out = await runAgentTask({
        id: TASK,
        labelKey: "semantic.title",
        prompt:
          `Search THIS codebase for what best matches: "${sanitizePromptText(query)}". Return the most ` +
          `relevant locations as JSON, ranked best-first (max 20): ` +
          `[{"file": "rel/path", "line": N, "snippet": "one line"}]. Write it to ` +
          `\`${STORE}\`. Do not modify any other file.`,
        poll: async () => {
          const c = await readFile(root, STORE)
          return c.kind === "text" ? c.text : null
        },
        parse,
      })
      if (out.status === "cancelled") return set({ askingAgent: false })
      if (out.status !== "done") return set({ status: "error", askingAgent: false })
      // Marked as the agent's, and cached: the same question in this session
      // shouldn't cost a second round trip.
      const results = out.value.map((h) => ({ ...h, fromAgent: true }))
      agentCache.set(cacheKey(query), results)
      set({ status: "ready", results, askingAgent: false })
    })()
  },

  close: () => {
    localToken++
    useAgentTasks.getState().cancel(TASK)
    set({ open: false, askingAgent: false })
  },
}))

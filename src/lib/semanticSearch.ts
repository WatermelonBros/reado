/**
 * Semantic search: natural-language "where do we…?" over the codebase. Per Reado's
 * AI model there's no in-app embedding client; instead the query goes to the
 * terminal agent, which searches the repo and writes ranked results to
 * `.reado/semantic.json`. Reado renders them, navigable. (A local embeddings index
 * is a possible future backend; this delivers the user-facing capability now.)
 */
import { create } from "zustand"
import { sanitizePromptText } from "./agents"
import { runAgentTask, useAgentTasks } from "./agentTask"
import { readFile } from "./api"
import { useProject } from "./store"

const STORE = ".reado/semantic.json"

export interface Hit {
  file: string
  line: number
  snippet: string
}

type Status = "loading" | "ready" | "error"

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
  run: (query: string) => void
  close: () => void
}

export const useSemanticSearch = create<SemanticState>((set) => ({
  open: false,
  query: "",
  status: "loading",
  results: [],
  run: (query) => {
    set({ open: true, query, status: "loading", results: [] })
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
      if (out.status === "cancelled") return
      // A well-formed empty answer is "no matches", not a failure — the modal
      // says so rather than blaming the agent.
      set(out.status === "done" ? { status: "ready", results: out.value } : { status: "error" })
    })()
  },
  close: () => {
    useAgentTasks.getState().cancel(TASK)
    set({ open: false })
  },
}))

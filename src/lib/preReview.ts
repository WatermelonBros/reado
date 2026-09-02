/**
 * AI pre-review: the terminal agent analyzes the current changes (git diff) and
 * proposes DRAFT review comments to `.reado/pre-review.json`. Reado lists them;
 * the human approves each (→ a real anchored comment) or discards it. The agent
 * never edits code and never posts comments directly — the human curates.
 */
import { create } from "zustand"
import { runAgentTask, useAgentTasks } from "./agentTask"
import { type CommentType, createFile, readFile, writeFile } from "./api"
import { useComments } from "./comments"
import { createLogger, safeError } from "./logger"

const STORE = ".reado/pre-review.json"
const log = createLogger("preReview")

export interface Draft {
  id: string
  file: string
  line: number
  type: CommentType
  body: string
}

const TYPES: CommentType[] = ["bug", "refactor", "performance", "question", "note"]
const normType = (t: unknown): CommentType =>
  typeof t === "string" && (TYPES as string[]).includes(t) ? (t as CommentType) : "note"

/** One task slot: re-running the pre-review supersedes the run before it. */
const TASK = "prereview"

async function persist(root: string, drafts: Draft[]) {
  await createFile(root, STORE).catch(() => {})
  await writeFile(root, STORE, JSON.stringify(drafts, null, 2)).catch(() => {})
}

/** Drafts as stored on disk. Throws on a malformed payload; `load` treats that
 *  as an empty file, while a *generated* run reports it as a failure. */
function parse(text: string): Draft[] {
  const raw = JSON.parse(text) as Partial<Draft>[]
  if (!Array.isArray(raw)) throw new Error("not an array")
  return raw
    .filter((d) => d && typeof d.file === "string" && d.body)
    .map((d, i) => ({
      id: `pr_${i}_${(d.file ?? "").replace(/[\\/]/g, "_")}_${d.line ?? 0}`,
      file: d.file as string,
      line: typeof d.line === "number" ? d.line : 1,
      type: normType(d.type),
      body: d.body as string,
    }))
}

/** Parse a stored file, tolerating a corrupt one — reading the panel's own store
 *  on open must never throw at the caller. */
function parseStored(text: string): Draft[] {
  try {
    return parse(text)
  } catch (e) {
    log.warn("preReview: malformed drafts JSON, treating as empty", { error: safeError(e) })
    return []
  }
}

interface PreReviewState {
  drafts: Draft[]
  generating: boolean
  /** Set when a run times out with no result — so the panel can show a distinct
   *  error state instead of silently reverting to the empty state. */
  error: boolean
  load: (root: string) => Promise<void>
  generate: (root: string) => void
  /** Stop an in-flight generation (the agent keeps its own work; we stop watching). */
  cancel: () => void
  approve: (root: string, id: string) => Promise<void>
  discard: (root: string, id: string) => void
}

export const usePreReview = create<PreReviewState>((set, get) => ({
  drafts: [],
  generating: false,
  error: false,
  load: async (root) => {
    const c = await readFile(root, STORE).catch(() => null)
    set({ drafts: c && c.kind === "text" ? parseStored(c.text) : [] })
  },
  generate: (root) => {
    set({ generating: true, error: false })
    void (async () => {
      const out = await runAgentTask({
        id: TASK,
        labelKey: "prereview.panel",
        prompt:
          `Review the current uncommitted changes in this repo (run \`git diff\`). For each ` +
          `risky or notable change, propose a short review comment. Write JSON to ` +
          `\`${STORE}\`: an array of {"file": "rel/path", "line": N, "type": ` +
          `"bug|refactor|performance|question|note", "body": "..."}. Do NOT modify any ` +
          `source file — only write that JSON.`,
        poll: async () => {
          const c = await readFile(root, STORE)
          return c.kind === "text" ? c.text : null
        },
        parse,
      })
      if (out.status === "cancelled") return set({ generating: false })
      // Nothing written, or written badly: flag the error so the panel shows that
      // instead of silently reverting to the empty state.
      if (out.status !== "done") return set({ generating: false, error: true })
      set({ drafts: out.value, generating: false })
    })()
  },
  cancel: () => useAgentTasks.getState().cancel(TASK),
  approve: async (root, id) => {
    const draft = get().drafts.find((d) => d.id === id)
    if (!draft) return
    await useComments.getState().create({
      file: draft.file,
      scope: "range",
      startLine: draft.line,
      endLine: draft.line,
      type: draft.type,
      kind: "task",
      body: draft.body,
      context: { snippet: "", before: "", after: "" },
    })
    const drafts = get().drafts.filter((d) => d.id !== id)
    set({ drafts })
    void persist(root, drafts)
  },
  discard: (root, id) => {
    const drafts = get().drafts.filter((d) => d.id !== id)
    set({ drafts })
    void persist(root, drafts)
  },
}))

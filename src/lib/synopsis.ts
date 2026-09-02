/**
 * File synopsis: an AI-generated overview of a file, shown on demand in a modal
 * (never inline at the top of the file). Per Reado's AI model, generation goes
 * through the terminal agent: we dispatch a prompt asking it to write the synopsis
 * to a known `.reado/` path, then watch for that file and render it. Cached on
 * disk; "Regenerate" re-dispatches.
 */
import { create } from "zustand"
import { runAgentTask, useAgentTasks } from "./agentTask"
import { createFile, readFile, writeFile } from "./api"
import { useProject } from "./store"

type Status = "loading" | "ready" | "error"

interface SynopsisState {
  open: boolean
  relPath: string | null
  status: Status
  text: string
  /** True when the source changed since the synopsis was generated. */
  stale: boolean
  show: (relPath: string) => void
  regenerate: () => void
  close: () => void
}

/** Flat, sanitized cache path under `.reado/` for a file's synopsis. */
const synopsisPath = (relPath: string) => `.reado/synopsis/${relPath.replace(/[\\/]/g, "__")}.md`
/** Sidecar storing a hash of the source when the synopsis was made (freshness). */
const freshPath = (relPath: string) => `.reado/synopsis/${relPath.replace(/[\\/]/g, "__")}.hash`

/** Small, fast non-crypto content hash (freshness only, not security). */
function contentHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/** Record the current source hash so future opens can detect staleness. */
async function recordFreshness(root: string, relPath: string) {
  const src = await readFile(root, relPath).catch(() => null)
  if (src?.kind !== "text") return
  await createFile(root, freshPath(relPath)).catch(() => {})
  await writeFile(root, freshPath(relPath), contentHash(src.text)).catch(() => {})
}

/** Whether the source changed since the synopsis was generated. */
async function checkStale(root: string, relPath: string): Promise<boolean> {
  const [side, src] = await Promise.all([
    readFile(root, freshPath(relPath)).catch(() => null),
    readFile(root, relPath).catch(() => null),
  ])
  if (side?.kind !== "text" || !src || src.kind !== "text") return false
  return side.text.trim() !== contentHash(src.text)
}

const prompt = (relPath: string, outPath: string) =>
  `Write a concise reading synopsis of \`${relPath}\` — its purpose, key exports/` +
  `symbols, and how it fits the codebase — as Markdown. Write it to \`${outPath}\` ` +
  `(create the directory if needed). Do not modify any other file.`

/** One task slot: opening a synopsis for another file supersedes the last one. */
const TASK = "synopsis"

/** Whether the modal is still showing the file a pending read was started for —
 *  a late answer for a file the user has left (or closed) must not land. */
const showing = (relPath: string) => {
  const s = useSynopsis.getState()
  return s.open && s.relPath === relPath
}

/** Dispatch the agent and watch for the synopsis it writes. */
async function generate(root: string, relPath: string) {
  const path = synopsisPath(relPath)
  const out = await runAgentTask({
    id: TASK,
    labelKey: "synopsis.title",
    prompt: prompt(relPath, path),
    poll: async () => {
      const c = await readFile(root, path)
      return c.kind === "text" ? c.text : null
    },
    parse: (text) => text,
    timeoutMs: 60_000,
  })
  if (out.status === "cancelled") return // superseded or the modal was closed
  if (out.status !== "done") return useSynopsis.setState({ status: "error" })
  useSynopsis.setState({ status: "ready", text: out.value, stale: false })
  void recordFreshness(root, relPath) // mark this source as the fresh baseline
}

export const useSynopsis = create<SynopsisState>((set) => ({
  open: false,
  relPath: null,
  status: "loading",
  text: "",
  stale: false,
  show: (relPath) => {
    useAgentTasks.getState().cancel(TASK) // drop a watch for the file we left
    set({ open: true, relPath, status: "loading", text: "", stale: false })
    const root = useProject.getState().root
    // Cache hit → show immediately (flagging staleness); else dispatch + watch.
    readFile(root, synopsisPath(relPath))
      .then(async (c) => {
        if (!showing(relPath)) return
        if (c.kind === "text" && c.text.trim()) {
          const stale = await checkStale(root, relPath)
          if (showing(relPath)) set({ status: "ready", text: c.text, stale })
        } else {
          throw new Error("empty")
        }
      })
      .catch(() => {
        if (!showing(relPath)) return
        void generate(root, relPath)
      })
  },
  regenerate: () => {
    const relPath = useSynopsis.getState().relPath
    if (!relPath) return
    set({ status: "loading", text: "", stale: false })
    void generate(useProject.getState().root, relPath)
  },
  close: () => {
    useAgentTasks.getState().cancel(TASK)
    set({ open: false })
  },
}))

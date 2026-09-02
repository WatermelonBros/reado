/**
 * Anchored Q&A: ask the AI a question about a selection; the answer is a durable
 * note anchored to that code. A frontend-managed index (`.reado/qa.json`) records
 * each note (file, line, question); the answer Markdown is written by the terminal
 * agent to `.reado/qa/<id>.md` and read back. Browse/revisit via the QA panel and
 * gutter markers. Distinct from one-off "Explain selection": durable, anchored,
 * question-driven.
 */
import { create } from "zustand"
import { sanitizePromptText } from "./agents"
import { runAgentTask, useAgentTasks } from "./agentTask"
import { createFile, readFile, writeFile } from "./api"
import { createLogger, safeError } from "./logger"
import { useProject } from "./store"

const log = createLogger("qa")

type Status = "loading" | "ready" | "error"

export interface QaNote {
  id: string
  /** Project-relative, forward-slashed path. */
  file: string
  /** 1-based anchor line. */
  line: number
  question: string
  time: number
}

const INDEX = ".reado/qa.json"
const noteId = (file: string, line: number) => `${file.replace(/[\\/]/g, "__")}__L${line}`
const answerPath = (id: string) => `.reado/qa/${id}.md`

const promptFor = (file: string, from: number, to: number, question: string, out: string) =>
  `Answer this question about \`${file}\` lines ${from}-${to}: "${question}". Use the ` +
  `code as context. Write a Markdown note containing the question and your answer to ` +
  `\`${out}\` (create the directory if needed). Do not modify any other file.`

/** One task slot: asking again (or viewing another note) supersedes the last. */
const TASK = "qa"

async function loadIndex(root: string): Promise<QaNote[]> {
  const c = await readFile(root, INDEX).catch(() => null)
  if (c && c.kind === "text") {
    try {
      return JSON.parse(c.text) as QaNote[]
    } catch (e) {
      log.warn("qa: corrupt notes index, treating as empty", { error: safeError(e) })
    }
  }
  return []
}

async function saveIndex(root: string, notes: QaNote[]) {
  await createFile(root, INDEX).catch(() => {}) // ensure it exists for write_file
  await writeFile(root, INDEX, JSON.stringify(notes, null, 2)).catch(() => {})
}

/** Dispatch the question and watch for the answer note the agent writes. */
async function answer(root: string, path: string, prompt: string) {
  const out = await runAgentTask({
    id: TASK,
    labelKey: "qa.title",
    prompt,
    poll: async () => {
      const c = await readFile(root, path)
      return c.kind === "text" ? c.text : null
    },
    parse: (text) => text,
    timeoutMs: 60_000,
  })
  if (out.status === "cancelled") return
  useQa.setState(out.status === "done" ? { status: "ready", text: out.value } : { status: "error" })
}

interface QaState {
  open: boolean
  relPath: string | null
  status: Status
  text: string
  /** All anchored Q&A notes for this project (for the panel + gutter). */
  notes: QaNote[]
  load: (root: string) => Promise<void>
  /** Ask a new question about a selection and generate the answer. */
  ask: (relPath: string, from: number, to: number, question: string) => void
  /** Open the modal for an existing note (reads its answer file). */
  view: (note: QaNote) => void
  /** Delete a note (index entry; the answer file is left on disk). */
  remove: (root: string, id: string) => void
  close: () => void
}

export const useQa = create<QaState>((set, get) => ({
  open: false,
  relPath: null,
  status: "loading",
  text: "",
  notes: [],
  load: async (root) => set({ notes: await loadIndex(root) }),
  ask: (relPath, from, to, question) => {
    set({ open: true, relPath, status: "loading", text: "" })
    const root = useProject.getState().root
    const id = noteId(relPath, from)
    const out = answerPath(id)
    // Upsert the index (anchor by file+line, so re-asking updates in place).
    const notes = [
      { id, file: relPath, line: from, question, time: Date.now() },
      ...get().notes.filter((n) => n.id !== id),
    ]
    set({ notes })
    void saveIndex(root, notes)
    void answer(root, out, promptFor(relPath, from, to, sanitizePromptText(question), out))
  },
  view: (note) => {
    useAgentTasks.getState().cancel(TASK) // a pending answer is no longer on screen
    set({ open: true, relPath: note.file, status: "loading", text: "" })
    const viewing = () => useQa.getState().open && useQa.getState().relPath === note.file
    readFile(useProject.getState().root, answerPath(note.id))
      .then((c) => {
        if (!viewing()) return
        if (c.kind === "text" && c.text.trim()) set({ status: "ready", text: c.text })
        else set({ status: "error" })
      })
      .catch(() => viewing() && set({ status: "error" }))
  },
  remove: (root, id) => {
    const notes = get().notes.filter((n) => n.id !== id)
    set({ notes })
    void saveIndex(root, notes)
  },
  close: () => {
    useAgentTasks.getState().cancel(TASK)
    set({ open: false })
  },
}))

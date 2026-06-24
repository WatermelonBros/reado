/**
 * Anchored Q&A: ask the AI a question about a selection; the answer is a durable
 * note anchored to that code. A frontend-managed index (`.reado/qa.json`) records
 * each note (file, line, question); the answer Markdown is written by the terminal
 * agent to `.reado/qa/<id>.md` and read back. Browse/revisit via the QA panel and
 * gutter markers. Distinct from one-off "Explain selection": durable, anchored,
 * question-driven.
 */
import { create } from "zustand";
import { readFile, createFile, writeFile } from "./api";
import { runInTerminal, sanitizePromptText } from "./agents";
import { useProject } from "./store";

type Status = "loading" | "ready" | "error";

export interface QaNote {
  id: string;
  /** Project-relative, forward-slashed path. */
  file: string;
  /** 1-based anchor line. */
  line: number;
  question: string;
  time: number;
}

const INDEX = ".reado/qa.json";
const noteId = (file: string, line: number) => `${file.replace(/[\\/]/g, "__")}__L${line}`;
const answerPath = (id: string) => `.reado/qa/${id}.md`;

const promptFor = (file: string, from: number, to: number, question: string, out: string) =>
  `Answer this question about \`${file}\` lines ${from}-${to}: "${question}". Use the ` +
  `code as context. Write a Markdown note containing the question and your answer to ` +
  `\`${out}\` (create the directory if needed). Do not modify any other file.`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

async function loadIndex(root: string): Promise<QaNote[]> {
  const c = await readFile(root, INDEX).catch(() => null);
  if (c && c.kind === "text") {
    try {
      return JSON.parse(c.text) as QaNote[];
    } catch {
      /* corrupt → empty */
    }
  }
  return [];
}

async function saveIndex(root: string, notes: QaNote[]) {
  await createFile(root, INDEX).catch(() => {}); // ensure it exists for write_file
  await writeFile(root, INDEX, JSON.stringify(notes, null, 2)).catch(() => {});
}

async function poll(root: string, path: string, mine: number) {
  for (let i = 0; i < 40; i++) {
    await delay(1500);
    if (token !== mine) return;
    const c = await readFile(root, path).catch(() => null);
    if (c && c.kind === "text" && c.text.trim()) {
      useQa.setState({ status: "ready", text: c.text });
      return;
    }
  }
  if (token === mine) useQa.setState({ status: "error" });
}

interface QaState {
  open: boolean;
  relPath: string | null;
  status: Status;
  text: string;
  /** All anchored Q&A notes for this project (for the panel + gutter). */
  notes: QaNote[];
  load: (root: string) => Promise<void>;
  /** Ask a new question about a selection and generate the answer. */
  ask: (relPath: string, from: number, to: number, question: string) => void;
  /** Open the modal for an existing note (reads its answer file). */
  view: (note: QaNote) => void;
  /** Delete a note (index entry; the answer file is left on disk). */
  remove: (root: string, id: string) => void;
  close: () => void;
}

export const useQa = create<QaState>((set, get) => ({
  open: false,
  relPath: null,
  status: "loading",
  text: "",
  notes: [],
  load: async (root) => set({ notes: await loadIndex(root) }),
  ask: (relPath, from, to, question) => {
    const mine = ++token;
    set({ open: true, relPath, status: "loading", text: "" });
    const root = useProject.getState().root;
    const id = noteId(relPath, from);
    const out = answerPath(id);
    // Upsert the index (anchor by file+line, so re-asking updates in place).
    const notes = [
      { id, file: relPath, line: from, question, time: Date.now() },
      ...get().notes.filter((n) => n.id !== id),
    ];
    set({ notes });
    void saveIndex(root, notes);
    runInTerminal(promptFor(relPath, from, to, sanitizePromptText(question), out));
    void poll(root, out, mine);
  },
  view: (note) => {
    const mine = ++token;
    set({ open: true, relPath: note.file, status: "loading", text: "" });
    readFile(useProject.getState().root, answerPath(note.id))
      .then((c) => {
        if (token !== mine) return;
        if (c.kind === "text" && c.text.trim()) set({ status: "ready", text: c.text });
        else set({ status: "error" });
      })
      .catch(() => token === mine && set({ status: "error" }));
  },
  remove: (root, id) => {
    const notes = get().notes.filter((n) => n.id !== id);
    set({ notes });
    void saveIndex(root, notes);
  },
  close: () => {
    token++;
    set({ open: false });
  },
}));

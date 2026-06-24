/**
 * Anchored Q&A: ask the AI a question about a selection; the answer is a durable
 * note anchored to that code (a `.reado/qa/<file>__L<line>.md` artifact), so it
 * survives and can be revisited. Like synopsis/onboarding, generation runs through
 * the terminal agent (prompt → file → poll). Distinct from one-off "Explain
 * selection": durable, anchored, question-driven.
 */
import { create } from "zustand";
import { readFile } from "./api";
import { runInTerminal } from "./agents";
import { useProject } from "./store";

type Status = "loading" | "ready" | "error";

const qaPath = (relPath: string, line: number) =>
  `.reado/qa/${relPath.replace(/[\\/]/g, "__")}__L${line}.md`;

const prompt = (relPath: string, from: number, to: number, question: string, outPath: string) =>
  `Answer this question about \`${relPath}\` lines ${from}-${to}: "${question}". ` +
  `Use the code as context. Write a Markdown note containing the question and your ` +
  `answer to \`${outPath}\` (create the directory if needed). Do not modify any other file.`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

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
  /** Ask a new question about a selection and generate the answer. */
  ask: (relPath: string, from: number, to: number, question: string) => void;
  close: () => void;
}

export const useQa = create<QaState>((set) => ({
  open: false,
  relPath: null,
  status: "loading",
  text: "",
  ask: (relPath, from, to, question) => {
    const mine = ++token;
    set({ open: true, relPath, status: "loading", text: "" });
    const path = qaPath(relPath, from);
    runInTerminal(prompt(relPath, from, to, question, path));
    void poll(useProject.getState().root, path, mine);
  },
  close: () => {
    token++;
    set({ open: false });
  },
}));

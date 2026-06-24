/**
 * File synopsis: an AI-generated overview of a file, shown on demand in a modal
 * (never inline at the top of the file). Per Reado's AI model, generation goes
 * through the terminal agent: we dispatch a prompt asking it to write the synopsis
 * to a known `.reado/` path, then watch for that file and render it. Cached on
 * disk; "Regenerate" re-dispatches.
 */
import { create } from "zustand";
import { readFile } from "./api";
import { runInTerminal } from "./agents";
import { useProject } from "./store";

type Status = "loading" | "ready" | "error";

interface SynopsisState {
  open: boolean;
  relPath: string | null;
  status: Status;
  text: string;
  show: (relPath: string) => void;
  regenerate: () => void;
  close: () => void;
}

/** Flat, sanitized cache path under `.reado/` for a file's synopsis. */
const synopsisPath = (relPath: string) =>
  `.reado/synopsis/${relPath.replace(/[\\/]/g, "__")}.md`;

const prompt = (relPath: string, outPath: string) =>
  `Write a concise reading synopsis of \`${relPath}\` — its purpose, key exports/` +
  `symbols, and how it fits the codebase — as Markdown. Write it to \`${outPath}\` ` +
  `(create the directory if needed). Do not modify any other file.`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cancels a stale poll when the user closes the modal or switches files.
let token = 0;

async function poll(root: string, relPath: string, mine: number) {
  const path = synopsisPath(relPath);
  for (let i = 0; i < 40; i++) {
    await delay(1500);
    if (token !== mine) return; // superseded / closed
    const c = await readFile(root, path).catch(() => null);
    if (c && c.kind === "text" && c.text.trim()) {
      useSynopsis.setState({ status: "ready", text: c.text });
      return;
    }
  }
  if (token === mine) useSynopsis.setState({ status: "error" });
}

export const useSynopsis = create<SynopsisState>((set) => ({
  open: false,
  relPath: null,
  status: "loading",
  text: "",
  show: (relPath) => {
    const mine = ++token;
    set({ open: true, relPath, status: "loading", text: "" });
    const root = useProject.getState().root;
    // Cache hit → show immediately; else dispatch the agent and poll.
    readFile(root, synopsisPath(relPath))
      .then((c) => {
        if (token !== mine) return;
        if (c.kind === "text" && c.text.trim()) {
          set({ status: "ready", text: c.text });
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        if (token !== mine) return;
        runInTerminal(prompt(relPath, synopsisPath(relPath)));
        void poll(root, relPath, mine);
      });
  },
  regenerate: () => {
    const relPath = useSynopsis.getState().relPath;
    if (!relPath) return;
    const mine = ++token;
    set({ status: "loading", text: "" });
    const root = useProject.getState().root;
    runInTerminal(prompt(relPath, synopsisPath(relPath)));
    void poll(root, relPath, mine);
  },
  close: () => {
    token++; // cancel any in-flight poll
    set({ open: false });
  },
}));

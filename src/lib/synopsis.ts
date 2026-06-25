/**
 * File synopsis: an AI-generated overview of a file, shown on demand in a modal
 * (never inline at the top of the file). Per Reado's AI model, generation goes
 * through the terminal agent: we dispatch a prompt asking it to write the synopsis
 * to a known `.reado/` path, then watch for that file and render it. Cached on
 * disk; "Regenerate" re-dispatches.
 */
import { create } from "zustand";
import { readFile, createFile, writeFile } from "./api";
import { dispatchToAgent } from "./agents";
import { useProject } from "./store";

type Status = "loading" | "ready" | "error";

interface SynopsisState {
  open: boolean;
  relPath: string | null;
  status: Status;
  text: string;
  /** True when the source changed since the synopsis was generated. */
  stale: boolean;
  show: (relPath: string) => void;
  regenerate: () => void;
  close: () => void;
}

/** Flat, sanitized cache path under `.reado/` for a file's synopsis. */
const synopsisPath = (relPath: string) =>
  `.reado/synopsis/${relPath.replace(/[\\/]/g, "__")}.md`;
/** Sidecar storing a hash of the source when the synopsis was made (freshness). */
const freshPath = (relPath: string) =>
  `.reado/synopsis/${relPath.replace(/[\\/]/g, "__")}.hash`;

/** Small, fast non-crypto content hash (freshness only, not security). */
function contentHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** Record the current source hash so future opens can detect staleness. */
async function recordFreshness(root: string, relPath: string) {
  const src = await readFile(root, relPath).catch(() => null);
  if (!src || src.kind !== "text") return;
  await createFile(root, freshPath(relPath)).catch(() => {});
  await writeFile(root, freshPath(relPath), contentHash(src.text)).catch(() => {});
}

/** Whether the source changed since the synopsis was generated. */
async function checkStale(root: string, relPath: string): Promise<boolean> {
  const [side, src] = await Promise.all([
    readFile(root, freshPath(relPath)).catch(() => null),
    readFile(root, relPath).catch(() => null),
  ]);
  if (!side || side.kind !== "text" || !src || src.kind !== "text") return false;
  return side.text.trim() !== contentHash(src.text);
}

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
      useSynopsis.setState({ status: "ready", text: c.text, stale: false });
      void recordFreshness(root, relPath); // mark this source as the fresh baseline
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
  stale: false,
  show: (relPath) => {
    const mine = ++token;
    set({ open: true, relPath, status: "loading", text: "", stale: false });
    const root = useProject.getState().root;
    // Cache hit → show immediately (flagging staleness); else dispatch + poll.
    readFile(root, synopsisPath(relPath))
      .then(async (c) => {
        if (token !== mine) return;
        if (c.kind === "text" && c.text.trim()) {
          const stale = await checkStale(root, relPath);
          if (token === mine) set({ status: "ready", text: c.text, stale });
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        if (token !== mine) return;
        void dispatchToAgent(prompt(relPath, synopsisPath(relPath)));
        void poll(root, relPath, mine);
      });
  },
  regenerate: () => {
    const relPath = useSynopsis.getState().relPath;
    if (!relPath) return;
    const mine = ++token;
    set({ status: "loading", text: "", stale: false });
    const root = useProject.getState().root;
    void dispatchToAgent(prompt(relPath, synopsisPath(relPath)));
    void poll(root, relPath, mine);
  },
  close: () => {
    token++; // cancel any in-flight poll
    set({ open: false });
  },
}));

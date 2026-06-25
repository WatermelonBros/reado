/**
 * AI pre-review: the terminal agent analyzes the current changes (git diff) and
 * proposes DRAFT review comments to `.reado/pre-review.json`. Reado lists them;
 * the human approves each (→ a real anchored comment) or discards it. The agent
 * never edits code and never posts comments directly — the human curates.
 */
import { create } from "zustand";
import { readFile, createFile, writeFile, type CommentType } from "./api";
import { dispatchToAgent } from "./agents";
import { useComments } from "./comments";

const STORE = ".reado/pre-review.json";

export interface Draft {
  id: string;
  file: string;
  line: number;
  type: CommentType;
  body: string;
}

const TYPES: CommentType[] = ["bug", "refactor", "performance", "question", "note"];
const normType = (t: unknown): CommentType =>
  typeof t === "string" && (TYPES as string[]).includes(t) ? (t as CommentType) : "note";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

async function persist(root: string, drafts: Draft[]) {
  await createFile(root, STORE).catch(() => {});
  await writeFile(root, STORE, JSON.stringify(drafts, null, 2)).catch(() => {});
}

function parse(text: string): Draft[] {
  try {
    const raw = JSON.parse(text) as Partial<Draft>[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((d) => d && typeof d.file === "string" && d.body)
      .map((d, i) => ({
        id: `pr_${i}_${(d.file ?? "").replace(/[\\/]/g, "_")}_${d.line ?? 0}`,
        file: d.file as string,
        line: typeof d.line === "number" ? d.line : 1,
        type: normType(d.type),
        body: d.body as string,
      }));
  } catch {
    return [];
  }
}

interface PreReviewState {
  drafts: Draft[];
  generating: boolean;
  load: (root: string) => Promise<void>;
  generate: (root: string) => void;
  approve: (root: string, id: string) => Promise<void>;
  discard: (root: string, id: string) => void;
}

export const usePreReview = create<PreReviewState>((set, get) => ({
  drafts: [],
  generating: false,
  load: async (root) => {
    const c = await readFile(root, STORE).catch(() => null);
    set({ drafts: c && c.kind === "text" ? parse(c.text) : [] });
  },
  generate: (root) => {
    const mine = ++token;
    set({ generating: true });
    void dispatchToAgent(
      `Review the current uncommitted changes in this repo (run \`git diff\`). For each ` +
        `risky or notable change, propose a short review comment. Write JSON to ` +
        `\`${STORE}\`: an array of {"file": "rel/path", "line": N, "type": ` +
        `"bug|refactor|performance|question|note", "body": "..."}. Do NOT modify any ` +
        `source file — only write that JSON.`,
    );
    void (async () => {
      for (let i = 0; i < 60; i++) {
        await delay(1500);
        if (token !== mine) return;
        const c = await readFile(root, STORE).catch(() => null);
        if (c && c.kind === "text" && c.text.trim()) {
          set({ drafts: parse(c.text), generating: false });
          return;
        }
      }
      if (token === mine) set({ generating: false });
    })();
  },
  approve: async (root, id) => {
    const draft = get().drafts.find((d) => d.id === id);
    if (!draft) return;
    await useComments.getState().create({
      file: draft.file,
      scope: "range",
      startLine: draft.line,
      endLine: draft.line,
      type: draft.type,
      kind: "task",
      body: draft.body,
      context: { snippet: "", before: "", after: "" },
    });
    const drafts = get().drafts.filter((d) => d.id !== id);
    set({ drafts });
    void persist(root, drafts);
  },
  discard: (root, id) => {
    const drafts = get().drafts.filter((d) => d.id !== id);
    set({ drafts });
    void persist(root, drafts);
  },
}));

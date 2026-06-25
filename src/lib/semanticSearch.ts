/**
 * Semantic search: natural-language "where do we…?" over the codebase. Per Reado's
 * AI model there's no in-app embedding client; instead the query goes to the
 * terminal agent, which searches the repo and writes ranked results to
 * `.reado/semantic.json`. Reado renders them, navigable. (A local embeddings index
 * is a possible future backend; this delivers the user-facing capability now.)
 */
import { create } from "zustand";
import { readFile } from "./api";
import { dispatchToAgent, sanitizePromptText } from "./agents";
import { useProject } from "./store";

const STORE = ".reado/semantic.json";

export interface Hit {
  file: string;
  line: number;
  snippet: string;
}

type Status = "loading" | "ready" | "error";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

function parse(text: string): Hit[] {
  try {
    const raw = JSON.parse(text) as Partial<Hit>[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((h) => h && typeof h.file === "string")
      .map((h) => ({
        file: h.file as string,
        line: typeof h.line === "number" ? h.line : 1,
        snippet: typeof h.snippet === "string" ? h.snippet : "",
      }));
  } catch {
    return [];
  }
}

interface SemanticState {
  open: boolean;
  query: string;
  status: Status;
  results: Hit[];
  run: (query: string) => void;
  close: () => void;
}

export const useSemanticSearch = create<SemanticState>((set) => ({
  open: false,
  query: "",
  status: "loading",
  results: [],
  run: (query) => {
    const mine = ++token;
    set({ open: true, query, status: "loading", results: [] });
    const root = useProject.getState().root;
    void dispatchToAgent(
      `Search THIS codebase for what best matches: "${sanitizePromptText(query)}". Return the most ` +
        `relevant locations as JSON, ranked best-first (max 20): ` +
        `[{"file": "rel/path", "line": N, "snippet": "one line"}]. Write it to ` +
        `\`${STORE}\`. Do not modify any other file.`,
    );
    void (async () => {
      for (let i = 0; i < 60; i++) {
        await delay(1500);
        if (token !== mine) return;
        const c = await readFile(root, STORE).catch(() => null);
        if (c && c.kind === "text" && c.text.trim()) {
          const results = parse(c.text);
          set({ status: results.length ? "ready" : "error", results });
          return;
        }
      }
      if (token === mine) set({ status: "error" });
    })();
  },
  close: () => {
    token++;
    set({ open: false });
  },
}));

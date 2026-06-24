/**
 * Repo onboarding: an AI-generated "understand this repo in 5 minutes" overview
 * (architecture, entry points, key modules). Like file-synopsis, generation goes
 * through the terminal agent — a prompt asks it to write the overview to
 * `.reado/onboarding.md`; Reado polls for it and renders it with file links.
 */
import { create } from "zustand";
import { readFile } from "./api";
import { runInTerminal } from "./agents";
import { useProject } from "./store";

type Status = "loading" | "ready" | "error";

const PATH = ".reado/onboarding.md";

const PROMPT =
  `Write a concise onboarding overview of THIS repository — its architecture, the ` +
  `main entry points, and the key modules/directories and how they connect — as ` +
  `Markdown, to \`${PATH}\` (create the directory if needed). Link key files using ` +
  `relative Markdown links (e.g. \`[src/lib/store.ts](src/lib/store.ts)\`). Do not ` +
  `modify any other file.`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0;

async function poll(root: string, mine: number) {
  for (let i = 0; i < 60; i++) {
    await delay(1500);
    if (token !== mine) return;
    const c = await readFile(root, PATH).catch(() => null);
    if (c && c.kind === "text" && c.text.trim()) {
      useOnboarding.setState({ status: "ready", text: c.text });
      return;
    }
  }
  if (token === mine) useOnboarding.setState({ status: "error" });
}

interface OnboardingState {
  open: boolean;
  status: Status;
  text: string;
  show: () => void;
  regenerate: () => void;
  close: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  open: false,
  status: "loading",
  text: "",
  show: () => {
    const mine = ++token;
    set({ open: true, status: "loading", text: "" });
    const root = useProject.getState().root;
    readFile(root, PATH)
      .then((c) => {
        if (token !== mine) return;
        if (c.kind === "text" && c.text.trim()) set({ status: "ready", text: c.text });
        else throw new Error("empty");
      })
      .catch(() => {
        if (token !== mine) return;
        runInTerminal(PROMPT);
        void poll(root, mine);
      });
  },
  regenerate: () => {
    const mine = ++token;
    set({ status: "loading", text: "" });
    runInTerminal(PROMPT);
    void poll(useProject.getState().root, mine);
  },
  close: () => {
    token++;
    set({ open: false });
  },
}));

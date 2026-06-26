/**
 * The forge adapter (pull-request-review) — the bridge to a hosted PR/MR.
 *
 * Detect the forge from the origin remote, drive its CLI (gh/glab) to list a
 * request and check it out as a guided-review *source*, and submit the session
 * back as one batched review with a verdict. The read-first walk, route and
 * curation belong to guided-pair-review; this store only opens the request and
 * round-trips the result. A repo with no adapter still reviews locally.
 */
import { create } from "zustand";
import {
  detectForge,
  forgeCheckoutPr,
  forgeCliPresent,
  forgeListPrs,
  forgePullThreads,
  forgeSubmitReview,
  type Forge,
  type Objective,
  type Pr,
  type Verdict,
} from "./api";
import { runInTerminal } from "./agents";
import { currentOS, type OS } from "./extensions";
import { useGuidedReview } from "./guidedReview";
import { useComments } from "./comments";

/** The install command for each forge CLI, per OS (shown then user-run). */
const INSTALL: Record<string, Record<OS, string>> = {
  gh: {
    mac: "brew install gh",
    windows: "winget install --id GitHub.cli",
    linux: "brew install gh",
  },
  glab: {
    mac: "brew install glab",
    windows: "winget install --id glab.glab",
    linux: "brew install glab",
  },
};

/** The install command for a forge CLI on the current OS, if known. */
export function installCommandFor(cli: string): string | null {
  return INSTALL[cli]?.[currentOS()] ?? null;
}

interface ForgeState {
  forge: Forge | null;
  /** Whether the matching CLI is installed (null = unknown/not applicable). */
  cliPresent: boolean | null;
  prs: Pr[];
  loadingPrs: boolean;
  detect: (root: string) => Promise<void>;
  listPrs: (root: string) => Promise<void>;
  /** Run the matching CLI's install command in the terminal (user-confirmed). */
  installCli: () => void;
  /** Check out a PR/MR and start a guided review scoped to it. */
  openPr: (root: string, pr: Pr, objective?: Objective) => Promise<string | null>;
  /** Re-pull a PR/MR's host threads, reflecting their resolved state. */
  pullThreads: (root: string, number: number) => Promise<void>;
  /** Submit the current PR session as a batched review with a verdict. */
  submit: (root: string, number: number, verdict: Verdict, body: string) => Promise<string | null>;
}

export const useForge = create<ForgeState>((set, get) => ({
  forge: null,
  cliPresent: null,
  prs: [],
  loadingPrs: false,

  detect: async (root) => {
    const forge = await detectForge(root).catch(() => null);
    let cliPresent: boolean | null = null;
    if (forge?.cli) cliPresent = await forgeCliPresent(forge.cli).catch(() => false);
    set({ forge, cliPresent });
  },

  listPrs: async (root) => {
    set({ loadingPrs: true });
    const prs = await forgeListPrs(root).catch(() => []);
    set({ prs, loadingPrs: false });
  },

  installCli: () => {
    const cli = get().forge?.cli;
    if (!cli) return;
    const cmd = installCommandFor(cli);
    if (cmd) runInTerminal(cmd);
  },

  openPr: async (root, pr, objective) => {
    try {
      await forgeCheckoutPr(root, pr.number);
    } catch {
      return null; // surfaced by the caller; the branch wasn't checked out
    }
    const session = await useGuidedReview
      .getState()
      .start(root, { kind: "pr", pr: `#${pr.number}` }, objective);
    // Pull the request's existing review threads into the inbox.
    await get().pullThreads(root, pr.number);
    return session?.id ?? null;
  },

  pullThreads: async (root, number) => {
    const res = await forgePullThreads(root, number).catch(() => ({ comments: [], dropped: 0 }));
    // A partial sync is reported, not hidden (the rest still import).
    if (res.dropped > 0) {
      console.warn(`Reado: ${res.dropped} host review thread(s) failed to import`);
    }
    // The threads were upserted as comments on disk; reload the inbox.
    await useComments.getState().load(root);
  },

  submit: async (root, number, verdict, body) => {
    try {
      await forgeSubmitReview(root, number, verdict, body);
      return null;
    } catch (e) {
      return String(e);
    }
  },
}));

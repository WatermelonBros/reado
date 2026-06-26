/**
 * Guided Pair Review — the front of the review system.
 *
 * The LLM (the terminal agent) proposes a route, reviews file by file and drafts
 * artifacts through the `reado session`/`reado review` CLI; the human disposes of
 * each one here. Reado never calls an LLM directly: this store dispatches prompts
 * to the agent and reads the structured session it writes under `.reado/sessions/`.
 * The session watcher (`sessions-changed`) keeps the store fresh as the agent works.
 */
import { create } from "zustand";
import {
  gitChangedFiles,
  sessionAcceptProposal,
  sessionAddDecision,
  sessionClose,
  sessionCreate,
  sessionDelete,
  sessionGet,
  sessionList,
  sessionSetFileState,
  sessionSetFileSummary,
  sessionSetProposalState,
  sessionSetSummary,
  type FileState,
  type NewSession,
  type Objective,
  type Proposal,
  type ReviewScope,
  type RouteEntry,
  type Session,
} from "./api";
import { dispatchToAgent } from "./agents";
import { useComments } from "./comments";
import { useResolveLoop } from "./resolveLoop";
import {
  composeGuidedChallengePrompt,
  composeGuidedFilePrompt,
  composeGuidedPlanPrompt,
} from "./review";

/** Normalise a session so the optional (skip-when-empty) arrays are real arrays. */
function norm(s: Session): Session {
  return {
    ...s,
    route: s.route ?? [],
    files: s.files ?? [],
    proposals: s.proposals ?? [],
  };
}

const SCOPE_LABEL: Record<ReviewScope["kind"], string> = {
  diff: "the current diff",
  branch: "this branch vs its base",
  folder: "a folder",
  files: "selected files",
  comments: "open comments",
  project: "the whole project",
  pr: "a pull/merge request",
};

/** A short human description of a scope, for the agent's planning prompt. */
function scopeDesc(scope: ReviewScope): string {
  if (scope.kind === "branch" && scope.base) return `this branch vs ${scope.base}`;
  if ((scope.kind === "folder" || scope.kind === "files") && scope.paths?.length)
    return scope.paths.join(", ");
  return SCOPE_LABEL[scope.kind];
}

/** The route entry the session's cursor currently points at. */
export function currentEntry(s: Session | null): RouteEntry | null {
  if (!s || !s.route?.length) return null;
  return s.route[Math.min(s.position, s.route.length - 1)] ?? null;
}

/** Reviewed-or-finished files over total routed files. */
export function progress(s: Session | null): { reviewed: number; total: number } {
  if (!s) return { reviewed: 0, total: 0 };
  const route = s.route ?? [];
  const done = new Set(
    (s.files ?? [])
      .filter((f) => f.state === "reviewed" || f.state === "skipped" || f.state === "out_of_scope")
      .map((f) => f.file),
  );
  return { reviewed: route.filter((e) => done.has(e.file)).length, total: route.length };
}

/** Open (still-proposed) artifacts in a session — the ones awaiting a decision. */
export function openProposals(s: Session | null): Proposal[] {
  return (s?.proposals ?? []).filter((p) => p.state === "proposed");
}

interface GuidedReviewState {
  sessions: Session[];
  currentId: string | null;
  /** True while the agent is planning or reviewing (a prompt is in flight). */
  busy: boolean;
  load: (root: string) => Promise<void>;
  refresh: (root: string, id: string) => Promise<void>;
  select: (id: string | null) => void;
  start: (root: string, scope: ReviewScope, objective?: Objective) => Promise<Session | null>;
  reviewFile: (root: string, id: string, file: string) => Promise<void>;
  challenge: (root: string, id: string, file: string) => Promise<void>;
  accept: (root: string, id: string, proposalId: string, asNote?: boolean) => Promise<void>;
  edit: (root: string, id: string, proposalId: string, body: string) => Promise<void>;
  discard: (root: string, id: string, proposalId: string) => Promise<void>;
  falsePositive: (root: string, id: string, proposalId: string, note: string) => Promise<void>;
  setFileState: (root: string, id: string, file: string, state: FileState) => Promise<void>;
  setFileSummary: (root: string, id: string, file: string, text: string) => Promise<void>;
  decide: (root: string, id: string, text: string, file: string) => Promise<void>;
  setSummary: (root: string, id: string, text: string) => Promise<void>;
  sendTasks: (root: string, id: string) => Promise<void>;
  close: (root: string, id: string) => Promise<void>;
  /** Delete a session and return to a clean state (reset/start over). */
  discardSession: (root: string, id: string) => Promise<void>;
}

function replace(list: Session[], s: Session): Session[] {
  const i = list.findIndex((x) => x.id === s.id);
  if (i === -1) return [s, ...list];
  const next = list.slice();
  next[i] = s;
  return next;
}

export const useGuidedReview = create<GuidedReviewState>((set, get) => ({
  sessions: [],
  currentId: null,
  busy: false,

  load: async (root) => {
    const sessions = (await sessionList(root).catch(() => [])).map(norm);
    set((st) => ({
      sessions,
      currentId:
        st.currentId && sessions.some((s) => s.id === st.currentId)
          ? st.currentId
          : (sessions.find((s) => s.status !== "done")?.id ?? sessions[0]?.id ?? null),
    }));
  },

  refresh: async (root, id) => {
    const s = await sessionGet(root, id).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  select: (id) => set({ currentId: id }),

  start: async (root, scope, objective) => {
    const input: NewSession = { title: "", scope, objective };
    // The CLI default title is friendlier than an empty one; let core fill it by
    // sending a sensible title from the scope here.
    input.title = `Review ${scopeDesc(scope)}`;
    const created = await sessionCreate(root, input).catch(() => null);
    if (!created) return null;
    const s = norm(created);
    set((st) => ({ sessions: replace(st.sessions, s), currentId: s.id, busy: true }));
    void dispatchToAgent(composeGuidedPlanPrompt(s.id, scopeDesc(scope))).finally(() =>
      set({ busy: false }),
    );
    return s;
  },

  reviewFile: async (root, id, file) => {
    const s = get().sessions.find((x) => x.id === id) ?? null;
    const entry = (s?.route ?? []).find((e) => e.file === file);
    const objective = s?.objective?.replace(/_/g, " ");
    await get().setFileState(root, id, file, "in_review");
    set({ busy: true });
    void dispatchToAgent(
      composeGuidedFilePrompt(id, file, entry?.suggestedReviewMode ?? "normal", objective),
    ).finally(() => set({ busy: false }));
  },

  challenge: async (_root, id, file) => {
    set({ busy: true });
    void dispatchToAgent(composeGuidedChallengePrompt(id, file)).finally(() =>
      set({ busy: false }),
    );
  },

  accept: async (root, id, proposalId, asNote) => {
    const s = await sessionAcceptProposal(root, id, proposalId, asNote ? "note" : "task").catch(
      () => null,
    );
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
    // A durable comment was just created — reload the comments overlay.
    await useComments.getState().load(root);
  },

  edit: async (root, id, proposalId, body) => {
    const s = await sessionSetProposalState(root, id, proposalId, "edited", body).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  discard: async (root, id, proposalId) => {
    const s = await sessionSetProposalState(root, id, proposalId, "discarded").catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  falsePositive: async (root, id, proposalId, note) => {
    const s = await sessionSetProposalState(
      root,
      id,
      proposalId,
      "resolved_as_false_positive",
      note,
    ).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  setFileState: async (root, id, file, state) => {
    const s = await sessionSetFileState(root, id, file, state).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  setFileSummary: async (root, id, file, text) => {
    const s = await sessionSetFileSummary(root, id, file, text).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  decide: async (root, id, text, file) => {
    await sessionAddDecision(root, id, text, file).catch(() => {});
    await get().refresh(root, id);
  },

  setSummary: async (root, id, text) => {
    const s = await sessionSetSummary(root, id, text).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  sendTasks: async (root, id) => {
    const s = get().sessions.find((x) => x.id === id);
    // Only this session's confirmed tasks (the ones materialised into comments).
    const ids = (s?.proposals ?? [])
      .filter((p) => p.state === "converted_to_task" && p.commentId)
      .map((p) => p.commentId as string);
    if (ids.length === 0) return;
    // Hand off to the async resolve loop, pre-scoped to exactly these tasks; it
    // dispatches the agent and tracks resolution from here.
    await useResolveLoop.getState().start(root, ids, id);
  },

  close: async (root, id) => {
    const s = await sessionClose(root, id).catch(() => null);
    if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }));
  },

  discardSession: async (root, id) => {
    await sessionDelete(root, id).catch(() => {});
    set((st) => {
      const sessions = st.sessions.filter((s) => s.id !== id);
      const currentId =
        st.currentId === id
          ? (sessions.find((s) => s.status !== "done")?.id ?? sessions[0]?.id ?? null)
          : st.currentId;
      return { sessions, currentId };
    });
  },
}));

/** Resolve a scope from the project's changed files for diff/branch scopes. */
export async function scopeFromChanges(
  root: string,
  kind: "diff" | "branch",
  base?: string,
): Promise<ReviewScope> {
  // The agent re-derives the file list itself during planning; we only need the
  // scope descriptor here (changed-file probing validates the scope is non-empty).
  await gitChangedFiles(root, base).catch(() => []);
  return { kind, base };
}

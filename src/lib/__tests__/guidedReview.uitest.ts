// Guided Pair Review store. Covers the pure selectors plus every store action
// across success and failure/empty branches. The backend (api), the agent
// dispatch, the prompt composers and the cross-store deps are all mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api", () => ({
  gitChangedFiles: vi.fn(() => Promise.resolve([])),
  sessionAcceptProposal: vi.fn(),
  sessionAddDecision: vi.fn(() => Promise.resolve()),
  sessionClose: vi.fn(),
  sessionCreate: vi.fn(),
  sessionDelete: vi.fn(() => Promise.resolve()),
  sessionGet: vi.fn(),
  sessionList: vi.fn(() => Promise.resolve([])),
  sessionSetFileState: vi.fn(),
  sessionSetFileSummary: vi.fn(),
  sessionSetPosition: vi.fn(),
  sessionSetProposalState: vi.fn(),
  sessionSetSummary: vi.fn(),
}));
vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve()) }));
vi.mock("../review", () => ({
  composeGuidedChallengePrompt: vi.fn(() => "challenge-prompt"),
  composeGuidedFilePrompt: vi.fn(() => "file-prompt"),
  composeGuidedPlanPrompt: vi.fn(() => "plan-prompt"),
  composeGuidedRespondPrompt: vi.fn(() => "respond-prompt"),
}));
const commentsState = { load: vi.fn(() => Promise.resolve()) };
vi.mock("../comments", () => ({ useComments: { getState: () => commentsState } }));
const projectState = { open: vi.fn() };
vi.mock("../store", () => ({ useProject: { getState: () => projectState } }));
const resolveLoopState = { start: vi.fn(() => Promise.resolve()) };
vi.mock("../resolveLoop", () => ({ useResolveLoop: { getState: () => resolveLoopState } }));

import {
  useGuidedReview,
  currentEntry,
  progress,
  openProposals,
  scopeFromChanges,
} from "../guidedReview";
import * as api from "../api";
import { dispatchToAgent } from "../agents";
import {
  composeGuidedChallengePrompt,
  composeGuidedFilePrompt,
  composeGuidedPlanPrompt,
  composeGuidedRespondPrompt,
} from "../review";
import type {
  FileEntry,
  Proposal,
  ReviewScope,
  RouteEntry,
  Session,
  SessionStatus,
} from "../api";

const flush = () => new Promise((r) => setTimeout(r));

const session = (p: Partial<Session> = {}): Session => ({
  id: "s1",
  title: "T",
  scope: { kind: "diff" },
  status: "in_review",
  position: 0,
  route: [],
  files: [],
  proposals: [],
  createdAt: 0,
  updatedAt: 0,
  ...p,
});
const entry = (file: string, mode: RouteEntry["suggestedReviewMode"] = "normal"): RouteEntry => ({
  file,
  priority: 1,
  reason: "",
  suggestedReviewMode: mode,
});
const fileEntry = (file: string, state: FileEntry["state"]): FileEntry => ({ file, state });
const proposal = (p: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  artifactType: "comment",
  state: "proposed",
  file: "a.ts",
  startLine: 1,
  endLine: 1,
  body: "",
  author: "agent",
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  useGuidedReview.setState({ sessions: [], currentId: null, busy: false });
  vi.mocked(api.sessionList).mockResolvedValue([]);
  vi.mocked(api.sessionCreate).mockResolvedValue(null as never);
  vi.mocked(api.sessionGet).mockResolvedValue(null as never);
  vi.mocked(api.sessionAcceptProposal).mockResolvedValue(null as never);
  vi.mocked(api.sessionSetProposalState).mockResolvedValue(null as never);
  vi.mocked(api.sessionSetFileState).mockResolvedValue(null as never);
  vi.mocked(api.sessionSetFileSummary).mockResolvedValue(null as never);
  vi.mocked(api.sessionSetPosition).mockResolvedValue(null as never);
  vi.mocked(api.sessionSetSummary).mockResolvedValue(null as never);
  vi.mocked(api.sessionClose).mockResolvedValue(null as never);
  vi.mocked(api.sessionAddDecision).mockResolvedValue(undefined as never);
  vi.mocked(api.sessionDelete).mockResolvedValue(undefined as never);
  vi.mocked(api.gitChangedFiles).mockResolvedValue([]);
  vi.mocked(dispatchToAgent).mockResolvedValue(undefined as never);
});

describe("selectors", () => {
  it("currentEntry returns the cursor's route entry, clamped", () => {
    expect(currentEntry(null)).toBeNull();
    expect(currentEntry(session({ route: [] }))).toBeNull();
    const s = session({ route: [entry("a"), entry("b")], position: 5 });
    expect(currentEntry(s)?.file).toBe("b"); // clamped to last
  });

  it("progress counts done files over routed files", () => {
    expect(progress(null)).toEqual({ reviewed: 0, total: 0 });
    const s = session({
      route: [entry("a"), entry("b"), entry("c")],
      files: [fileEntry("a", "reviewed"), fileEntry("b", "skipped"), fileEntry("c", "in_review")],
    });
    expect(progress(s)).toEqual({ reviewed: 2, total: 3 });
  });

  it("openProposals keeps proposed and edited artifacts", () => {
    const s = session({
      proposals: [
        proposal({ id: "1", state: "proposed" }),
        proposal({ id: "2", state: "edited" }),
        proposal({ id: "3", state: "discarded" }),
      ],
    });
    expect(openProposals(s).map((p) => p.id)).toEqual(["1", "2"]);
    expect(openProposals(null)).toEqual([]);
  });
});

describe("load", () => {
  it("picks the first non-done session as current", async () => {
    vi.mocked(api.sessionList).mockResolvedValue([
      session({ id: "a", status: "done" }),
      session({ id: "b", status: "in_review" }),
    ]);
    await useGuidedReview.getState().load("/p");
    expect(useGuidedReview.getState().sessions).toHaveLength(2);
    expect(useGuidedReview.getState().currentId).toBe("b");
  });

  it("keeps the existing current session if it still exists", async () => {
    useGuidedReview.setState({ currentId: "a" });
    vi.mocked(api.sessionList).mockResolvedValue([
      session({ id: "a", status: "done" }),
      session({ id: "b", status: "in_review" }),
    ]);
    await useGuidedReview.getState().load("/p");
    expect(useGuidedReview.getState().currentId).toBe("a");
  });

  it("falls back to the first session when all are done", async () => {
    vi.mocked(api.sessionList).mockResolvedValue([session({ id: "a", status: "done" })]);
    await useGuidedReview.getState().load("/p");
    expect(useGuidedReview.getState().currentId).toBe("a");
  });

  it("clears current when the list is empty or errors", async () => {
    vi.mocked(api.sessionList).mockRejectedValue(new Error("boom"));
    await useGuidedReview.getState().load("/p");
    expect(useGuidedReview.getState().sessions).toEqual([]);
    expect(useGuidedReview.getState().currentId).toBeNull();
  });
});

describe("refresh / select", () => {
  it("replaces a session on refresh", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] });
    vi.mocked(api.sessionGet).mockResolvedValue(session({ id: "s1", title: "new" }));
    await useGuidedReview.getState().refresh("/p", "s1");
    expect(useGuidedReview.getState().sessions[0].title).toBe("new");
  });

  it("leaves state untouched when refresh fails", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] });
    vi.mocked(api.sessionGet).mockResolvedValue(null as never);
    await useGuidedReview.getState().refresh("/p", "s1");
    expect(useGuidedReview.getState().sessions[0].title).toBe("old");
  });

  it("select sets the current id", () => {
    useGuidedReview.getState().select("x");
    expect(useGuidedReview.getState().currentId).toBe("x");
  });
});

describe("start", () => {
  it("creates a session, dispatches the plan prompt and clears busy", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "new" }));
    const scope: ReviewScope = { kind: "diff" };
    const result = await useGuidedReview.getState().start("/p", scope);
    expect(result?.id).toBe("new");
    expect(api.sessionCreate).toHaveBeenCalledWith(
      "/p",
      expect.objectContaining({ title: "Review the current diff", scope }),
    );
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("new", "the current diff");
    expect(useGuidedReview.getState().currentId).toBe("new");
    await flush();
    expect(useGuidedReview.getState().busy).toBe(false);
  });

  it("describes a branch scope with its base", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }));
    await useGuidedReview.getState().start("/p", { kind: "branch", base: "main" });
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("n", "this branch vs main");
  });

  it("describes a folder scope by its paths", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }));
    await useGuidedReview.getState().start("/p", { kind: "folder", paths: ["src", "lib"] });
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("n", "src, lib");
  });

  it("returns null and dispatches nothing when creation fails", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(null as never);
    const result = await useGuidedReview.getState().start("/p", { kind: "project" });
    expect(result).toBeNull();
    expect(dispatchToAgent).not.toHaveBeenCalled();
  });
});

describe("focusFile", () => {
  it("opens the file and moves the cursor to its route index", async () => {
    const s = session({ id: "s1", route: [entry("a.ts"), entry("b.ts")] });
    useGuidedReview.setState({ sessions: [s] });
    vi.mocked(api.sessionSetPosition).mockResolvedValue(session({ id: "s1", position: 1 }));
    await useGuidedReview.getState().focusFile("/p", "s1", "b.ts");
    expect(projectState.open).toHaveBeenCalledWith("/p/b.ts", 1);
    expect(api.sessionSetPosition).toHaveBeenCalledWith("/p", "s1", 1);
    expect(useGuidedReview.getState().sessions[0].position).toBe(1);
  });

  it("opens but does not move the cursor for a file not on the route", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", route: [entry("a.ts")] })] });
    await useGuidedReview.getState().focusFile("/p", "s1", "ghost.ts");
    expect(projectState.open).toHaveBeenCalledWith("/p/ghost.ts", 1);
    expect(api.sessionSetPosition).not.toHaveBeenCalled();
  });
});

describe("reviewFile / challenge / respond", () => {
  it("focuses, marks in-review and dispatches the file prompt", async () => {
    const s = session({ id: "s1", route: [entry("a.ts", "deep")], objective: "bug_risk" });
    useGuidedReview.setState({ sessions: [s] });
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s);
    vi.mocked(api.sessionSetPosition).mockResolvedValue(s);
    await useGuidedReview.getState().reviewFile("/p", "s1", "a.ts");
    expect(api.sessionSetFileState).toHaveBeenCalledWith("/p", "s1", "a.ts", "in_review");
    expect(composeGuidedFilePrompt).toHaveBeenCalledWith("s1", "a.ts", "deep", "bug risk");
    expect(dispatchToAgent).toHaveBeenCalledWith("file-prompt");
    await flush();
    expect(useGuidedReview.getState().busy).toBe(false);
  });

  it("challenge dispatches the challenge prompt", async () => {
    await useGuidedReview.getState().challenge("/p", "s1", "a.ts");
    expect(composeGuidedChallengePrompt).toHaveBeenCalledWith("s1", "a.ts");
    expect(dispatchToAgent).toHaveBeenCalledWith("challenge-prompt");
    await flush();
    expect(useGuidedReview.getState().busy).toBe(false);
  });

  it("respond dispatches the respond prompt", async () => {
    await useGuidedReview.getState().respond("/p", "s1", "a.ts");
    expect(composeGuidedRespondPrompt).toHaveBeenCalledWith("s1", "a.ts");
    expect(dispatchToAgent).toHaveBeenCalledWith("respond-prompt");
    await flush();
    expect(useGuidedReview.getState().busy).toBe(false);
  });
});

describe("finishFile", () => {
  it("advances to the next unfinished file and opens it", async () => {
    const s = session({
      id: "s1",
      route: [entry("a.ts"), entry("b.ts")],
      files: [fileEntry("a.ts", "reviewed"), fileEntry("b.ts", "not_started")],
    });
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s);
    vi.mocked(api.sessionSetPosition).mockResolvedValue(session({ id: "s1", position: 1 }));
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed");
    expect(projectState.open).toHaveBeenCalledWith("/p/b.ts", 1);
    expect(api.sessionSetPosition).toHaveBeenCalledWith("/p", "s1", 1);
  });

  it("does nothing when nothing remains", async () => {
    const s = session({
      id: "s1",
      route: [entry("a.ts")],
      files: [fileEntry("a.ts", "reviewed")],
    });
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s);
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed");
    expect(projectState.open).not.toHaveBeenCalled();
    expect(api.sessionSetPosition).not.toHaveBeenCalled();
  });

  it("bails out when the state update fails", async () => {
    vi.mocked(api.sessionSetFileState).mockResolvedValue(null as never);
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed");
    expect(projectState.open).not.toHaveBeenCalled();
  });
});

describe("proposal disposition", () => {
  it("accept materialises a task and reloads comments", async () => {
    vi.mocked(api.sessionAcceptProposal).mockResolvedValue(session({ id: "s1" }));
    await useGuidedReview.getState().accept("/p", "s1", "p1");
    expect(api.sessionAcceptProposal).toHaveBeenCalledWith("/p", "s1", "p1", "task");
    expect(commentsState.load).toHaveBeenCalledWith("/p");
  });

  it("accept as a note passes the note kind", async () => {
    vi.mocked(api.sessionAcceptProposal).mockResolvedValue(null as never);
    await useGuidedReview.getState().accept("/p", "s1", "p1", true);
    expect(api.sessionAcceptProposal).toHaveBeenCalledWith("/p", "s1", "p1", "note");
    expect(commentsState.load).toHaveBeenCalledWith("/p"); // reloads even if accept returned null
  });

  it("edit stores the edited body", async () => {
    vi.mocked(api.sessionSetProposalState).mockResolvedValue(session({ id: "s1" }));
    await useGuidedReview.getState().edit("/p", "s1", "p1", "tweaked");
    expect(api.sessionSetProposalState).toHaveBeenCalledWith("/p", "s1", "p1", "edited", "tweaked");
  });

  it("discard marks the proposal discarded", async () => {
    await useGuidedReview.getState().discard("/p", "s1", "p1");
    expect(api.sessionSetProposalState).toHaveBeenCalledWith("/p", "s1", "p1", "discarded");
  });

  it("falsePositive resolves with a note", async () => {
    await useGuidedReview.getState().falsePositive("/p", "s1", "p1", "not a bug");
    expect(api.sessionSetProposalState).toHaveBeenCalledWith(
      "/p",
      "s1",
      "p1",
      "resolved_as_false_positive",
      "not a bug",
    );
  });
});

describe("file/session summaries and decisions", () => {
  it("setFileState replaces on success", async () => {
    vi.mocked(api.sessionSetFileState).mockResolvedValue(session({ id: "s1", title: "x" }));
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] });
    await useGuidedReview.getState().setFileState("/p", "s1", "a.ts", "skipped");
    expect(useGuidedReview.getState().sessions[0].title).toBe("x");
  });

  it("setFileSummary persists the text", async () => {
    vi.mocked(api.sessionSetFileSummary).mockResolvedValue(session({ id: "s1" }));
    await useGuidedReview.getState().setFileSummary("/p", "s1", "a.ts", "summary");
    expect(api.sessionSetFileSummary).toHaveBeenCalledWith("/p", "s1", "a.ts", "summary");
  });

  it("setSummary persists and replaces", async () => {
    vi.mocked(api.sessionSetSummary).mockResolvedValue(session({ id: "s1", summary: "done" }));
    useGuidedReview.setState({ sessions: [session({ id: "s1" })] });
    await useGuidedReview.getState().setSummary("/p", "s1", "done");
    expect(useGuidedReview.getState().sessions[0].summary).toBe("done");
  });

  it("setSummary does not replace when the call fails", async () => {
    vi.mocked(api.sessionSetSummary).mockResolvedValue(null as never);
    useGuidedReview.setState({ sessions: [session({ id: "s1", summary: "keep" })] });
    await useGuidedReview.getState().setSummary("/p", "s1", "new");
    expect(useGuidedReview.getState().sessions[0].summary).toBe("keep");
  });

  it("decide records a decision then refreshes", async () => {
    vi.mocked(api.sessionGet).mockResolvedValue(session({ id: "s1", title: "refreshed" }));
    await useGuidedReview.getState().decide("/p", "s1", "we ship it", "a.ts");
    expect(api.sessionAddDecision).toHaveBeenCalledWith("/p", "s1", "we ship it", "a.ts");
    expect(api.sessionGet).toHaveBeenCalledWith("/p", "s1");
    expect(useGuidedReview.getState().sessions[0].title).toBe("refreshed");
  });
});

describe("sendTasks", () => {
  it("hands confirmed tasks to the resolve loop", async () => {
    const s = session({
      id: "s1",
      proposals: [
        proposal({ id: "p1", state: "converted_to_task", commentId: "c1" }),
        proposal({ id: "p2", state: "converted_to_task" }), // no commentId -> skipped
        proposal({ id: "p3", state: "proposed", commentId: "c3" }), // not a task -> skipped
      ],
    });
    useGuidedReview.setState({ sessions: [s] });
    await useGuidedReview.getState().sendTasks("/p", "s1");
    expect(resolveLoopState.start).toHaveBeenCalledWith("/p", ["c1"], "s1");
  });

  it("does nothing when there are no confirmed tasks", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", proposals: [] })] });
    await useGuidedReview.getState().sendTasks("/p", "s1");
    expect(resolveLoopState.start).not.toHaveBeenCalled();
  });
});

describe("close / discardSession", () => {
  it("close replaces the session", async () => {
    vi.mocked(api.sessionClose).mockResolvedValue(session({ id: "s1", status: "done" }));
    useGuidedReview.setState({ sessions: [session({ id: "s1", status: "in_review" })] });
    await useGuidedReview.getState().close("/p", "s1");
    expect(useGuidedReview.getState().sessions[0].status).toBe("done");
  });

  it("discardSession removes it and re-points current", async () => {
    useGuidedReview.setState({
      sessions: [
        session({ id: "s1", status: "in_review" }),
        session({ id: "s2", status: "in_review" }),
      ],
      currentId: "s1",
    });
    await useGuidedReview.getState().discardSession("/p", "s1");
    expect(api.sessionDelete).toHaveBeenCalledWith("/p", "s1");
    expect(useGuidedReview.getState().sessions.map((s) => s.id)).toEqual(["s2"]);
    expect(useGuidedReview.getState().currentId).toBe("s2");
  });

  it("discardSession leaves a non-current selection alone", async () => {
    useGuidedReview.setState({
      sessions: [session({ id: "s1" }), session({ id: "s2" })],
      currentId: "s2",
    });
    await useGuidedReview.getState().discardSession("/p", "s1");
    expect(useGuidedReview.getState().currentId).toBe("s2");
  });

  it("discardSession clears current when nothing is left", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1" })], currentId: "s1" });
    await useGuidedReview.getState().discardSession("/p", "s1");
    expect(useGuidedReview.getState().currentId).toBeNull();
  });
});

describe("scopeFromChanges", () => {
  it("probes changed files and returns the scope descriptor", async () => {
    const scope = await scopeFromChanges("/p", "branch", "main");
    expect(api.gitChangedFiles).toHaveBeenCalledWith("/p", "main");
    expect(scope).toEqual({ kind: "branch", base: "main" });
  });

  it("tolerates a failing probe", async () => {
    vi.mocked(api.gitChangedFiles).mockRejectedValue(new Error("no git"));
    const scope = await scopeFromChanges("/p", "diff");
    expect(scope).toEqual({ kind: "diff", base: undefined });
  });
});

// Keep an unused import referenced so the type-only import is not flagged.
const _types: SessionStatus = "planning";
void _types;

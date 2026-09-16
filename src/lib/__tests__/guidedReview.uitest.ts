// Guided Pair Review store. Covers the pure selectors plus every store action
// across success and failure/empty branches. The backend (api), the agent
// dispatch, the prompt composers and the cross-store deps are all mocked.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  gitChangedFiles: vi.fn(() => Promise.resolve([])),
  sessionAcceptProposal: vi.fn(),
  sessionAcceptRouteChange: vi.fn(),
  sessionDiscardRouteChange: vi.fn(),
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
}))
vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve(true)) }))
vi.mock("../review", () => ({
  composeGuidedChallengePrompt: vi.fn(() => "challenge-prompt"),
  composeGuidedCoverPrompt: vi.fn(() => "cover-prompt"),
  composeGuidedFilePrompt: vi.fn(() => "file-prompt"),
  composeGuidedPlanPrompt: vi.fn(() => "plan-prompt"),
  composeGuidedRespondPrompt: vi.fn(() => "respond-prompt"),
  composeGuidedWidenPrompt: vi.fn(() => "widen-prompt"),
}))
const commentsState = { load: vi.fn(() => Promise.resolve()) }
vi.mock("../comments", () => ({ useComments: { getState: () => commentsState } }))
const projectState = { open: vi.fn() }
vi.mock("../store", () => ({ useProject: { getState: () => projectState } }))
const resolveLoopState = { start: vi.fn(() => Promise.resolve()) }
vi.mock("../resolveLoop", () => ({ useResolveLoop: { getState: () => resolveLoopState } }))

import { dispatchToAgent } from "@/lib/agents"
import type { FileEntry, Proposal, ReviewScope, RouteEntry, Session } from "@/lib/api"
import * as api from "@/lib/api"
import {
  currentEntry,
  openProposals,
  progress,
  uncoveredFiles,
  useGuidedReview,
} from "@/lib/guidedReview"
import {
  composeGuidedChallengePrompt,
  composeGuidedCoverPrompt,
  composeGuidedFilePrompt,
  composeGuidedPlanPrompt,
  composeGuidedRespondPrompt,
  composeGuidedWidenPrompt,
} from "@/lib/review"

const flush = () => new Promise((r) => setTimeout(r))

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
})
const entry = (file: string, mode: RouteEntry["suggestedReviewMode"] = "normal"): RouteEntry => ({
  file,
  priority: 1,
  reason: "",
  suggestedReviewMode: mode,
})
const fileEntry = (file: string, state: FileEntry["state"]): FileEntry => ({ file, state })
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
})

beforeEach(() => {
  vi.clearAllMocks()
  useGuidedReview.setState({
    sessions: [],
    currentId: null,
    busy: null,
    pending: null,
    error: null,
  })
  vi.mocked(api.sessionList).mockResolvedValue([])
  vi.mocked(api.sessionCreate).mockResolvedValue(null as never)
  vi.mocked(api.sessionGet).mockResolvedValue(null as never)
  vi.mocked(api.sessionAcceptProposal).mockResolvedValue(null as never)
  vi.mocked(api.sessionSetProposalState).mockResolvedValue(null as never)
  vi.mocked(api.sessionSetFileState).mockResolvedValue(null as never)
  vi.mocked(api.sessionSetFileSummary).mockResolvedValue(null as never)
  vi.mocked(api.sessionSetPosition).mockResolvedValue(null as never)
  vi.mocked(api.sessionSetSummary).mockResolvedValue(null as never)
  vi.mocked(api.sessionClose).mockResolvedValue(null as never)
  vi.mocked(api.sessionAddDecision).mockResolvedValue(undefined as never)
  vi.mocked(api.sessionDelete).mockResolvedValue(undefined as never)
  vi.mocked(api.gitChangedFiles).mockResolvedValue([])
  vi.mocked(dispatchToAgent).mockResolvedValue(undefined as never)
})

describe("selectors", () => {
  it("currentEntry returns the cursor's route entry, clamped", () => {
    expect(currentEntry(null)).toBeNull()
    expect(currentEntry(session({ route: [] }))).toBeNull()
    const s = session({ route: [entry("a"), entry("b")], position: 5 })
    expect(currentEntry(s)?.file).toBe("b") // clamped to last
  })

  it("progress counts done files over routed files", () => {
    expect(progress(null)).toEqual({ reviewed: 0, total: 0 })
    const s = session({
      route: [entry("a"), entry("b"), entry("c")],
      files: [fileEntry("a", "reviewed"), fileEntry("b", "skipped"), fileEntry("c", "in_review")],
    })
    expect(progress(s)).toEqual({ reviewed: 2, total: 3 })
  })

  it("openProposals keeps proposed and edited artifacts", () => {
    const s = session({
      proposals: [
        proposal({ id: "1", state: "proposed" }),
        proposal({ id: "2", state: "edited" }),
        proposal({ id: "3", state: "discarded" }),
      ],
    })
    expect(openProposals(s).map((p) => p.id)).toEqual(["1", "2"])
    expect(openProposals(null)).toEqual([])
  })
})

describe("load", () => {
  it("picks the first non-done session as current", async () => {
    vi.mocked(api.sessionList).mockResolvedValue([
      session({ id: "a", status: "done" }),
      session({ id: "b", status: "in_review" }),
    ])
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().sessions).toHaveLength(2)
    expect(useGuidedReview.getState().currentId).toBe("b")
  })

  it("keeps the existing current session if it still exists", async () => {
    useGuidedReview.setState({ currentId: "a" })
    vi.mocked(api.sessionList).mockResolvedValue([
      session({ id: "a", status: "done" }),
      session({ id: "b", status: "in_review" }),
    ])
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().currentId).toBe("a")
  })

  it("falls back to the first session when all are done", async () => {
    vi.mocked(api.sessionList).mockResolvedValue([session({ id: "a", status: "done" })])
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().currentId).toBe("a")
  })

  it("clears current when the list is empty or errors", async () => {
    vi.mocked(api.sessionList).mockRejectedValue(new Error("boom"))
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().sessions).toEqual([])
    expect(useGuidedReview.getState().currentId).toBeNull()
  })
})

describe("refresh / select", () => {
  it("replaces a session on refresh", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] })
    vi.mocked(api.sessionGet).mockResolvedValue(session({ id: "s1", title: "new" }))
    await useGuidedReview.getState().refresh("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].title).toBe("new")
  })

  it("puts a session it hadn't seen at the head of the list", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "old", title: "older" })] })
    vi.mocked(api.sessionGet).mockResolvedValue(session({ id: "fresh", title: "newest" }))
    await useGuidedReview.getState().refresh("/p", "fresh")
    // The list reads newest-first; appending buries a new session at the end.
    expect(useGuidedReview.getState().sessions.map((x) => x.id)).toEqual(["fresh", "old"])
  })

  it("leaves state untouched when refresh fails", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] })
    vi.mocked(api.sessionGet).mockResolvedValue(null as never)
    await useGuidedReview.getState().refresh("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].title).toBe("old")
  })

  it("select sets the current id", () => {
    useGuidedReview.getState().select("x")
    expect(useGuidedReview.getState().currentId).toBe("x")
  })
})

describe("start", () => {
  it("creates a session, dispatches the plan prompt and clears busy", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "new" }))
    vi.mocked(api.gitChangedFiles).mockResolvedValue(["a.ts", "b.ts"])
    const scope: ReviewScope = { kind: "diff" }
    const result = await useGuidedReview.getState().start("/p", scope)
    expect(result?.id).toBe("new")
    expect(api.sessionCreate).toHaveBeenCalledWith(
      "/p",
      expect.objectContaining({ title: "Review the current diff", scope }),
    )
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith(
      "new",
      "the current diff",
      expect.objectContaining({ files: ["a.ts", "b.ts"] }),
    )
    expect(useGuidedReview.getState().currentId).toBe("new")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("persists the scope's file set on the session, untracked files included", async () => {
    // Reado reads it once here: it is what the planner is told, and what route
    // coverage is measured against later. Re-deriving it agent-side is how an
    // untracked file goes unreviewed.
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }))
    vi.mocked(api.gitChangedFiles).mockResolvedValue(["a.ts", "brand-new.ts"])
    await useGuidedReview.getState().start("/p", { kind: "diff" }, "security")
    expect(api.gitChangedFiles).toHaveBeenCalledWith("/p", undefined)
    expect(api.sessionCreate).toHaveBeenCalledWith(
      "/p",
      expect.objectContaining({ expectedFiles: ["a.ts", "brand-new.ts"] }),
    )
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("n", "the current diff", {
      objective: "security",
      files: ["a.ts", "brand-new.ts"],
      pr: undefined,
    })
  })

  it("describes a branch scope with its base and asks git for that range", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }))
    vi.mocked(api.gitChangedFiles).mockResolvedValue(["x.ts"])
    await useGuidedReview.getState().start("/p", { kind: "branch", base: "main" })
    expect(api.gitChangedFiles).toHaveBeenCalledWith("/p", "main")
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith(
      "n",
      "this branch vs main",
      expect.objectContaining({ files: ["x.ts"] }),
    )
  })

  it("claims no file set for a scope git cannot enumerate", async () => {
    // A folder/PR/free-text scope has no working-tree file list to speak of;
    // asserting one would make the coverage gap a fiction.
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }))
    await useGuidedReview.getState().start("/p", { kind: "folder", paths: ["src", "lib"] })
    expect(api.gitChangedFiles).not.toHaveBeenCalled()
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("n", "src, lib", {
      objective: undefined,
      files: [],
      pr: undefined,
    })
    expect(api.sessionCreate).toHaveBeenCalledWith(
      "/p",
      expect.objectContaining({ expectedFiles: [] }),
    )
  })

  it("passes the PR's derived git refs to the plan prompt (non-destructive)", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }))
    await useGuidedReview.getState().start("/p", { kind: "pr", pr: "#42" })
    expect(api.gitChangedFiles).not.toHaveBeenCalled()
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith("n", "PR #42", {
      objective: undefined,
      files: [],
      pr: { head: "refs/reado/pr-42", base: "refs/reado/pr-42-base" },
    })
  })

  it("starts anyway when git cannot answer", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "n" }))
    vi.mocked(api.gitChangedFiles).mockRejectedValue(new Error("not a repo"))
    const result = await useGuidedReview.getState().start("/p", { kind: "diff" })
    expect(result?.id).toBe("n")
    expect(composeGuidedPlanPrompt).toHaveBeenCalledWith(
      "n",
      "the current diff",
      expect.objectContaining({ files: [] }),
    )
  })

  it("returns null and dispatches nothing when creation fails", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(null as never)
    const result = await useGuidedReview.getState().start("/p", { kind: "project" })
    expect(result).toBeNull()
    expect(dispatchToAgent).not.toHaveBeenCalled()
  })
})

describe("focusFile", () => {
  it("opens the file and moves the cursor to its route index", async () => {
    const s = session({ id: "s1", route: [entry("a.ts"), entry("b.ts")] })
    useGuidedReview.setState({ sessions: [s] })
    vi.mocked(api.sessionSetPosition).mockResolvedValue(session({ id: "s1", position: 1 }))
    await useGuidedReview.getState().focusFile("/p", "s1", "b.ts")
    expect(projectState.open).toHaveBeenCalledWith("/p/b.ts", 1)
    expect(api.sessionSetPosition).toHaveBeenCalledWith("/p", "s1", 1)
    expect(useGuidedReview.getState().sessions[0].position).toBe(1)
  })

  it("opens but does not move the cursor for a file not on the route", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", route: [entry("a.ts")] })] })
    await useGuidedReview.getState().focusFile("/p", "s1", "ghost.ts")
    expect(projectState.open).toHaveBeenCalledWith("/p/ghost.ts", 1)
    expect(api.sessionSetPosition).not.toHaveBeenCalled()
  })
})

describe("reviewFile / challenge / respond", () => {
  it("focuses, marks in-review and dispatches the file prompt", async () => {
    const s = session({ id: "s1", route: [entry("a.ts", "deep")], objective: "bug_risk" })
    useGuidedReview.setState({ sessions: [s] })
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s)
    vi.mocked(api.sessionSetPosition).mockResolvedValue(s)
    await useGuidedReview.getState().reviewFile("/p", "s1", "a.ts")
    expect(api.sessionSetFileState).toHaveBeenCalledWith("/p", "s1", "a.ts", "in_review")
    expect(composeGuidedFilePrompt).toHaveBeenCalledWith(
      "s1",
      "a.ts",
      "deep",
      "bug risk",
      undefined,
    )
    expect(dispatchToAgent).toHaveBeenCalledWith("file-prompt")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("challenge dispatches the challenge prompt", async () => {
    await useGuidedReview.getState().challenge("/p", "s1", "a.ts")
    expect(composeGuidedChallengePrompt).toHaveBeenCalledWith("s1", "a.ts")
    expect(dispatchToAgent).toHaveBeenCalledWith("challenge-prompt")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("respond dispatches the respond prompt", async () => {
    await useGuidedReview.getState().respond("/p", "s1", "a.ts")
    expect(composeGuidedRespondPrompt).toHaveBeenCalledWith("s1", "a.ts")
    expect(dispatchToAgent).toHaveBeenCalledWith("respond-prompt")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("widen anchors the wide pass on the route's files", async () => {
    const s = session({ id: "s1", route: [entry("a.ts"), entry("b.ts")] })
    useGuidedReview.setState({ sessions: [s] })
    await useGuidedReview.getState().widen("/p", "s1")
    // Widening around the review, not wandering the whole repository.
    expect(composeGuidedWidenPrompt).toHaveBeenCalledWith("s1", ["a.ts", "b.ts"])
    expect(dispatchToAgent).toHaveBeenCalledWith("widen-prompt")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("widen still runs for an unknown session, with no files to anchor on", async () => {
    useGuidedReview.setState({ sessions: [] })
    await useGuidedReview.getState().widen("/p", "nope")
    expect(composeGuidedWidenPrompt).toHaveBeenCalledWith("nope", [])
  })
})

describe("finishFile", () => {
  it("advances to the next unfinished file and opens it", async () => {
    const s = session({
      id: "s1",
      route: [entry("a.ts"), entry("b.ts")],
      files: [fileEntry("a.ts", "reviewed"), fileEntry("b.ts", "not_started")],
    })
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s)
    vi.mocked(api.sessionSetPosition).mockResolvedValue(session({ id: "s1", position: 1 }))
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed")
    expect(projectState.open).toHaveBeenCalledWith("/p/b.ts", 1)
    expect(api.sessionSetPosition).toHaveBeenCalledWith("/p", "s1", 1)
  })

  it("does nothing when nothing remains", async () => {
    const s = session({
      id: "s1",
      route: [entry("a.ts")],
      files: [fileEntry("a.ts", "reviewed")],
    })
    vi.mocked(api.sessionSetFileState).mockResolvedValue(s)
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed")
    expect(projectState.open).not.toHaveBeenCalled()
    expect(api.sessionSetPosition).not.toHaveBeenCalled()
  })

  it("bails out when the state update fails", async () => {
    vi.mocked(api.sessionSetFileState).mockResolvedValue(null as never)
    await useGuidedReview.getState().finishFile("/p", "s1", "a.ts", "reviewed")
    expect(projectState.open).not.toHaveBeenCalled()
  })
})

describe("proposal disposition", () => {
  it("accept materialises a task and reloads comments", async () => {
    vi.mocked(api.sessionAcceptProposal).mockResolvedValue(session({ id: "s1" }))
    await useGuidedReview.getState().accept("/p", "s1", "p1")
    expect(api.sessionAcceptProposal).toHaveBeenCalledWith("/p", "s1", "p1", "task")
    expect(commentsState.load).toHaveBeenCalledWith("/p")
  })

  it("accept as a note passes the note kind", async () => {
    vi.mocked(api.sessionAcceptProposal).mockResolvedValue(null as never)
    await useGuidedReview.getState().accept("/p", "s1", "p1", true)
    expect(api.sessionAcceptProposal).toHaveBeenCalledWith("/p", "s1", "p1", "note")
    expect(commentsState.load).toHaveBeenCalledWith("/p") // reloads even if accept returned null
  })

  it("edit stores the edited body", async () => {
    vi.mocked(api.sessionSetProposalState).mockResolvedValue(session({ id: "s1" }))
    await useGuidedReview.getState().edit("/p", "s1", "p1", "tweaked")
    expect(api.sessionSetProposalState).toHaveBeenCalledWith("/p", "s1", "p1", "edited", "tweaked")
  })

  it("discard marks the proposal discarded", async () => {
    await useGuidedReview.getState().discard("/p", "s1", "p1")
    expect(api.sessionSetProposalState).toHaveBeenCalledWith("/p", "s1", "p1", "discarded")
  })

  it("falsePositive resolves with a note", async () => {
    await useGuidedReview.getState().falsePositive("/p", "s1", "p1", "not a bug")
    expect(api.sessionSetProposalState).toHaveBeenCalledWith(
      "/p",
      "s1",
      "p1",
      "resolved_as_false_positive",
      "not a bug",
    )
  })
})

describe("file/session summaries and decisions", () => {
  it("setFileState replaces on success", async () => {
    vi.mocked(api.sessionSetFileState).mockResolvedValue(session({ id: "s1", title: "x" }))
    useGuidedReview.setState({ sessions: [session({ id: "s1", title: "old" })] })
    await useGuidedReview.getState().setFileState("/p", "s1", "a.ts", "skipped")
    expect(useGuidedReview.getState().sessions[0].title).toBe("x")
  })

  it("setFileSummary persists the text", async () => {
    vi.mocked(api.sessionSetFileSummary).mockResolvedValue(session({ id: "s1" }))
    await useGuidedReview.getState().setFileSummary("/p", "s1", "a.ts", "summary")
    expect(api.sessionSetFileSummary).toHaveBeenCalledWith("/p", "s1", "a.ts", "summary")
  })

  it("setSummary persists and replaces", async () => {
    vi.mocked(api.sessionSetSummary).mockResolvedValue(session({ id: "s1", summary: "done" }))
    useGuidedReview.setState({ sessions: [session({ id: "s1" })] })
    await useGuidedReview.getState().setSummary("/p", "s1", "done")
    expect(useGuidedReview.getState().sessions[0].summary).toBe("done")
  })

  it("setSummary does not replace when the call fails", async () => {
    vi.mocked(api.sessionSetSummary).mockResolvedValue(null as never)
    useGuidedReview.setState({ sessions: [session({ id: "s1", summary: "keep" })] })
    await useGuidedReview.getState().setSummary("/p", "s1", "new")
    expect(useGuidedReview.getState().sessions[0].summary).toBe("keep")
  })

  it("decide records a decision then refreshes", async () => {
    vi.mocked(api.sessionGet).mockResolvedValue(session({ id: "s1", title: "refreshed" }))
    await useGuidedReview.getState().decide("/p", "s1", "we ship it", "a.ts")
    expect(api.sessionAddDecision).toHaveBeenCalledWith("/p", "s1", "we ship it", "a.ts")
    expect(api.sessionGet).toHaveBeenCalledWith("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].title).toBe("refreshed")
  })
})

describe("sendTasks", () => {
  it("hands confirmed tasks to the resolve loop", async () => {
    const s = session({
      id: "s1",
      proposals: [
        proposal({ id: "p1", state: "converted_to_task", commentId: "c1" }),
        proposal({ id: "p2", state: "converted_to_task" }), // no commentId -> skipped
        proposal({ id: "p3", state: "proposed", commentId: "c3" }), // not a task -> skipped
      ],
    })
    useGuidedReview.setState({ sessions: [s] })
    await useGuidedReview.getState().sendTasks("/p", "s1")
    expect(resolveLoopState.start).toHaveBeenCalledWith("/p", ["c1"], "s1")
  })

  it("does nothing when there are no confirmed tasks", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1", proposals: [] })] })
    await useGuidedReview.getState().sendTasks("/p", "s1")
    expect(resolveLoopState.start).not.toHaveBeenCalled()
  })
})

describe("close / discardSession", () => {
  it("close replaces the session", async () => {
    vi.mocked(api.sessionClose).mockResolvedValue(session({ id: "s1", status: "done" }))
    useGuidedReview.setState({ sessions: [session({ id: "s1", status: "in_review" })] })
    await useGuidedReview.getState().close("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].status).toBe("done")
  })

  it("discardSession removes it and re-points current", async () => {
    useGuidedReview.setState({
      sessions: [
        session({ id: "s1", status: "in_review" }),
        session({ id: "s2", status: "in_review" }),
      ],
      currentId: "s1",
    })
    await useGuidedReview.getState().discardSession("/p", "s1")
    expect(api.sessionDelete).toHaveBeenCalledWith("/p", "s1")
    expect(useGuidedReview.getState().sessions.map((s) => s.id)).toEqual(["s2"])
    expect(useGuidedReview.getState().currentId).toBe("s2")
  })

  it("discardSession leaves a non-current selection alone", async () => {
    useGuidedReview.setState({
      sessions: [session({ id: "s1" }), session({ id: "s2" })],
      currentId: "s2",
    })
    await useGuidedReview.getState().discardSession("/p", "s1")
    expect(useGuidedReview.getState().currentId).toBe("s2")
  })

  it("discardSession clears current when nothing is left", async () => {
    useGuidedReview.setState({ sessions: [session({ id: "s1" })], currentId: "s1" })
    await useGuidedReview.getState().discardSession("/p", "s1")
    expect(useGuidedReview.getState().currentId).toBeNull()
  })
})

describe("uncoveredFiles", () => {
  it("names the expected files the route never picked up", () => {
    const s = session({
      expectedFiles: ["a.ts", "b.ts", "untracked.ts"],
      route: [entry("a.ts")],
    })
    expect(uncoveredFiles(s)).toEqual(["b.ts", "untracked.ts"])
  })

  it("treats a deliberate omission as an answer, not a gap", () => {
    // Saying a file needs no review closes it; saying nothing does not.
    const s = session({
      expectedFiles: ["a.ts", "gen.ts", "vendor.ts"],
      route: [entry("a.ts")],
      files: [fileEntry("gen.ts", "out_of_scope"), fileEntry("vendor.ts", "skipped")],
    })
    expect(uncoveredFiles(s)).toEqual([])
  })

  it("claims no gap without an expected set, and none for no session", () => {
    expect(uncoveredFiles(session({ route: [entry("a.ts")] }))).toEqual([])
    expect(uncoveredFiles(null)).toEqual([])
  })
})

describe("coverage and route changes", () => {
  it("cover asks the agent about exactly the files that are missing", async () => {
    await useGuidedReview.getState().cover("/p", "s1", ["b.ts", "c.ts"])
    expect(composeGuidedCoverPrompt).toHaveBeenCalledWith("s1", ["b.ts", "c.ts"])
    expect(dispatchToAgent).toHaveBeenCalledWith("cover-prompt")
    await flush()
    expect(useGuidedReview.getState().busy).toBeNull()
  })

  it("accepting a route change replaces the session it belongs to", async () => {
    const applied = session({ id: "s1", route: [entry("a.ts"), entry("b.ts")] })
    vi.mocked(api.sessionAcceptRouteChange).mockResolvedValue(applied)
    useGuidedReview.setState({ sessions: [session({ id: "s1" })], currentId: "s1" })
    await useGuidedReview.getState().acceptRouteChange("/p", "s1")
    expect(api.sessionAcceptRouteChange).toHaveBeenCalledWith("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].route).toHaveLength(2)
  })

  it("discarding leaves the route alone", async () => {
    const kept = session({ id: "s1", route: [entry("a.ts")] })
    vi.mocked(api.sessionDiscardRouteChange).mockResolvedValue(kept)
    useGuidedReview.setState({ sessions: [session({ id: "s1" })], currentId: "s1" })
    await useGuidedReview.getState().discardRouteChange("/p", "s1")
    expect(useGuidedReview.getState().sessions[0].route).toEqual([entry("a.ts")])
    expect(useGuidedReview.getState().sessions[0].routeChange).toBeUndefined()
  })

  it("a failing disposal leaves the store as it was", async () => {
    vi.mocked(api.sessionAcceptRouteChange).mockRejectedValue(new Error("gone"))
    const before = session({ id: "s1", route: [entry("a.ts")] })
    useGuidedReview.setState({ sessions: [before], currentId: "s1" })
    await useGuidedReview.getState().acceptRouteChange("/p", "s1")
    expect(useGuidedReview.getState().sessions[0]).toBe(before)
  })
})

describe("handing work to the agent", () => {
  beforeEach(() => {
    vi.mocked(dispatchToAgent).mockResolvedValue(true)
  })

  it("says it is waiting once the prompt has gone, and stops when the session moves", async () => {
    // Reado does not run the model: the only honest end of "waiting" is the
    // session file changing under the agent's hands.
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "s1", updatedAt: 1 }))
    await useGuidedReview.getState().start("/p", { kind: "diff" })
    await flush()
    expect(useGuidedReview.getState().pending).toBe("plan")

    vi.mocked(api.sessionList).mockResolvedValue([session({ id: "s1", updatedAt: 2 })])
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().pending).toBeNull()
  })

  it("keeps waiting while the session has not moved", async () => {
    vi.mocked(api.sessionCreate).mockResolvedValue(session({ id: "s1", updatedAt: 1 }))
    await useGuidedReview.getState().start("/p", { kind: "diff" })
    await flush()
    vi.mocked(api.sessionList).mockResolvedValue([session({ id: "s1", updatedAt: 1 })])
    await useGuidedReview.getState().load("/p")
    expect(useGuidedReview.getState().pending).toBe("plan")
  })

  it("reports a dispatch that went nowhere instead of doing nothing", async () => {
    // `dispatchToAgent` answers false when there is no agent to send to. Every
    // call site used to ignore it: the click did nothing and said nothing.
    vi.mocked(dispatchToAgent).mockResolvedValue(false)
    await useGuidedReview.getState().widen("/p", "s1")
    await flush()
    expect(useGuidedReview.getState().pending).toBeNull()
    expect(useGuidedReview.getState().error).toContain("No agent is running")
    useGuidedReview.getState().dismissError()
    expect(useGuidedReview.getState().error).toBeNull()
  })

  it("names the action that failed, and what the backend said", async () => {
    vi.mocked(api.sessionAcceptProposal).mockRejectedValue(new Error("disk full"))
    useGuidedReview.setState({ sessions: [session({ id: "s1" })], currentId: "s1" })
    await useGuidedReview.getState().accept("/p", "s1", "p1")
    expect(useGuidedReview.getState().error).toContain("disk full")
  })

  it("marks each action with its own key, so one control does not blank the panel", async () => {
    // A single global flag made every button in the panel look busy because one
    // of them was.
    const keys: (string | null)[] = []
    vi.mocked(dispatchToAgent).mockImplementation(async () => {
      keys.push(useGuidedReview.getState().busy)
      return true
    })
    await useGuidedReview.getState().respond("/p", "s1", "src/a.ts")
    await useGuidedReview.getState().widen("/p", "s1")
    await flush()
    expect(keys).toEqual(["respond:src/a.ts", "widen"])
  })
})

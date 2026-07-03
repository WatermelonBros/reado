// useComments store: load/create/patch/reply/setState/remove/re-anchor + the
// forge-resolution side effect. The pure helpers live in comments.test.ts.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Comment } from "../api";

const api = vi.hoisted(() => ({
  listComments: vi.fn(),
  listArchived: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  addReply: vi.fn(),
  setCommentState: vi.fn(),
  deleteComment: vi.fn(),
  setAnchor: vi.fn(),
  forgeResolveThread: vi.fn(() => Promise.resolve()),
}));
vi.mock("../api", () => api);

import { useComments } from "../comments";

const C = () => useComments.getState();
const mkComment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    type: "bug",
    state: "open",
    kind: "task",
    anchor: { file: "a.ts", scope: "range", startLine: 1, endLine: 2 },
    context: { snippet: "", before: "", after: "" },
    links: [],
    author: "user",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    archived: false,
    ...over,
  }) as Comment;

beforeEach(() => {
  vi.clearAllMocks();
  api.forgeResolveThread.mockResolvedValue(undefined);
  useComments.setState({ root: "/r", comments: [], archived: [], activeId: null, reanchoringId: null, gitignorePromptOpen: false });
});

describe("load", () => {
  it("loads comments + archived for the same project without resetting activeId", async () => {
    useComments.setState({ activeId: "keep" });
    api.listComments.mockResolvedValue([mkComment()]);
    api.listArchived.mockResolvedValue([]);
    await C().load("/r");
    expect(C().comments).toHaveLength(1);
    expect(C().activeId).toBe("keep"); // same root → preserved
  });
  it("resets state on a genuine project switch", async () => {
    useComments.setState({ activeId: "old", comments: [mkComment()] });
    api.listComments.mockResolvedValue([]);
    api.listArchived.mockResolvedValue([]);
    await C().load("/other");
    expect(C().root).toBe("/other");
    expect(C().activeId).toBeNull();
  });
});

describe("create / patch / reply / remove", () => {
  it("create appends the new comment", async () => {
    api.createComment.mockResolvedValue({ comment: mkComment({ id: "new" }), firstComment: true });
    const res = await C().create({} as never);
    expect(res.firstComment).toBe(true);
    expect(C().comments.map((c) => c.id)).toEqual(["new"]);
    expect(api.createComment).toHaveBeenCalledWith("/r", {});
  });
  it("patch replaces the comment in place", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1", type: "bug" })] });
    api.updateComment.mockResolvedValue(mkComment({ id: "c1", type: "note" }));
    await C().patch("c1", { type: "note" });
    expect(C().comments[0].type).toBe("note");
  });
  it("reply distributes the updated thread", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1" })] });
    api.addReply.mockResolvedValue(mkComment({ id: "c1", messages: [{ author: "user", body: "hi", createdAt: 0 }] }));
    await C().reply("c1", "hi");
    expect(api.addReply).toHaveBeenCalledWith("/r", "c1", "user", "hi");
    expect(C().comments[0].messages).toHaveLength(1);
  });
  it("remove drops it from comments/archived and clears active", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1" })], activeId: "c1" });
    api.deleteComment.mockResolvedValue(undefined);
    await C().remove("c1");
    expect(C().comments).toHaveLength(0);
    expect(C().activeId).toBeNull();
  });
});

describe("setState + forge sync", () => {
  it("updates state without forge sync for a local comment", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1" })] });
    api.setCommentState.mockResolvedValue(mkComment({ id: "c1", state: "done" }));
    await C().setState("c1", "done");
    expect(api.forgeResolveThread).not.toHaveBeenCalled();
  });
  it("mirrors resolution to the forge for a pulled host thread", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1" })] });
    api.setCommentState.mockResolvedValue(
      mkComment({ id: "c1", state: "done", origin: "github", externalId: "t9", externalRef: "42" }),
    );
    await C().setState("c1", "done");
    expect(api.forgeResolveThread).toHaveBeenCalledWith("/r", 42, "t9", true);
  });
});

describe("re-anchor flow", () => {
  it("start/cancel toggle the reanchoring id", () => {
    C().startReanchor("c1");
    expect(C().reanchoringId).toBe("c1");
    expect(C().activeId).toBeNull();
    C().cancelReanchor();
    expect(C().reanchoringId).toBeNull();
  });
  it("applyReanchor re-binds the comment and clears reanchoring", async () => {
    useComments.setState({ comments: [mkComment({ id: "c1" })], reanchoringId: "c1" });
    api.setAnchor.mockResolvedValue(mkComment({ id: "c1", anchor: { file: "b.ts", scope: "range", startLine: 5, endLine: 6 } }));
    await C().applyReanchor("b.ts", 5, 6);
    expect(api.setAnchor).toHaveBeenCalledWith("/r", "c1", "b.ts", 5, 6);
    expect(C().comments[0].anchor.file).toBe("b.ts");
    expect(C().reanchoringId).toBeNull();
  });
  it("applyReanchor is a no-op with nothing armed", async () => {
    await C().applyReanchor("b.ts", 5, 6);
    expect(api.setAnchor).not.toHaveBeenCalled();
  });
});

describe("misc", () => {
  it("loadArchived sets the archived list", async () => {
    api.listArchived.mockResolvedValue([mkComment({ id: "old", archived: true })]);
    await C().loadArchived();
    expect(C().archived.map((c) => c.id)).toEqual(["old"]);
  });
  it("setGitignorePrompt / setActive / replaceForFile", () => {
    C().setGitignorePrompt(true);
    expect(C().gitignorePromptOpen).toBe(true);
    C().setActive("c1");
    expect(C().activeId).toBe("c1");
    useComments.setState({ comments: [mkComment({ id: "x", anchor: { file: "a.ts", scope: "range", startLine: 1, endLine: 1 } })] });
    C().replaceForFile("a.ts", [mkComment({ id: "y", anchor: { file: "a.ts", scope: "range", startLine: 9, endLine: 9 } })]);
    expect(C().comments.map((c) => c.id)).toEqual(["y"]);
  });
});

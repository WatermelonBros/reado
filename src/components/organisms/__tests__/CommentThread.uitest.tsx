// UI test: the floating single-comment thread popover. It renders the
// conversation, the type/state Selects, the task/note checkbox, a reply box and
// the edit/delete + "send this task to the agent" actions. The store's mutation
// edges (patch/reply/setState/remove) are stubbed with vi.fn via setState so no
// Tauri command fires; the agent-dispatch (../../lib/agents) and the prompt
// builder (../../lib/review) are mocked so nothing real launches. i18n is stubbed
// globally (t(k) => k), so labels are their message keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Agent dispatch + the single-task prompt builder are the only outward edges of
// the "send to agent" action. Mock both so the click is observable without a PTY.
const { dispatchToAgent } = vi.hoisted(() => ({ dispatchToAgent: vi.fn(async () => {}) }));
vi.mock("../../../lib/agents", () => ({ dispatchToAgent }));
const { composeSingleTaskPrompt } = vi.hoisted(() => ({
  composeSingleTaskPrompt: vi.fn((id: string) => `PROMPT:${id}`),
}));
vi.mock("../../../lib/review", () => ({ composeSingleTaskPrompt }));

import { CommentThread } from "../CommentThread";
import { useComments } from "../../../lib/comments";
import type { Comment } from "../../../lib/api";

function mkComment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/foo.ts", scope: "range", startLine: 3, endLine: 5 },
    context: { snippet: "const x = 1;", before: "", after: "" },
    links: [],
    author: "you",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [
      { author: "you", createdAt: 0, body: "please fix the parser" },
      { author: "agent", agent: "claude-code", createdAt: 1, body: "on it, boss" },
    ],
    archived: false,
    ...over,
  };
}

/** Stub the store's mutation edges; return the spies for assertions. */
function seed() {
  const patch = vi.fn(async () => {});
  const reply = vi.fn(async () => {});
  const setState = vi.fn(async () => {});
  const remove = vi.fn(async () => {});
  useComments.setState({ patch, reply, setState, remove });
  return { patch, reply, setState, remove };
}

function renderThread(comment: Comment, onClose = vi.fn()) {
  render(<CommentThread comment={comment} top={0} onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommentThread", () => {
  it("renders each message's body and author", () => {
    seed();
    renderThread(mkComment());

    expect(screen.getByText("please fix the parser")).toBeInTheDocument();
    expect(screen.getByText("on it, boss")).toBeInTheDocument();
    // The root author is "you" (label resolves to the t-key); the agent reply is
    // attributed to its brand name.
    expect(screen.getByText("comment.you")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("typing a reply and submitting calls the reply action with the trimmed body", async () => {
    const { reply } = seed();
    renderThread(mkComment());

    await userEvent.type(
      screen.getByPlaceholderText("comment.replyPlaceholder"),
      "  looks good  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "comment.reply" }));

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith("c1", "looks good");
  });

  it("the reply button is disabled until something is typed", async () => {
    seed();
    renderThread(mkComment());

    expect(screen.getByRole("button", { name: "comment.reply" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("comment.replyPlaceholder"), "hi");
    expect(screen.getByRole("button", { name: "comment.reply" })).toBeEnabled();
  });

  it("changing the type Select patches the type and re-derives the kind", async () => {
    const { patch } = seed();
    renderThread(mkComment());

    await userEvent.click(screen.getByRole("combobox", { name: "type" }));
    await userEvent.click(screen.getByRole("option", { name: "comment.type.bug" }));

    // An actionable type flips the comment to a task.
    expect(patch).toHaveBeenCalledWith("c1", { type: "bug", kind: "task" });
  });

  it("changing the state Select calls setState", async () => {
    const { setState } = seed();
    renderThread(mkComment());

    await userEvent.click(screen.getByRole("combobox", { name: "state" }));
    await userEvent.click(screen.getByRole("option", { name: "comment.state.done" }));

    expect(setState).toHaveBeenCalledWith("c1", "done");
  });

  it("toggling the task checkbox patches the kind", async () => {
    const { patch } = seed();
    renderThread(mkComment());

    await userEvent.click(screen.getByRole("checkbox", { name: "comment.task" }));
    expect(patch).toHaveBeenCalledWith("c1", { kind: "task" });
  });

  it("the delete-confirm flow removes only after confirmation", async () => {
    const { remove } = seed();
    renderThread(mkComment());

    // First press arms the confirmation; nothing is removed yet.
    await userEvent.click(screen.getByRole("button", { name: "comment.delete" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText("comment.deleteConfirm")).toBeInTheDocument();

    // The confirm button now removes.
    await userEvent.click(screen.getByRole("button", { name: "comment.delete" }));
    expect(remove).toHaveBeenCalledWith("c1");
  });

  it("cancelling the delete confirmation does not remove", async () => {
    const { remove } = seed();
    renderThread(mkComment());

    await userEvent.click(screen.getByRole("button", { name: "comment.delete" }));
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("sending an open task to the agent dispatches the composed prompt", async () => {
    seed();
    // The send action shows only for an open task.
    renderThread(mkComment({ kind: "task", state: "open" }));

    await userEvent.click(screen.getByRole("button", { name: "terminal.sendReview" }));

    expect(composeSingleTaskPrompt).toHaveBeenCalledWith("c1");
    expect(dispatchToAgent).toHaveBeenCalledWith("PROMPT:c1");
  });

  it("hides the send-to-agent action for a note (non-task) comment", () => {
    seed();
    renderThread(mkComment());
    expect(
      screen.queryByRole("button", { name: "terminal.sendReview" }),
    ).not.toBeInTheDocument();
  });

  it("close calls onClose", async () => {
    seed();
    const { onClose } = renderThread(mkComment());
    await userEvent.click(screen.getByRole("button", { name: "settings.close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// "Send review" dialog: pick which open tasks to hand off and which terminal
// (agent) receives them, then kick the resolve loop with the selected ids. The
// task list (comments store) and project root are seeded on the real stores;
// the side-effect edges — the terminals store and the resolve loop — are mocked
// so nothing real dispatches. i18n is stubbed globally (t(k) => k).
//
// Ark's dialog only mounts its portal under real timers, so we never hold fake
// timers here and read the open modal with `await screen.findBy…`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Terminals store: selector hook + getState (send() calls setActive/add through
// getState). Flat + mutable so each test can seed sessions/activeId.
const term = vi.hoisted(() => {
  const state = {
    sessions: [] as { id: string; title: string }[],
    activeId: null as string | null,
    add: vi.fn(() => "t-new"),
    setActive: vi.fn((id: string) => {
      state.activeId = id;
    }),
  };
  return { state };
});
vi.mock("../../../lib/terminals", () => ({
  useTerminals: Object.assign(
    (sel: (s: typeof term.state) => unknown) => sel(term.state),
    { getState: () => term.state },
  ),
}));

const { start } = vi.hoisted(() => ({ start: vi.fn(async () => {}) }));
vi.mock("../../../lib/resolveLoop", () => ({
  useResolveLoop: { getState: () => ({ start }) },
}));

import { SendReviewDialog } from "../SendReviewDialog";
import { useComments } from "../../../lib/comments";
import { useProject } from "../../../lib/store";
import type { Comment, CommentType } from "../../../lib/api";

/** Minimal open task comment for seeding the review list. */
function task(id: string, body: string, type: CommentType = "bug"): Comment {
  return {
    id,
    type,
    state: "open",
    kind: "task",
    anchor: { file: "src/x.ts", scope: "range", startLine: 7, endLine: 9 },
    context: {},
    links: [],
    author: "me",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [{ author: "me", createdAt: 0, body }],
    archived: false,
  } as unknown as Comment;
}

beforeEach(() => {
  vi.clearAllMocks();
  term.state.sessions = [];
  term.state.activeId = null;
  useProject.setState({ root: "/proj" });
  useComments.setState({ comments: [] });
});

describe("SendReviewDialog", () => {
  it("lists the open tasks and the terminal picker when there are multiple agents", async () => {
    term.state.sessions = [
      { id: "t1", title: "Terminal 1" },
      { id: "t2", title: "Terminal 2" },
    ];
    term.state.activeId = "t1";
    useComments.setState({
      comments: [task("c1", "fix the parser"), task("c2", "tighten the loop", "performance")],
    });

    render(<SendReviewDialog open onClose={() => {}} />);

    expect(await screen.findByRole("heading", { name: "review.title" })).toBeInTheDocument();
    expect(screen.getByText("fix the parser")).toBeInTheDocument();
    expect(screen.getByText("tighten the loop")).toBeInTheDocument();
    // Two tasks → two checkboxes, both selected by default.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b).toBeChecked());
    // The target-terminal picker shows because there is more than one session.
    expect(screen.getByLabelText("review.target")).toBeInTheDocument();
  });

  it("disables Send when there are no open tasks", async () => {
    render(<SendReviewDialog open onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: "review.title" })).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "review.send" })).toBeDisabled();
  });

  it("disables Send once every task is deselected", async () => {
    useComments.setState({ comments: [task("c1", "only task")] });
    render(<SendReviewDialog open onClose={() => {}} />);

    const send = await screen.findByRole("button", { name: "review.send" });
    expect(send).toBeEnabled();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(send).toBeDisabled();
  });

  it("Send starts the resolve loop with the selected ids and closes", async () => {
    const onClose = vi.fn();
    useComments.setState({ comments: [task("c1", "one"), task("c2", "two")] });

    render(<SendReviewDialog open onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "review.send" }));

    expect(start).toHaveBeenCalledWith("/proj", ["c1", "c2"]);
    // No active terminal and no explicit target → spawn one to receive the handoff.
    expect(term.state.add).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Cancel closes without starting the loop", async () => {
    const onClose = vi.fn();
    useComments.setState({ comments: [task("c1", "one")] });

    render(<SendReviewDialog open onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "common.cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});

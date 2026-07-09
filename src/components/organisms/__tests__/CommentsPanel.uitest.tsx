// UI test: the Comments side panel. It lists open comments, switches to the
// archived History view, filters by type/state/this-file, and navigates the
// editor when a comment is clicked. The real stores are seeded (useComments,
// useProject, useReadProgress) and the outward edges are stubbed with vi.fn:
// `loadArchived`/`setActive` on the comments store and `open` on the project
// store, so no Tauri command fires. The workspace filter store (persisted) is
// reset to its defaults each test. i18n is stubbed globally (t(k) => k).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommentsPanel } from "../CommentsPanel";
import { useComments } from "../../../lib/comments";
import { useProject, useWorkspace } from "../../../lib/store";
import { useReadProgress } from "../../../lib/readProgress";
import type { Comment, CommentType } from "../../../lib/api";

const ROOT = "/repo";

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/a.ts", scope: "range", startLine: 12, endLine: 12 },
    context: { snippet: "", before: "", after: "" },
    links: [],
    author: "you",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [{ author: "you", createdAt: 0, body: "why is this here?" }],
    archived: false,
    ...over,
  };
}

/** Seed both stores' data + stub the navigation/loading edges. */
function seed(opts: { comments?: Comment[]; archived?: Comment[]; active?: string | null } = {}) {
  const open = vi.fn();
  const setActive = vi.fn();
  const loadArchived = vi.fn(async () => {});
  useComments.setState({
    comments: opts.comments ?? [],
    archived: opts.archived ?? [],
    loadArchived,
    setActive,
    activeId: null,
  });
  useProject.setState({ root: ROOT, active: opts.active ?? null, open });
  return { open, setActive, loadArchived };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Filters live in the persisted workspace store; reset to defaults so tests
  // don't leak view/type/state into each other.
  useWorkspace.setState({
    commentFilter: { view: "open", type: "all", state: "all", thisFile: false },
  });
  useReadProgress.setState({ read: new Set(), changed: new Set() });
});

describe("CommentsPanel", () => {
  it("lists the open comments", () => {
    seed({
      comments: [
        comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "first note" }] }),
        comment({ id: "c2", messages: [{ author: "you", createdAt: 0, body: "second note" }] }),
      ],
    });
    render(<CommentsPanel />);

    expect(screen.getByText("first note")).toBeInTheDocument();
    expect(screen.getByText("second note")).toBeInTheDocument();
  });

  it("shows the empty state when there are no open comments", () => {
    seed({ comments: [] });
    render(<CommentsPanel />);
    expect(screen.getByText("comments.empty")).toBeInTheDocument();
  });

  it("switching to History loads and shows the archived comments", async () => {
    const { loadArchived } = seed({
      comments: [comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "still open" }] })],
      archived: [
        comment({
          id: "a1",
          state: "done",
          archived: true,
          messages: [{ author: "you", createdAt: 0, body: "resolved thing" }],
        }),
      ],
    });
    render(<CommentsPanel />);

    await userEvent.click(screen.getByText("comments.history"));

    expect(loadArchived).toHaveBeenCalled();
    expect(screen.getByText("resolved thing")).toBeInTheDocument();
    // The open comment is not in the history view.
    expect(screen.queryByText("still open")).not.toBeInTheDocument();
  });

  it("a type filter narrows the list to matching comments", async () => {
    seed({
      comments: [
        comment({
          id: "c1",
          type: "bug" as CommentType,
          kind: "task",
          messages: [{ author: "you", createdAt: 0, body: "a real bug" }],
        }),
        comment({
          id: "c2",
          type: "note" as CommentType,
          messages: [{ author: "you", createdAt: 0, body: "just a note" }],
        }),
      ],
    });
    render(<CommentsPanel />);

    // Both show under the default "all" filter.
    expect(screen.getByText("a real bug")).toBeInTheDocument();
    expect(screen.getByText("just a note")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "type filter" }));
    await userEvent.click(screen.getByRole("option", { name: "comment.type.bug" }));

    expect(screen.getByText("a real bug")).toBeInTheDocument();
    expect(screen.queryByText("just a note")).not.toBeInTheDocument();
  });

  it("clicking a comment opens its file at the anchor and selects it", async () => {
    const { open, setActive } = seed({
      comments: [comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "jump here" }] })],
    });
    render(<CommentsPanel />);

    await userEvent.click(screen.getByText("jump here"));

    expect(open).toHaveBeenCalledWith(`${ROOT}/src/a.ts`, 12);
    expect(setActive).toHaveBeenCalledWith("c1");
  });

  it("marks a comment as pending when its file changed since it was read", () => {
    seed({
      comments: [comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "check me" }] })],
    });
    // The agent touched this file after it was last read → pending review.
    useReadProgress.setState({ changed: new Set(["src/a.ts"]) });
    render(<CommentsPanel />);

    // t("comments.pending") is uppercased in the badge.
    expect(screen.getByText("COMMENTS.PENDING")).toBeInTheDocument();
    expect(screen.getByText("comments.agentChanged")).toBeInTheDocument();
  });
});

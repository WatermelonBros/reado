// UI test: the left tool rail renders base tools always, gated tools only when
// their store condition holds, shows a Badge count for tools that carry one,
// selects a tool on click, and wires the docs/graph/settings footer buttons.
// (Pointer drag-reorder is deliberately not exercised — too fragile in jsdom.)
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "../../../lib/api";

import { ActivityBar } from "../ActivityBar";
import { useWorkspace, usePalette, useProject } from "../../../lib/store";
import { useComments } from "../../../lib/comments";
import { useSpecs } from "../../../lib/specs";
import { useDiagnostics } from "../../../lib/diagnostics";
import { useBookmarks } from "../../../lib/bookmarks";
import { useHierarchy } from "../../../lib/hierarchy";
import { useQa } from "../../../lib/qa";
import { useTours } from "../../../lib/tours";
import { usePreReview } from "../../../lib/preReview";
import { useGuidedReview } from "../../../lib/guidedReview";

const mkComment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    type: "note",
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

// Reset every store the rail reads so each test starts from a known baseline:
// base tools visible, all gated tools hidden, no badges.
beforeEach(() => {
  useWorkspace.setState({ tool: "files", toolOrder: [] });
  usePalette.setState({ settingsOpen: false });
  useProject.setState({ git: { isRepo: false, branch: null, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false } });
  useComments.setState({ comments: [] });
  useSpecs.setState({ groups: [] });
  useDiagnostics.setState({ byFile: {} });
  useBookmarks.setState({ bookmarks: [] });
  useHierarchy.setState({ root: null, loading: false, unsupported: false });
  useQa.setState({ notes: [] });
  useTours.setState({ tours: [] });
  usePreReview.setState({ drafts: [] });
  useGuidedReview.setState({ sessions: [] });
});

// Buttons carry the (mocked-through) i18n key as their aria-label, so we can
// query by role+name using the key directly.
const tool = (name: string) => screen.getByRole("button", { name });

describe("ActivityBar", () => {
  it("renders the base tools as labelled buttons", () => {
    render(<ActivityBar />);
    for (const label of [
      "files.panel",
      "search.placeholder",
      "comments.panel",
      "outline.panel",
      "ext.panel",
      "guided.panel",
      "coverage.panel",
    ]) {
      expect(tool(label)).toBeInTheDocument();
    }
  });

  it("renders the footer docs / graph / settings buttons", () => {
    render(<ActivityBar />);
    expect(tool("kb.title")).toBeInTheDocument();
    expect(tool("graph.title")).toBeInTheDocument();
    expect(tool("settings.title")).toBeInTheDocument();
  });

  it("shows the git tool only when the project is a repo", () => {
    // One reactive instance: the git tool appears when the store flips to a repo
    // (rendering twice would leave two live ActivityBars both reacting → two
    // git buttons, which getByRole then rejects as ambiguous).
    render(<ActivityBar />);
    expect(screen.queryByRole("button", { name: "git.panel" })).not.toBeInTheDocument();

    act(() => useProject.setState({ git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false } }));
    expect(tool("git.panel")).toBeInTheDocument();
  });

  it("renders a badge count for a tool that carries one", () => {
    useComments.setState({
      comments: [
        mkComment({ id: "c1", state: "open" }),
        mkComment({ id: "c2", state: "open" }),
        mkComment({ id: "c3", state: "done" }),
      ],
    });
    render(<ActivityBar />);
    // Two open comments → the comments button shows the count "2".
    const commentsBtn = tool("comments.panel");
    expect(commentsBtn).toHaveTextContent("2");
  });

  it("selects a tool in the workspace store when its button is clicked", async () => {
    render(<ActivityBar />);
    // Start on "files"; clicking outline selects it.
    await userEvent.click(tool("outline.panel"));
    expect(useWorkspace.getState().tool).toBe("outline");

    await userEvent.click(tool("search.placeholder"));
    expect(useWorkspace.getState().tool).toBe("search");
  });

  it("toggles the settings palette when Settings is clicked", async () => {
    render(<ActivityBar />);
    expect(usePalette.getState().settingsOpen).toBe(false);
    await userEvent.click(tool("settings.title"));
    expect(usePalette.getState().settingsOpen).toBe(true);
  });
});

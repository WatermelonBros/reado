// The Review Guide cockpit. Focused on the empty state (pick a source + objective,
// Start a review) and the busy indicator — the session view's proposal machinery
// is exercised via the guidedReview lib tests. Edges are mocked; the store is real,
// with `start` stubbed. i18n is globally mocked (t(k)=>k).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Keep the branch-source effect and agent/forge edges off Tauri.
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitBranches: vi.fn(async () => ({ local: ["main"], current: "main" })),
}));
vi.mock("../../../lib/agents", () => ({
  dispatchToAgent: vi.fn(),
  sanitizePromptText: (s: string) => s,
}));

import { GuidedReviewPanel } from "../GuidedReviewPanel";
import { useGuidedReview } from "../../../lib/guidedReview";
import { useProject, useSettings } from "../../../lib/store";

const start = vi.fn(async () => null);

beforeEach(() => {
  start.mockClear();
  useGuidedReview.setState({ sessions: [], currentId: null, busy: false, start });
  useProject.setState({ root: "/repo", git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false }, open: vi.fn() });
  useSettings.setState({ reviewObjective: "bug_risk" });
});

describe("GuidedReviewPanel", () => {
  it("shows the empty-state review setup with a Start button", () => {
    render(<GuidedReviewPanel />);
    expect(screen.getByText("guided.empty.body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "guided.startReview" })).toBeInTheDocument();
  });

  it("starts a diff review with the persisted objective", async () => {
    render(<GuidedReviewPanel />);
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }));
    expect(start).toHaveBeenCalledWith("/repo", { kind: "diff" }, "bug_risk");
  });

  it("starts a session for a free-text request (not a one-off comment dump)", async () => {
    render(<GuidedReviewPanel />);
    // Switch the source to the free-text "prompt" method…
    await userEvent.click(screen.getByRole("combobox", { name: "guided.source" }));
    await userEvent.click(screen.getByRole("option", { name: "guided.src.prompt" }));
    // …describe the review and start it.
    await userEvent.type(
      await screen.findByPlaceholderText("guided.reviewPromptPlaceholder"),
      "evaluate the tests",
    );
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }));
    // It must create a guided-review workflow (session), scoped to the request.
    expect(start).toHaveBeenCalledWith(
      "/repo",
      { kind: "prompt", request: "evaluate the tests" },
      "bug_risk",
    );
  });

  it("surfaces the busy indicator while the agent works", () => {
    render(<GuidedReviewPanel />);
    expect(screen.queryByText("guided.busy")).not.toBeInTheDocument();
    act(() => useGuidedReview.setState({ busy: true }));
    expect(screen.getByText("guided.busy")).toBeInTheDocument();
  });
});

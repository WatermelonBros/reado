// UI test: the AI pre-review panel lists the agent's DRAFT review comments and
// lets the human approve one (→ a real comment, draft removed), discard one, or
// dispatch a fresh generation run to the terminal agent.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreReviewPanel } from "../PreReviewPanel";
import { usePreReview, type Draft } from "../../../lib/preReview";
import { useComments } from "../../../lib/comments";
import { useProject } from "../../../lib/store";
import { dispatchToAgent } from "../../../lib/agents";

// The terminal-agent dispatch is the only side effect of a run; mock it so a run
// is observable without spawning anything.
vi.mock("../../../lib/agents", () => ({ dispatchToAgent: vi.fn() }));

// The store's persistence + polling edges hit Tauri; stub just those so the real
// approve/discard/generate logic runs deterministically.
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  readFile: vi.fn().mockResolvedValue({ kind: "text", text: "" }),
  createFile: vi.fn().mockResolvedValue("/repo/.reado/pre-review.json"),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const ROOT = "/repo";

function draft(over: Partial<Draft> = {}): Draft {
  return {
    id: "pr_0_src_a.ts_12",
    file: "src/a.ts",
    line: 12,
    type: "bug",
    body: "This looks off-by-one.",
    ...over,
  };
}

function seed(drafts: Draft[]) {
  usePreReview.setState({ drafts, generating: false, error: false });
  useProject.setState({ root: ROOT, open: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
  usePreReview.setState({ drafts: [], generating: false, error: false });
  // The real approve() delegates to the comments store; stub that one action so
  // approving is observable and never touches the backend.
  useComments.setState({ create: vi.fn().mockResolvedValue({ firstComment: false }) as never });
});

describe("PreReviewPanel", () => {
  it("shows the empty state when there are no drafts", () => {
    seed([]);
    render(<PreReviewPanel />);
    expect(screen.getByText("prereview.empty")).toBeInTheDocument();
  });

  it("lists each draft with its type, file, line and body", () => {
    seed([
      draft(),
      draft({ id: "pr_1_src_b.ts_3", file: "src/b.ts", line: 3, type: "refactor", body: "Extract this." }),
    ]);
    render(<PreReviewPanel />);
    expect(screen.getByText("This looks off-by-one.")).toBeInTheDocument();
    expect(screen.getByText("Extract this.")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("refactor")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
  });

  it("approve materializes the draft into a comment and removes it from the list", async () => {
    seed([draft()]);
    render(<PreReviewPanel />);
    await userEvent.click(screen.getByRole("button", { name: "prereview.approve" }));

    // Materialized: the comments store was asked to create the anchored comment.
    expect(useComments.getState().create).toHaveBeenCalledWith(
      expect.objectContaining({ file: "src/a.ts", startLine: 12, endLine: 12, type: "bug", body: "This looks off-by-one." }),
    );
    // Removed: the draft is gone from the panel (and the store).
    await waitFor(() => expect(screen.queryByText("This looks off-by-one.")).not.toBeInTheDocument());
    expect(usePreReview.getState().drafts).toHaveLength(0);
  });

  it("discard removes the draft without creating a comment", async () => {
    seed([draft()]);
    render(<PreReviewPanel />);
    await userEvent.click(screen.getByRole("button", { name: "prereview.discard" }));

    await waitFor(() => expect(screen.queryByText("This looks off-by-one.")).not.toBeInTheDocument());
    expect(usePreReview.getState().drafts).toHaveLength(0);
    expect(useComments.getState().create).not.toHaveBeenCalled();
  });

  it("the run action dispatches a generation prompt to the agent", async () => {
    seed([]);
    render(<PreReviewPanel />);
    await userEvent.click(screen.getByRole("button", { name: "prereview.run" }));

    expect(dispatchToAgent).toHaveBeenCalledTimes(1);
    // Flips into the generating state (button label + store flag).
    expect(usePreReview.getState().generating).toBe(true);
    expect(screen.getByRole("button", { name: "prereview.generating" })).toBeDisabled();
  });
});

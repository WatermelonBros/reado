// UI test: the Orphans panel lists comments whose anchored code was lost and
// re-anchors one (opens the file + starts the re-anchor flow).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

import { OrphansPanel } from "./OrphansPanel";
import { useComments } from "../../lib/comments";
import { useProject } from "../../lib/store";
import type { Comment } from "../../lib/api";

const ROOT = "/repo";

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/a.ts", scope: "range", startLine: 12, endLine: 12 },
    context: { snippet: "const x = 1;", before: "", after: "" },
    links: [],
    author: "you",
    orphan: true,
    createdAt: 0,
    updatedAt: 0,
    messages: [{ author: "you", createdAt: 0, body: "why is this here?" }],
    archived: false,
    ...over,
  };
}

function seed(comments: Comment[]) {
  const open = vi.fn();
  const startReanchor = vi.fn();
  useComments.setState({ comments, startReanchor });
  useProject.setState({ root: ROOT, open });
  return { open, startReanchor };
}

beforeEach(() => {
  useComments.setState({ comments: [] });
});

describe("OrphansPanel", () => {
  it("shows the empty state when nothing is orphaned", () => {
    seed([comment({ orphan: false })]);
    render(<OrphansPanel />);
    expect(screen.getByText("orphans.empty")).toBeInTheDocument();
  });

  it("lists orphaned comments with message, type label and snippet", () => {
    seed([comment()]);
    render(<OrphansPanel />);
    expect(screen.getByText("why is this here?")).toBeInTheDocument();
    expect(screen.getByText("comment.type.note")).toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
    expect(screen.getByText("orphans.lastKnown")).toBeInTheDocument();
  });

  it("re-anchor opens the last-known file and starts the flow", async () => {
    const { open, startReanchor } = seed([comment()]);
    render(<OrphansPanel />);
    await userEvent.click(screen.getByRole("button", { name: "orphans.reanchor" }));
    expect(open).toHaveBeenCalledWith(`${ROOT}/src/a.ts`);
    expect(startReanchor).toHaveBeenCalledWith("c1");
  });

  it("re-anchor without an anchor file only starts the flow", async () => {
    const { open, startReanchor } = seed([
      comment({ anchor: { file: "", scope: "file", startLine: 0, endLine: 0 } }),
    ]);
    render(<OrphansPanel />);
    await userEvent.click(screen.getByRole("button", { name: "orphans.reanchor" }));
    expect(open).not.toHaveBeenCalled();
    expect(startReanchor).toHaveBeenCalledWith("c1");
  });
});

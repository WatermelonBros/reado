// UI test: the file-/folder-/project-scoped comment dialog opened from the tree
// context menu. It renders inside the Ark `Modal` (a headless dialog portal), so
// content is asserted with real timers + `await screen.findBy…` — Ark's dialog
// machine does not mount its content under Vitest fake timers. The comment-create
// edge is the `useComments.create` store action, stubbed via setState with a
// vi.fn. i18n is mocked to keys globally.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TreeCommentDialog, type CommentTarget } from "../TreeCommentDialog";
import { useComments } from "../../../lib/comments";
import { useSettings } from "../../../lib/store";
import type { Comment } from "../../../lib/api";

function mkComment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/a.ts", scope: "file", startLine: 0, endLine: 0 },
    context: { snippet: "", before: "", after: "" },
    links: [],
    author: "you",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    archived: false,
    ...over,
  };
}

function seed() {
  const create = vi.fn(async () => ({ comment: mkComment(), firstComment: false }));
  useComments.setState({
    create,
    setGitignorePrompt: vi.fn(),
  });
  useSettings.setState({ gitignoreDontAsk: true });
  return { create };
}

const FILE_TARGET: CommentTarget = { kind: "file", path: "src/a.ts" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TreeCommentDialog", () => {
  it("shows the textarea and Save/Cancel when opened for a target", async () => {
    seed();
    render(<TreeCommentDialog target={FILE_TARGET} onClose={vi.fn()} />);

    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "comment.save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
  });

  it("typing then Save creates the file-scoped comment and closes", async () => {
    const { create } = seed();
    const onClose = vi.fn();
    render(<TreeCommentDialog target={FILE_TARGET} onClose={onClose} />);

    await userEvent.type(await screen.findByRole("textbox"), "review this file");
    await userEvent.click(screen.getByRole("button", { name: "comment.save" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        file: "src/a.ts",
        scope: "file",
        startLine: 0,
        endLine: 0,
        type: "note",
        kind: "note",
        body: "review this file",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes without creating", async () => {
    const { create } = seed();
    const onClose = vi.fn();
    render(<TreeCommentDialog target={FILE_TARGET} onClose={onClose} />);

    await screen.findByRole("textbox");
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(create).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

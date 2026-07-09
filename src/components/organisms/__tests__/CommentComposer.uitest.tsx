// UI test: the inline line-selection comment composer. The comment-create edge is
// the `useComments.create` store action, stubbed via setState with a vi.fn so no
// Tauri command fires; assertions are behavioural (textarea value, task checkbox,
// which payload `create` receives, whether `onClose` runs). i18n is mocked to keys
// globally, so labels are their message keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommentComposer } from "../CommentComposer";
import { useComments } from "../../../lib/comments";
import { useSettings } from "../../../lib/store";
import type { Comment, CommentType, Context } from "../../../lib/api";

const CONTEXT: Context = { snippet: "const x = 1;", before: "a", after: "b" };

function mkComment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/foo.ts", scope: "range", startLine: 3, endLine: 5 },
    context: CONTEXT,
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

/** Stub the store's create edge; returns the spy for assertions. */
function seed(firstComment = false) {
  const create = vi.fn(async () => ({ comment: mkComment(), firstComment }));
  useComments.setState({
    create,
    setGitignorePrompt: vi.fn(),
    setLastType: vi.fn(),
    lastType: "note",
  });
  useSettings.setState({ gitignoreDontAsk: true });
  return { create };
}

function renderComposer(
  props: Partial<{
    initialBody: string;
    initialType: CommentType;
    onClose: () => void;
  }> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <CommentComposer
      relPath="src/foo.ts"
      startLine={3}
      endLine={5}
      context={CONTEXT}
      top={0}
      onClose={onClose}
      initialBody={props.initialBody}
      initialType={props.initialType}
    />,
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommentComposer", () => {
  it("seeds the textarea and task flag from the initial body/type", () => {
    seed();
    renderComposer({ initialBody: "seeded note", initialType: "bug" });

    expect(screen.getByRole("textbox")).toHaveValue("seeded note");
    // An actionable initial type (bug) defaults the comment to a task.
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "comment.save" })).toBeEnabled();
  });

  it("typing then Save creates the comment with the body + anchor and closes", async () => {
    const { create } = seed();
    const { onClose } = renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "please fix");
    await userEvent.click(screen.getByRole("button", { name: "comment.save" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        file: "src/foo.ts",
        scope: "range",
        startLine: 3,
        endLine: 5,
        type: "note",
        kind: "note",
        body: "please fix",
        context: CONTEXT,
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+Enter in the textarea also saves", async () => {
    const { create } = seed();
    const { onClose } = renderComposer();

    const box = screen.getByRole("textbox");
    await userEvent.type(box, "quick save");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ body: "quick save" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape in the textarea closes without creating", async () => {
    const { create } = seed();
    const { onClose } = renderComposer({ initialBody: "typed but escaped" });

    screen.getByRole("textbox").focus();
    await userEvent.keyboard("{Escape}");

    expect(create).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes without creating", async () => {
    const { create } = seed();
    const { onClose } = renderComposer({ initialBody: "typed but cancelled" });

    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(create).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Save is disabled and no-ops on an empty body", async () => {
    const { create } = seed();
    const { onClose } = renderComposer();

    const save = screen.getByRole("button", { name: "comment.save" });
    expect(save).toBeDisabled();
    await userEvent.click(save);

    expect(create).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

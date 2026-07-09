// The code-viewer overlays: presentational components lifted out of CodeView.
// i18n is globally mocked to echo the key, so we assert on keys.
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorView } from "@codemirror/view";
import type { Comment } from "../../../../lib/api";
import {
  SaveErrorBanner,
  StickyHeaders,
  ReanchorBar,
  PeekPanel,
  AddCommentButton,
  ThreadConnector,
  type PeekInfo,
} from "../CodeOverlays";

describe("SaveErrorBanner", () => {
  it("shows the error and dismisses", async () => {
    const onDismiss = vi.fn();
    render(<SaveErrorBanner onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toHaveTextContent("editor.saveError");
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("ReanchorBar", () => {
  it("renders the hint and wires confirm/cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ReanchorBar label="foo" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText("orphans.reanchorHint")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "orphans.confirm" }));
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("PeekPanel", () => {
  const withTarget: PeekInfo = {
    top: 10,
    label: "src/a.ts:5",
    lines: ["const a = 1", "const b = 2"],
    defLineIndex: 0,
    target: { path: "src/a.ts", line: 5 },
  };

  it("shows the preview and opens/closes the target", async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(<PeekPanel peek={withTarget} onOpen={onOpen} onClose={onClose} />);
    expect(screen.getByText("src/a.ts:5")).toBeInTheDocument();
    expect(screen.getByText("const a = 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "peek.open" }));
    expect(onOpen).toHaveBeenCalledWith({ path: "src/a.ts", line: 5 });
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the not-found state with no open action or code", () => {
    const peek: PeekInfo = { top: 0, label: "missing", lines: [], defLineIndex: -1, target: null };
    render(<PeekPanel peek={peek} onOpen={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("peek.none")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "peek.open" })).not.toBeInTheDocument();
  });
});

describe("AddCommentButton", () => {
  it("positions at `top` and fires onClick", async () => {
    const onClick = vi.fn();
    render(<AddCommentButton top={42} onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "comment.new" });
    expect(btn.style.top).toBe("42px");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("StickyHeaders", () => {
  it("renders a jump button per header (safe with a null view)", () => {
    const viewRef = createRef<EditorView>();
    const hostRef = createRef<HTMLDivElement>();
    render(
      <StickyHeaders
        headers={[
          { line: 3, text: "function a() {" },
          { line: 8, text: "  if (x) {" },
        ]}
        viewRef={viewRef}
        hostRef={hostRef}
      />,
    );
    // getByText trims/collapses whitespace, so query the trimmed forms.
    expect(screen.getByText("function a() {")).toBeInTheDocument();
    expect(screen.getByText("if (x) {")).toBeInTheDocument();
  });
});

describe("ThreadConnector", () => {
  const comment = (startLine: number, endLine: number) =>
    ({ type: "bug", anchor: { scope: "range", startLine, endLine } }) as unknown as Comment;

  it("draws one path for a single-line anchor, two for a multi-line one", () => {
    const single = render(
      <ThreadConnector comment={comment(4, 4)} threadTop={100} startTop={40} width={600} />,
    );
    expect(single.container.querySelectorAll("path")).toHaveLength(1);

    const multi = render(
      <ThreadConnector comment={comment(4, 9)} threadTop={100} startTop={40} width={600} />,
    );
    // The multi-line anchor adds the vertical rail path.
    expect(multi.container.querySelectorAll("path")).toHaveLength(2);
  });
});

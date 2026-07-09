// The Textarea atom: the composer keyboard convention (Cmd/Ctrl+Enter submits,
// Escape cancels), variant surface, and onKeyDown passthrough.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "../Textarea";

describe("Textarea", () => {
  it("submits on Cmd/Ctrl+Enter but not on a bare Enter", () => {
    const onSubmit = vi.fn();
    render(<Textarea aria-label="body" onSubmit={onSubmit} />);
    const el = screen.getByLabelText("body");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(el, { key: "Enter", metaKey: true });
    fireEvent.keyDown(el, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<Textarea aria-label="body" onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByLabelText("body"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("still calls a caller's onKeyDown", () => {
    const onKeyDown = vi.fn();
    render(<Textarea aria-label="body" onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByLabelText("body"), { key: "a" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("applies variant + mono, overridable by className", () => {
    render(<Textarea aria-label="body" variant="filled" mono className="bg-canvas" />);
    const el = screen.getByLabelText("body");
    expect(el.className).toContain("font-mono");
    expect(el.className).toContain("bg-canvas");
    expect(el.className).not.toContain("bg-surface");
  });
});

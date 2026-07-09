// IconButton atom: the accessible name, click, and toggle state.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "../IconButton";

describe("IconButton", () => {
  it("exposes its label as the accessible name and fires onClick", async () => {
    const onClick = vi.fn();
    render(<IconButton label="Collapse all" icon={<svg />} onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "Collapse all" });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("reflects the active toggle state via aria-pressed", () => {
    // A plain action (no `active`) exposes no aria-pressed.
    const { rerender } = render(<IconButton label="Refresh" icon={<svg />} />);
    expect(screen.getByRole("button", { name: "Refresh" })).not.toHaveAttribute("aria-pressed");
    // A toggle exposes aria-pressed true/false — including when off.
    rerender(<IconButton label="Show hidden" icon={<svg />} active={false} />);
    expect(screen.getByRole("button", { name: "Show hidden" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<IconButton label="Show hidden" icon={<svg />} active />);
    expect(screen.getByRole("button", { name: "Show hidden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

// The Button atom: children, click, disabled, default type, variant/size classes,
// and className override (via cn/tailwind-merge).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  it("renders its children and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button (won't submit a form)", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });

  it("is inert when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies the variant surface (primary = accent fill, danger = marker)", () => {
    const { rerender } = render(<Button variant="primary">A</Button>);
    expect(screen.getByRole("button", { name: "A" }).className).toContain("bg-accent");
    rerender(<Button variant="danger">A</Button>);
    expect(screen.getByRole("button", { name: "A" }).className).toContain("text-marker");
  });

  it("applies the size and defaults to ghost variant", () => {
    render(<Button size="sm">S</Button>);
    const btn = screen.getByRole("button", { name: "S" });
    expect(btn.className).toContain("h-6"); // sm
    expect(btn.className).toContain("text-muted"); // ghost default
  });

  it("merges an override className over a default (cn)", () => {
    render(
      <Button variant="primary" className="bg-surface">
        O
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "O" });
    expect(btn.className).toContain("bg-surface");
    // twMerge dropped the variant's bg-accent in favour of the override.
    expect(btn.className).not.toContain("bg-accent");
  });
});

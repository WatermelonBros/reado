// UI test: the structure ribbon renders one clickable mark per entry, jumps to
// the mark's line on click, and shows the viewport band when provided.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StructureRibbon, type RibbonMark } from "../StructureRibbon";

const MARKS: RibbonMark[] = [
  { line: 3, kind: "symbol" },
  { line: 12, kind: "comment" },
  { line: 20, kind: "error" },
  { line: 40, kind: "warn" },
];

describe("StructureRibbon", () => {
  it("renders one button per mark", () => {
    render(<StructureRibbon marks={MARKS} totalLines={100} band={null} onJump={vi.fn()} />);
    // Each mark is a <button> whose accessible name comes from its title.
    expect(screen.getAllByRole("button")).toHaveLength(MARKS.length);
    expect(screen.getByRole("button", { name: "symbol · 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "comment · 12" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "error · 20" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "warn · 40" })).toBeInTheDocument();
  });

  it("positions each mark along the column by its line ratio", () => {
    render(<StructureRibbon marks={MARKS} totalLines={100} band={null} onJump={vi.fn()} />);
    expect(screen.getByRole("button", { name: "symbol · 3" })).toHaveStyle({ top: "3%" });
    expect(screen.getByRole("button", { name: "warn · 40" })).toHaveStyle({ top: "40%" });
  });

  it("calls onJump with the mark's line when clicked", async () => {
    const onJump = vi.fn();
    render(<StructureRibbon marks={MARKS} totalLines={100} band={null} onJump={onJump} />);
    await userEvent.click(screen.getByRole("button", { name: "error · 20" }));
    expect(onJump).toHaveBeenCalledWith(20);
  });

  it("renders the viewport band when one is provided", () => {
    const { container } = render(
      <StructureRibbon marks={MARKS} totalLines={100} band={{ top: 25, height: 30 }} onJump={vi.fn()} />,
    );
    const root = container.firstElementChild as HTMLElement;
    const bandEls = root.querySelectorAll(":scope > div");
    expect(bandEls).toHaveLength(1);
    expect(bandEls[0]).toHaveStyle({ top: "25%", height: "30%" });
  });

  it("renders no band element when band is null", () => {
    const { container } = render(
      <StructureRibbon marks={MARKS} totalLines={100} band={null} onJump={vi.fn()} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelectorAll(":scope > div")).toHaveLength(0);
  });

  it("renders without crashing when there are no marks", () => {
    render(<StructureRibbon marks={[]} totalLines={100} band={null} onJump={vi.fn()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("guards against a zero total-lines divisor", () => {
    render(<StructureRibbon marks={[{ line: 1, kind: "symbol" }]} totalLines={0} band={null} onJump={vi.fn()} />);
    // totalLines is clamped to >= 1, so line 1 maps to 100% rather than dividing by zero.
    expect(screen.getByRole("button", { name: "symbol · 1" })).toHaveStyle({ top: "100%" });
  });
});

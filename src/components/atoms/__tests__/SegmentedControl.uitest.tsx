// The SegmentedControl atom (Ark SegmentGroup): renders each segment, marks the
// active one, and reports a selection through onChange.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "../SegmentedControl";

const segments = [
  { id: "open", label: "Open" },
  { id: "history", label: "History" },
] as const;

function setup(value: "open" | "history" = "open") {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      value={value}
      onChange={onChange}
      segments={segments as unknown as { id: string; label: string }[]}
      ariaLabel="view"
    />,
  );
  return { onChange };
}

describe("SegmentedControl", () => {
  it("renders every segment label", () => {
    setup();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("marks the active segment as checked", () => {
    setup("open");
    const openItem = screen.getByText("Open").closest('[data-part="item"]');
    const historyItem = screen.getByText("History").closest('[data-part="item"]');
    expect(openItem).toHaveAttribute("data-state", "checked");
    expect(historyItem).toHaveAttribute("data-state", "unchecked");
  });

  it("reports a selection through onChange", async () => {
    const { onChange } = setup("open");
    await userEvent.click(screen.getByText("History"));
    expect(onChange).toHaveBeenCalledWith("history");
  });
});

// UI test: the editor tab strip. Renders a tab per open file, activates a tab
// on click, closes a tab via its × button, honours the `tabBar` setting
// (multiple / single / hidden), and stays reactive to a single store change per
// test. Pointer drag-reorder is deliberately not exercised (fragile in jsdom).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Tabs } from "../Tabs";
import { useProject, useSettings } from "../../../lib/store";

// Seed just the slice Tabs reads (the store's action functions stay intact).
// `closedTabs` is needed because close() pushes onto it.
beforeEach(() => {
  useProject.setState({
    tabs: ["/proj/src/a.ts", "/proj/src/b.ts", "/proj/README.md"],
    active: "/proj/src/a.ts",
    closedTabs: [],
  });
  useSettings.setState({ tabBar: "multiple" });
});

describe("Tabs", () => {
  it("renders a tab per open file, showing each basename", () => {
    render(<Tabs />);
    expect(screen.getByRole("tab", { name: "a.ts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "b.ts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "README.md" })).toBeInTheDocument();
  });

  it("marks the active tab as selected", () => {
    render(<Tabs />);
    expect(screen.getByRole("tab", { name: "a.ts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "b.ts" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("activates a tab when it is clicked", async () => {
    render(<Tabs />);
    await userEvent.click(screen.getByRole("tab", { name: "b.ts" }));
    expect(useProject.getState().active).toBe("/proj/src/b.ts");
    // Reactive re-render reflects the new selection.
    expect(screen.getByRole("tab", { name: "b.ts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("closes a tab via its × button, removing it from the store", async () => {
    render(<Tabs />);
    await userEvent.click(
      screen.getByRole("button", { name: "Close b.ts" }),
    );
    expect(useProject.getState().tabs).toEqual([
      "/proj/src/a.ts",
      "/proj/README.md",
    ]);
    expect(screen.queryByRole("tab", { name: "b.ts" })).not.toBeInTheDocument();
  });

  it('shows only the active file in "single" tabBar mode', () => {
    useSettings.setState({ tabBar: "single" });
    render(<Tabs />);
    expect(screen.getByRole("tab", { name: "a.ts" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "b.ts" })).not.toBeInTheDocument();
  });

  it('renders nothing when tabBar is "hidden"', () => {
    useSettings.setState({ tabBar: "hidden" });
    const { container } = render(<Tabs />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no open tabs", () => {
    useProject.setState({ tabs: [], active: null });
    const { container } = render(<Tabs />);
    expect(container).toBeEmptyDOMElement();
  });
});

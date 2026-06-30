// The Windows/Linux rendered menu bar: clicking a top-level label opens its
// dropdown, items dispatch through runMenuCommand, and the menu dismisses on
// item-select / Escape / outside click. Hovering switches menus once one is open.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { runMenuCommand } = vi.hoisted(() => ({ runMenuCommand: vi.fn() }));
vi.mock("../../lib/menu", () => ({ runMenuCommand }));

import { MenuBar } from "./MenuBar";

beforeEach(() => runMenuCommand.mockClear());

describe("MenuBar", () => {
  it("renders the top-level menu labels", () => {
    render(<MenuBar />);
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("opens a dropdown with the menu's items on click", async () => {
    render(<MenuBar />);
    await userEvent.click(screen.getByRole("button", { name: "File" }));
    expect(screen.getByRole("button", { name: "New File…" })).toBeInTheDocument();
    // A header from the File menu is rendered (non-clickable).
    expect(screen.getByText("Auto Save")).toBeInTheDocument();
  });

  it("clicking the same label again closes the dropdown", async () => {
    render(<MenuBar />);
    const file = screen.getByRole("button", { name: "File" });
    await userEvent.click(file);
    expect(screen.getByRole("button", { name: "New File…" })).toBeInTheDocument();
    await userEvent.click(file);
    expect(screen.queryByRole("button", { name: "New File…" })).not.toBeInTheDocument();
  });

  it("selecting an item runs its command and closes the menu", async () => {
    render(<MenuBar />);
    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.click(screen.getByRole("button", { name: "New File…" }));
    expect(runMenuCommand).toHaveBeenCalledWith("newFile");
    expect(screen.queryByRole("button", { name: "Open File…" })).not.toBeInTheDocument();
  });

  it("hovering another label switches the open menu", async () => {
    render(<MenuBar />);
    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.hover(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Find…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New File…" })).not.toBeInTheDocument();
  });

  it("Escape closes the open menu", async () => {
    render(<MenuBar />);
    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "New File…" })).not.toBeInTheDocument();
  });

  it("an outside mousedown closes the open menu", async () => {
    render(<MenuBar />);
    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "New File…" })).not.toBeInTheDocument();
  });
});

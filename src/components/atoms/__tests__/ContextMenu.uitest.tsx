// Cross-OS UI test: the shared right-click menu renders items and dismisses
// consistently. Pure component (no Tauri) — runs on macOS / Windows / Linux.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

function setup(extra: Partial<ContextMenuItem>[] = []) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const items: ContextMenuItem[] = [
    { label: "Comment on file", onSelect },
    { label: "Delete", onSelect: vi.fn(), danger: true },
    ...extra.map((e) => ({ label: "X", onSelect: vi.fn(), ...e })),
  ];
  render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);
  return { onClose, onSelect };
}

describe("ContextMenu", () => {
  it("renders every item as a menuitem", () => {
    setup();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Comment on file")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("selecting an item fires its action and closes the menu", async () => {
    const { onClose, onSelect } = setup();
    await userEvent.click(screen.getByText("Comment on file"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the menu", async () => {
    const { onClose } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("a disabled item is not actionable", async () => {
    const disabledSelect = vi.fn();
    setup([{ label: "Disabled", onSelect: disabledSelect, disabled: true }]);
    const btn = screen.getByText("Disabled").closest("button")!;
    expect(btn).toBeDisabled();
    await userEvent.click(btn).catch(() => {});
    expect(disabledSelect).not.toHaveBeenCalled();
  });
});
